import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ConversationModule } from '../conversation/conversation.module';
import { ReferralModule } from '../referral/referral.module';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';

@Module({
  imports: [PrismaModule, AuditModule, ConversationModule, ReferralModule],
  providers: [ContractService],
  controllers: [ContractController],
  exports: [ContractService],
})
export class ContractModule {}
