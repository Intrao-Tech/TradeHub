import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
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
import { EscrowModule } from './escrow/escrow.module';
import { ModerationModule } from './moderation/moderation.module';
import { NotificationModule } from './notification/notification.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { AuditModule } from './audit/audit.module';
import { JobPostModule } from './job-post/job-post.module';
import { JobApplicationModule } from './job-application/job-application.module';
import { ConversationModule } from './conversation/conversation.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { StripeModule } from './stripe/stripe.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
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
    CollaborationModule,
    PortfolioModule,
    ModerationModule,
    NotificationModule,
    SubscriptionModule,
    AuditModule,
    JobPostModule,
    JobApplicationModule,
    ConversationModule,
    WebhooksModule,
  ],
})
export class AppModule {}
