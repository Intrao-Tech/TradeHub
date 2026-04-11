import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { EmployerProfileService } from './employer-profile.service';
import { EmployerProfileController } from './employer-profile.controller';

@Module({
  controllers: [EmployerProfileController],
  providers: [EmployerProfileService, RolesGuard],
})
export class EmployerProfileModule {}
