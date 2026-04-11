import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  controllers: [ReviewController],
  providers: [ReviewService, RolesGuard],
})
export class ReviewModule {}
