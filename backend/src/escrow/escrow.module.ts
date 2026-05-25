import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ConversationModule } from '../conversation/conversation.module';
import { NotificationModule } from '../notification/notification.module';
import { ReferralModule } from '../referral/referral.module';
import { EscrowAutoReleaseJob } from './escrow-auto-release.job';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';
import { DisputeProposalService } from './dispute-proposal.service';

@Module({
  imports: [AuditModule, ConversationModule, ReferralModule, NotificationModule],
  controllers: [EscrowController],
  providers: [
    EscrowService,
    DisputeProposalService,
    EscrowAutoReleaseJob,
    RolesGuard,
    PermissionsGuard,
  ],
  exports: [EscrowService, DisputeProposalService],
})
export class EscrowModule {}
