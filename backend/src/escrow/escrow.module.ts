import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';

@Module({
  controllers: [EscrowController],
  providers: [EscrowService, RolesGuard],
})
export class EscrowModule {}
