import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';

@Module({
  controllers: [ReferralController],
  providers: [ReferralService, RolesGuard],
})
export class ReferralModule {}
