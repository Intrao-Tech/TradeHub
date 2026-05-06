import { Module } from '@nestjs/common';
import { JobAttachmentCleanupJob } from './job-attachment.cleanup.job';
import { JobAttachmentController } from './job-attachment.controller';
import { JobAttachmentService } from './job-attachment.service';

@Module({
  controllers: [JobAttachmentController],
  providers: [JobAttachmentService, JobAttachmentCleanupJob],
  exports: [JobAttachmentService],
})
export class JobAttachmentModule {}
