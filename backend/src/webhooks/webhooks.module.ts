import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VerificationModule } from '../verification/verification.module';
import { StripeWebhookController } from './stripe.controller';
import { StripeWebhookService } from './stripe.service';

@Module({
  imports: [PrismaModule, VerificationModule],
  controllers: [StripeWebhookController],
  providers: [StripeWebhookService],
})
export class WebhooksModule {}
