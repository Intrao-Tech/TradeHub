import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from '../stripe/stripe.module';
import { VerificationService } from '../verification/verification.service';
import { EscrowService } from '../escrow/escrow.service';

/**
 * Stripe webhook dispatcher. Post-2026-05 schema rework there is no
 * `escrow_transaction` table — every milestone money movement is reconciled
 * through the `payment` ledger inside `EscrowService`. This service stays a
 * thin verifier + router; the escrow domain owns the state transitions.
 */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);
  private readonly platformSecret: string;
  private readonly connectSecret: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly verification: VerificationService,
    private readonly escrow: EscrowService,
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
        // Refunds are issued by EscrowService, which writes the REFUND ledger
        // row at issue time. This is confirmation only.
        this.logger.log(
          `charge.refunded :: charge=${event.data.object.id} — ledger already recorded`,
        );
        break;

      case 'charge.dispute.created':
        this.logger.warn(
          `Stripe card dispute opened :: charge=${
            typeof event.data.object.charge === 'string'
              ? event.data.object.charge
              : (event.data.object.charge?.id ?? '—')
          } dispute=${event.data.object.id}`,
        );
        break;

      case 'charge.dispute.closed':
        this.logger.log(
          `Stripe card dispute ${event.data.object.id} closed with status: ${event.data.object.status}`,
        );
        break;

      case 'transfer.created':
        await this.escrow.handleTransferPaid(event.data.object);
        break;

      case 'transfer.reversed':
        this.logger.warn(`Transfer reversed: ${event.data.object.id}`);
        await this.escrow.handleTransferFailed(event.data.object);
        break;

      case 'checkout.session.completed':
        this.onCheckoutCompleted(event.data.object);
        break;

      case 'payout.paid':
      case 'payout.failed':
        this.logger.log(`Payout ${event.type} :: ${event.data.object.id}`);
        break;

      case 'account.updated':
      case 'capability.updated':
        this.logger.log(
          `Connect lifecycle :: ${event.type} on account ${event.account ?? '—'}`,
        );
        await this.escrow.handleAccountUpdated(
          event.data.object as Stripe.Account,
        );
        break;

      case 'account.application.authorized':
        this.logger.log(
          `Connect application authorized on account ${event.account ?? '—'}`,
        );
        break;

      case 'account.application.deauthorized':
        this.logger.warn(
          `Connect deauthorized on account ${event.account ?? '—'}`,
        );
        if (event.account) {
          await this.escrow.handleAccountDeauthorizedById(event.account);
        }
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

  /**
   * `payment_intent.succeeded` — a milestone funding charge cleared. The
   * escrow domain writes the CHARGE ledger row + advances the milestone.
   */
  private async onPaymentIntentSucceeded(
    pi: Stripe.PaymentIntent,
  ): Promise<void> {
    if (pi.metadata?.milestone_id) {
      await this.escrow.handleMilestonePaymentSucceeded(pi);
      return;
    }
    this.logger.warn(
      `payment_intent.succeeded :: no milestone_id in metadata for pi=${pi.id} — ignoring`,
    );
  }

  /**
   * `payment_intent.payment_failed` / `.canceled` — the Checkout never
   * completed. The milestone stays PENDING so the employer can retry funding.
   */
  private async onPaymentIntentFailed(pi: Stripe.PaymentIntent): Promise<void> {
    if (pi.metadata?.milestone_id) {
      await this.escrow.handleMilestonePaymentFailed(pi);
      return;
    }
    this.logger.warn(
      `payment_intent.${pi.status} :: no milestone_id in metadata for pi=${pi.id}`,
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
    // payment_intent.succeeded fires separately and does the actual work.
  }
}
