import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import {
  AccountStateGuard,
  RequiresVerifiedEmail,
} from '../common/guards/account-state.guard';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { ContractService } from './contract.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { EndContractDto } from './dto/end-contract.dto';
import { RespondContractDto } from './dto/respond-contract.dto';

@Controller()
@UseGuards(JwtAuthGuard, AccountStateGuard)
@RequiresVerifiedEmail()
export class ContractController {
  constructor(private readonly service: ContractService) {}

  /** Create a new contract under a relationship (proposed). */
  @Post('collaborations/:id/contracts')
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseBigIntPipe) collabId: bigint,
    @Body() dto: CreateContractDto,
    @Headers('cookie') cookieHeader?: string,
  ) {
    return this.service.createContract(user.accountId, collabId, dto, {
      propose: true,
      cookieHeader,
    });
  }

  /**
   * Hire-again convenience endpoint — proposes a new Contract immediately
   * (the other party can Accept / Decline). Use POST `/collaborations/:id/contracts`
   * + propose=false if you ever need a true DRAFT.
   */
  @Post('collaborations/:id/hire-again')
  async hireAgain(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseBigIntPipe) collabId: bigint,
    @Body() dto: CreateContractDto,
    @Headers('cookie') cookieHeader?: string,
  ) {
    return this.service.createContract(user.accountId, collabId, dto, {
      propose: true,
      cookieHeader,
    });
  }

  @Get('contracts/:id')
  async get(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseBigIntPipe) contractId: bigint,
  ) {
    return this.service.getContract(user.accountId, contractId);
  }

  @Get('collaborations/:id/contracts')
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseBigIntPipe) collabId: bigint,
  ) {
    return this.service.listContractsForCollab(user.accountId, collabId);
  }

  @Post('contracts/:id/propose')
  async propose(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseBigIntPipe) contractId: bigint,
  ) {
    return this.service.proposeContract(user.accountId, contractId);
  }

  @Patch('contracts/:id/respond')
  async respond(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseBigIntPipe) contractId: bigint,
    @Body() dto: RespondContractDto,
  ) {
    return this.service.respondToContract(
      user.accountId,
      contractId,
      dto.accept,
    );
  }

  @Post('contracts/:id/end')
  async end(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseBigIntPipe) contractId: bigint,
    @Body() dto: EndContractDto,
  ) {
    return this.service.endContract(user.accountId, contractId, dto);
  }
}
