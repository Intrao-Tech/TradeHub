import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

@Module({
  controllers: [PortfolioController],
  providers: [PortfolioService, RolesGuard],
})
export class PortfolioModule {}
