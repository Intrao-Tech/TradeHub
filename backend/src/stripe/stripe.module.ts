import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export const STRIPE_CLIENT = 'STRIPE_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: STRIPE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Stripe | null => {
        const apiKey = config.get<string>('STRIPE_SECRET_KEY') || '';
        return apiKey ? new Stripe(apiKey) : null;
      },
    },
  ],
  exports: [STRIPE_CLIENT],
})
export class StripeModule {}
