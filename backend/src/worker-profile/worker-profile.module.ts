import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkerProfileService } from './worker-profile.service';
import { WorkerProfileController } from './worker-profile.controller';

@Module({
  controllers: [WorkerProfileController],
  providers: [WorkerProfileService, RolesGuard],
})
export class WorkerProfileModule {}
