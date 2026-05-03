import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import {
  AccountStateGuard,
  RequiresVerifiedEmail,
} from '../common/guards/account-state.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { EscrowService } from './escrow.service';

@ApiTags('Escrow')
@Controller('escrow')
export class EscrowController {
  constructor(private readonly escrowService: EscrowService) {}

  @Post('collaboration/:collaborationId')
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('EMPLOYER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create escrow for a collaboration (employer)' })
  create(
    @Param('collaborationId', ParseBigIntPipe) collaborationId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateEscrowDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.escrowService.create(
      collaborationId,
      user.clientProfileId,
      dto,
    );
  }

  @Get('collaboration/:collaborationId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get escrow for a collaboration (participant or staff)',
  })
  getByCollaboration(
    @Param('collaborationId', ParseBigIntPipe) collaborationId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.escrowService.getByCollaboration(collaborationId, user);
  }

  @Post(':id/deposit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate deposit (employer)' })
  initiateDeposit(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.escrowService.initiateDeposit(id, user.clientProfileId);
  }

  @Post(':id/confirm-deposit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm deposit held (webhook / staff)' })
  confirmDeposit(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.escrowService.confirmDeposit(id);
  }

  @Post(':id/release')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Release funds to worker (staff)' })
  release(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.escrowService.release(id);
  }

  @Post(':id/refund')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refund escrow (staff)' })
  refund(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.escrowService.refund(id);
  }

  @Post(':id/dispute')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark escrow disputed (worker or employer)' })
  dispute(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.escrowService.dispute(id, user);
  }
}
