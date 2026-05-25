import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { VerificationModule } from '../verification/verification.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [AuditModule, VerificationModule],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
