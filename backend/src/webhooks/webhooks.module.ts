import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StripeWebhookController } from './stripe.controller';
import { StripeWebhookService } from './stripe.service';

@Module({
  imports: [PrismaModule],
  controllers: [StripeWebhookController],
  providers: [StripeWebhookService],
})
export class WebhooksModule {}
