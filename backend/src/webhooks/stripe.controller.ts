import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { StripeWebhookService } from './stripe.service';

@ApiExcludeController()
@SkipThrottle()
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(private readonly service: StripeWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    if (!req.rawBody) {
      throw new BadRequestException(
        'Missing raw body — rawBody must be enabled in main.ts',
      );
    }

    let event;
    try {
      event = this.service.constructEvent(req.rawBody, signature);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Signature verification failed';
      this.logger.warn(`Stripe signature verification failed: ${message}`);
      throw new BadRequestException(`Webhook Error: ${message}`);
    }

    try {
      await this.service.handleEvent(event);
    } catch (err) {
      // Log but still return 200 — Stripe will retry on non-2xx, and most of
      // our failures are idempotency / race issues that shouldn't trigger
      // retries. For true transient errors surface them by throwing instead.
      this.logger.error(`Error handling ${event.type}`, err as Error);
    }

    return { received: true };
  }
}
