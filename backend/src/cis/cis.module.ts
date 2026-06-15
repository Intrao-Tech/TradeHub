import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CisService } from './cis.service';
import { CisReturnService } from './cis-return.service';
import { CisController } from './cis.controller';

/**
 * CIS (HMRC Construction Industry Scheme). PrismaService is global; AuditModule
 * supplies the audit logger. CisService is exported so the escrow release flow,
 * the job-application apply-gate and the verification review can reuse it.
 */
@Module({
  imports: [AuditModule],
  providers: [CisService, CisReturnService],
  controllers: [CisController],
  exports: [CisService, CisReturnService],
})
export class CisModule {}
