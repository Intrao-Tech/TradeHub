import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { STRIPE_CLIENT } from '../stripe/stripe.module';
import { MailService } from '../mail/mail.service';
import { VerificationService } from '../verification/verification.service';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);
  private readonly platformSecret: string;
  private readonly connectSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly mail: MailService,
    private readonly verification: VerificationService,
  ) {
    this.platformSecret =
      this.config.get<string>('STRIPE_WEBHOOK_SECRET') || '';
    this.connectSecret =
      this.config.get<string>('STRIPE_CONNECT_WEBHOOK_SECRET') || '';
  }

  /**
   * Verify a webhook payload. Tries the platform secret first, then the Connect
   * secret, so one endpoint can serve both destinations. Throws if neither
   * signature matches.
   */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.stripe) {
      throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing)');
    }
    const secrets = [this.platformSecret, this.connectSecret].filter(Boolean);
    if (secrets.length === 0) {
      throw new Error('No Stripe webhook secrets configured');
    }

    let lastErr: unknown = null;
    for (const secret of secrets) {
      try {
        return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error('Signature verification failed');
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    this.logger.log(`Stripe event ${event.id} :: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.onPaymentIntentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        await this.onPaymentIntentFailed(event.data.object);
        break;

      case 'charge.refunded':
        await this.onChargeRefunded(event.data.object);
        break;

      case 'charge.dispute.created':
        await this.onDisputeCreated(event.data.object);
        break;

      case 'charge.dispute.closed':
        this.onDisputeClosed(event.data.object);
        break;

      case 'transfer.created':
        await this.onTransferCreated(event.data.object);
        break;

      case 'transfer.reversed':
        this.logger.warn(`Transfer reversed: ${event.data.object.id}`);
        break;

      case 'checkout.session.completed':
        this.onCheckoutCompleted(event.data.object);
        break;

      case 'payout.paid':
      case 'payout.failed':
        this.logger.log(`Payout ${event.type} :: ${event.data.object.id}`);
        break;

      case 'account.updated':
      case 'account.application.authorized':
      case 'account.application.deauthorized':
      case 'capability.updated':
        this.logger.log(
          `Connect lifecycle :: ${event.type} on account ${event.account ?? '—'}`,
        );
        break;

      case 'identity.verification_session.verified':
      case 'identity.verification_session.requires_input':
        await this.verification.handleWebhookEvent(event);
        break;

      default:
        this.logger.debug(`Unhandled event type: ${event.type}`);
    }
  }

  // ─── Escrow handlers ───────────────────────────────────────────

  private async onPaymentIntentSucceeded(
    pi: Stripe.PaymentIntent,
  ): Promise<void> {
    const escrowId = this.extractEscrowId(pi.metadata);
    const latestCharge =
      typeof pi.latest_charge === 'string'
        ? pi.latest_charge
        : pi.latest_charge?.id;

    const escrow = await this.findEscrow(escrowId, pi.id);
    if (!escrow) {
      this.logger.warn(
        `payment_intent.succeeded :: no escrow matched for pi=${pi.id}`,
      );
      return;
    }

    await this.prisma.escrowTransaction.update({
      where: { id: escrow.id },
      data: {
        status: 'HELD',
        deposit_confirmed_at: new Date(),
        stripe_payment_intent_id: pi.id,
        stripe_charge_id: latestCharge ?? escrow.stripe_charge_id,
      },
    });
    this.logger.log(`Escrow ${escrow.id} marked HELD (pi=${pi.id})`);

    try {
      const full = await this.prisma.escrowTransaction.findUnique({
        where: { id: escrow.id },
        include: {
          collaboration: {
            include: {
              worker: {
                include: { client_profile: { include: { account: true } } },
              },
              employer: {
                include: { client_profile: { include: { account: true } } },
              },
            },
          },
        },
      });
      if (full) {
        const amountGbp = full.job_amount.toString();
        const workerEmail =
          full.collaboration.worker.client_profile.account.email;
        const workerName =
          full.collaboration.worker.client_profile.display_name;
        const employerEmail =
          full.collaboration.employer.client_profile.account.email;
        const employerName =
          full.collaboration.employer.client_profile.display_name;
        void this.mail.sendEscrowFunded(
          employerEmail,
          employerName,
          String(escrow.id),
          amountGbp,
        );
        void this.mail.sendEscrowFunded(
          workerEmail,
          workerName,
          String(escrow.id),
          amountGbp,
        );
      }
    } catch (err) {
      this.logger.warn('Failed to send escrow funded email', err);
    }
  }

  private async onPaymentIntentFailed(pi: Stripe.PaymentIntent): Promise<void> {
    const escrowId = this.extractEscrowId(pi.metadata);
    const escrow = await this.findEscrow(escrowId, pi.id);
    if (!escrow) return;

    await this.prisma.escrowTransaction.update({
      where: { id: escrow.id },
      data: { status: 'CREATED' },
    });
    this.logger.warn(`Escrow ${escrow.id} reset to CREATED (pi=${pi.id})`);
  }

  private async onChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const escrow = await this.prisma.escrowTransaction.findFirst({
      where: { stripe_charge_id: charge.id },
    });
    if (!escrow) {
      this.logger.warn(
        `charge.refunded :: no escrow matched for charge=${charge.id}`,
      );
      return;
    }

    const refundId = charge.refunds?.data?.[0]?.id;
    await this.prisma.escrowTransaction.update({
      where: { id: escrow.id },
      data: {
        status: 'REFUNDED',
        refunded_at: new Date(),
        stripe_refund_id: refundId,
      },
    });
    this.logger.log(
      `Escrow ${escrow.id} marked REFUNDED (charge=${charge.id})`,
    );
  }

  private async onDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
    const chargeId =
      typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
    const escrow = await this.prisma.escrowTransaction.findFirst({
      where: { stripe_charge_id: chargeId },
    });
    if (!escrow) {
      this.logger.warn(
        `dispute.created :: no escrow matched for charge=${chargeId}`,
      );
      return;
    }

    await this.prisma.escrowTransaction.update({
      where: { id: escrow.id },
      data: {
        status: 'DISPUTED',
        disputed_at: new Date(),
      },
    });
    this.logger.warn(
      `Escrow ${escrow.id} marked DISPUTED (dispute=${dispute.id})`,
    );
  }

  private onDisputeClosed(dispute: Stripe.Dispute): void {
    this.logger.log(
      `Dispute ${dispute.id} closed with status: ${dispute.status}`,
    );
  }

  private async onTransferCreated(transfer: Stripe.Transfer): Promise<void> {
    const escrowId = this.extractEscrowId(transfer.metadata);
    if (!escrowId) {
      this.logger.warn(
        `transfer.created :: no escrow_id in metadata for transfer=${transfer.id}`,
      );
      return;
    }

    const escrow = await this.prisma.escrowTransaction.findUnique({
      where: { id: escrowId },
    });
    if (!escrow) return;

    await this.prisma.escrowTransaction.update({
      where: { id: escrow.id },
      data: {
        status: 'RELEASED',
        released_at: new Date(),
        stripe_transfer_id: transfer.id,
      },
    });
    this.logger.log(
      `Escrow ${escrow.id} marked RELEASED (transfer=${transfer.id})`,
    );
  }

  private onCheckoutCompleted(session: Stripe.Checkout.Session): void {
    const pi =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!pi) return;
    this.logger.log(
      `Checkout session completed :: pi=${pi}, session=${session.id}`,
    );
    // payment_intent.succeeded will fire separately and do the actual work
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private extractEscrowId(
    metadata: Stripe.Metadata | null | undefined,
  ): bigint | null {
    const raw = metadata?.escrow_id;
    if (!raw) return null;
    try {
      return BigInt(raw);
    } catch {
      return null;
    }
  }

  private async findEscrow(escrowId: bigint | null, paymentIntentId: string) {
    if (escrowId) {
      const byId = await this.prisma.escrowTransaction.findUnique({
        where: { id: escrowId },
      });
      if (byId) return byId;
    }
    return this.prisma.escrowTransaction.findFirst({
      where: { stripe_payment_intent_id: paymentIntentId },
    });
  }
}
