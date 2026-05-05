import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { PromotionEngine } from './promotion-engine.service';
import { DocumentAssignmentService } from './document-assignment.service';
import { DocumentReviewService } from './document-review.service';
import { CompaniesHouseService } from './companies-house.service';
import { QueueService } from './queue.service';

@Module({
  imports: [AuditModule],
  controllers: [VerificationController],
  providers: [
    VerificationService,
    PromotionEngine,
    DocumentAssignmentService,
    DocumentReviewService,
    CompaniesHouseService,
    QueueService,
  ],
  exports: [
    VerificationService,
    PromotionEngine,
    DocumentAssignmentService,
  ],
})
export class VerificationModule {}
