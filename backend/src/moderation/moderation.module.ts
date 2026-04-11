import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  controllers: [ModerationController],
  providers: [ModerationService, RolesGuard],
  exports: [ModerationService],
})
export class ModerationModule {}
