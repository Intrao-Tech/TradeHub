import { Module, forwardRef } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditModule } from '../audit/audit.module';
import { ConversationModule } from '../conversation/conversation.module';
import { ReferralModule } from '../referral/referral.module';
import { HandoffModule } from '../handoff/handoff.module';
import { CisModule } from '../cis/cis.module';
import { NotificationModule } from '../notification/notification.module';
import { JobApplicationController } from './job-application.controller';
import { JobApplicationService } from './job-application.service';

@Module({
  imports: [
    AuditModule,
    ReferralModule,
    HandoffModule,
    CisModule,
    NotificationModule,
    forwardRef(() => ConversationModule),
  ],
  controllers: [JobApplicationController],
  providers: [JobApplicationService, RolesGuard],
})
export class JobApplicationModule {}
