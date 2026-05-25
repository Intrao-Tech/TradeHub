import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { SavedWorkerController } from './saved-worker.controller';
import { SavedWorkerService } from './saved-worker.service';

@Module({
  controllers: [SavedWorkerController],
  providers: [SavedWorkerService, RolesGuard],
  exports: [SavedWorkerService],
})
export class SavedWorkerModule {}
