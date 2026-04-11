import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { CollaborationController } from './collaboration.controller';
import { CollaborationService } from './collaboration.service';

@Module({
  controllers: [CollaborationController],
  providers: [CollaborationService, RolesGuard],
})
export class CollaborationModule {}
