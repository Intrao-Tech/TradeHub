import { Module, forwardRef } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { ConversationModule } from '../conversation/conversation.module';
import { CollaborationController } from './collaboration.controller';
import { CollaborationService } from './collaboration.service';

@Module({
  imports: [forwardRef(() => ConversationModule)],
  controllers: [CollaborationController],
  providers: [CollaborationService, RolesGuard],
  exports: [CollaborationService],
})
export class CollaborationModule {}
