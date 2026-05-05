import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { VerificationModule } from '../verification/verification.module';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';

@Module({
  imports: [AuditModule, VerificationModule],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
