import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { JobApplicationController } from './job-application.controller';
import { JobApplicationService } from './job-application.service';

@Module({
  controllers: [JobApplicationController],
  providers: [JobApplicationService, RolesGuard],
})
export class JobApplicationModule {}
