import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { STRIPE_CLIENT } from '../stripe/stripe.module';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
  ) {}

  async createSession(accountId: bigint) {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }

    const profile = await this.prisma.clientProfile.findUnique({
      where: { id: accountId },
      include: { account: true },
    });
    if (!profile) {
      throw new BadRequestException('No client profile found');
    }

    if (profile.verification_level === 'IDENTITY_VERIFIED') {
      throw new BadRequestException('Already verified');
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const session = await this.stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: {
        account_id: accountId.toString(),
        client_profile_id: profile.id.toString(),
      },
      options: {
        document: {
          allowed_types: ['driving_license', 'passport', 'id_card'],
          require_matching_selfie: true,
        },
      },
      return_url: `${frontendUrl}/profile?verification=complete`,
    });

    return {
      verification_url: session.url,
      session_id: session.id,
      status: session.status,
    };
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    if (event.type !== 'identity.verification_session.verified' &&
        event.type !== 'identity.verification_session.requires_input') {
      return;
    }

    const session = event.data.object as Stripe.Identity.VerificationSession;
    const accountIdStr = session.metadata?.account_id;
    if (!accountIdStr) {
      this.logger.warn(`Verification event without account_id in metadata: ${session.id}`);
      return;
    }

    const accountId = BigInt(accountIdStr);

    if (event.type === 'identity.verification_session.verified') {
      await this.prisma.clientProfile.update({
        where: { id: accountId },
        data: { verification_level: 'IDENTITY_VERIFIED' },
      });
      this.logger.log(`Account ${accountId} verified via Stripe Identity session ${session.id}`);
    } else {
      this.logger.warn(
        `Verification requires input for account ${accountId}, session ${session.id}: ${session.last_error?.code ?? 'unknown'}`,
      );
    }
  }

  async getStatus(accountId: bigint) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { id: accountId },
      select: { verification_level: true },
    });
    return { verification_level: profile?.verification_level ?? 'UNVERIFIED' };
  }
}
