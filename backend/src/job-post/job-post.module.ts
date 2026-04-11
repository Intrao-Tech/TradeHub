import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { JobPostController } from './job-post.controller';
import { JobPostService } from './job-post.service';

@Module({
  controllers: [JobPostController],
  providers: [JobPostService, RolesGuard],
})
export class JobPostModule {}
