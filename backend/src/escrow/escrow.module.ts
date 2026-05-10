import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { ConversationModule } from '../conversation/conversation.module';
import { ReferralModule } from '../referral/referral.module';
import { EscrowAutoReleaseJob } from './escrow-auto-release.job';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';

@Module({
  imports: [AuditModule, ConversationModule, ReferralModule],
  controllers: [EscrowController],
  providers: [EscrowService, EscrowAutoReleaseJob, RolesGuard],
  exports: [EscrowService],
})
export class EscrowModule {}
