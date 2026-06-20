import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notification/notification.module';
import { HandoffService } from './handoff.service';
import { HandoffController } from './handoff.controller';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    MailModule,
    AuditModule,
    NotificationModule,
  ],
  providers: [HandoffService],
  controllers: [HandoffController],
  exports: [HandoffService],
})
export class HandoffModule {}
