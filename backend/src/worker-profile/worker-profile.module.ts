import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { SavedWorkerModule } from '../saved-worker/saved-worker.module';
import { WorkerProfileService } from './worker-profile.service';
import { WorkerProfileController } from './worker-profile.controller';

@Module({
  imports: [SavedWorkerModule],
  controllers: [WorkerProfileController],
  providers: [WorkerProfileService, RolesGuard],
})
export class WorkerProfileModule {}
