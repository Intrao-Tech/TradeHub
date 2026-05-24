import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { SavedJobModule } from '../saved-job/saved-job.module';
import { JobPostController } from './job-post.controller';
import { JobPostService } from './job-post.service';

@Module({
  imports: [SavedJobModule],
  controllers: [JobPostController],
  providers: [JobPostService, RolesGuard],
})
export class JobPostModule {}
