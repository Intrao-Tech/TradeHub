import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { SavedJobController } from './saved-job.controller';
import { SavedJobService } from './saved-job.service';

@Module({
  controllers: [SavedJobController],
  providers: [SavedJobService, RolesGuard],
  exports: [SavedJobService],
})
export class SavedJobModule {}
