import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';

@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService, RolesGuard],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
