import { Module } from '@nestjs/common';
import { JobAttachmentController } from './job-attachment.controller';
import { JobAttachmentService } from './job-attachment.service';

@Module({
  controllers: [JobAttachmentController],
  providers: [JobAttachmentService],
  exports: [JobAttachmentService],
})
export class JobAttachmentModule {}
