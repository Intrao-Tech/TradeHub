import { Module } from '@nestjs/common';
import { MessageAttachmentController } from './message-attachment.controller';
import { MessageAttachmentService } from './message-attachment.service';

@Module({
  controllers: [MessageAttachmentController],
  providers: [MessageAttachmentService],
  exports: [MessageAttachmentService],
})
export class MessageAttachmentModule {}
