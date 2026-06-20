import { ExecutionContext, Injectable, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { AccountModule } from './account/account.module';
import { ClientProfileModule } from './client-profile/client-profile.module';
import { WorkerProfileModule } from './worker-profile/worker-profile.module';
import { EmployerProfileModule } from './employer-profile/employer-profile.module';
import { SpecialisationModule } from './specialisation/specialisation.module';
import { TagModule } from './tag/tag.module';
import { DocumentModule } from './document/document.module';
import { ReviewModule } from './review/review.module';
import { ReferralModule } from './referral/referral.module';
import { ContractModule } from './contract/contract.module';
import { EscrowModule } from './escrow/escrow.module';
import { NotificationModule } from './notification/notification.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { AuditModule } from './audit/audit.module';
import { JobPostModule } from './job-post/job-post.module';
import { JobApplicationModule } from './job-application/job-application.module';
import { HandoffModule } from './handoff/handoff.module';
import { JobAttachmentModule } from './job-attachment/job-attachment.module';
import { SavedJobModule } from './saved-job/saved-job.module';
import { SavedWorkerModule } from './saved-worker/saved-worker.module';
import { ConversationModule } from './conversation/conversation.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { VerificationModule } from './verification/verification.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { StripeModule } from './stripe/stripe.module';
import { MailModule } from './mail/mail.module';
import { StaffModule } from './staff/staff.module';
import { AdminModule } from './admin/admin.module';
import { SupportModule } from './support/support.module';
import { CisModule } from './cis/cis.module';
// Conditionally appended when NODE_ENV === 'test' to expose the test-only
// mailbox HTTP route used by the Playwright suite (Decisions Log 2026-05-03).
// The TestOnlyModule throws on mount in any other environment, so production
// exposure risk is zero.
import { TestOnlyModule } from './test-only/test-only.module';

const baseImports = [
  ConfigModule.forRoot({ isGlobal: true }),
  ScheduleModule.forRoot(),
  ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
  PrismaModule,
  CommonModule,
  StripeModule,
  MailModule,
  AuthModule,
  AccountModule,
  ClientProfileModule,
  WorkerProfileModule,
  EmployerProfileModule,
  SpecialisationModule,
  TagModule,
  DocumentModule,
  ReviewModule,
  ReferralModule,
  EscrowModule,
  ContractModule,
  CollaborationModule,
  PortfolioModule,
  NotificationModule,
  SubscriptionModule,
  AuditModule,
  JobPostModule,
  JobApplicationModule,
  HandoffModule,
  JobAttachmentModule,
  SavedJobModule,
  SavedWorkerModule,
  ConversationModule,
  VerificationModule,
  WebhooksModule,
  StaffModule,
  AdminModule,
  SupportModule,
  CisModule,
];

// `overrideGuard()` from @nestjs/testing does not replace APP_GUARD-bound
// classes (it only intercepts `@UseGuards()` decorators), so the test harness
// disables the throttler via this env var. The env var is read at request
// time (not module load time) so different test files can flip it freely.
// Production never sets this var.
@Injectable()
class EnvGatedThrottlerGuard extends ThrottlerGuard {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (process.env.DISABLE_APP_THROTTLER === 'true') return true;
    return super.canActivate(ctx);
  }
}

@Module({
  imports:
    process.env.NODE_ENV === 'test'
      ? [...baseImports, TestOnlyModule]
      : baseImports,
  providers: [{ provide: APP_GUARD, useClass: EnvGatedThrottlerGuard }],
})
export class AppModule {}
