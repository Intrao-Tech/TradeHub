import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import {
  AccountStateGuard,
  RequiresVerifiedEmail,
} from '../common/guards/account-state.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { CreateHandoffDto } from './dto/create-handoff.dto';
import { HandoffService } from './handoff.service';

@ApiTags('Job Handoffs')
@Controller()
export class HandoffController {
  constructor(private readonly service: HandoffService) {}

  @Post('job-posts/:jobPostId/handoffs')
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('WORKER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hand an open job off to another worker' })
  create(
    @Param('jobPostId', ParseBigIntPipe) jobPostId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateHandoffDto,
  ) {
    if (user.clientProfileId == null || !user.isWorker) {
      throw new BadRequestException('Worker profile required');
    }
    return this.service.createHandoff(user.clientProfileId, jobPostId, dto);
  }

  // Public landing read: a logged-out friend sees the context and is prompted
  // to sign in. OptionalJwtAuthGuard populates req.user when a token is present.
  @Get('handoffs/by-token/:token')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Read a handoff by its share token' })
  getByToken(@Param('token') token: string, @Req() req: Request) {
    const user = req.user as CurrentUserPayload | undefined;
    const viewerWorkerId =
      user?.isWorker && user.clientProfileId != null
        ? user.clientProfileId
        : null;
    return this.service.getByToken(token, viewerWorkerId);
  }

  @Get('handoffs/mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List handoffs I made and handoffs sent to me' })
  mine(@CurrentUser() user: CurrentUserPayload) {
    if (user.clientProfileId == null || !user.isWorker) {
      throw new BadRequestException('Worker profile required');
    }
    return this.service.listMine(user.clientProfileId);
  }

  @Post('handoffs/:token/claim')
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('WORKER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Take a handoff (claim the link)' })
  claim(
    @Param('token') token: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null || !user.isWorker) {
      throw new BadRequestException('Worker profile required');
    }
    return this.service.claimHandoff(token, user.clientProfileId);
  }

  @Post('handoffs/:token/decline')
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('WORKER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Decline a handoff sent to me' })
  decline(
    @Param('token') token: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null || !user.isWorker) {
      throw new BadRequestException('Worker profile required');
    }
    return this.service.declineHandoff(token, user.clientProfileId);
  }

  @Post('handoffs/:id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('WORKER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a handoff I created' })
  revoke(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null || !user.isWorker) {
      throw new BadRequestException('Worker profile required');
    }
    return this.service.revokeHandoff(id, user.clientProfileId);
  }
}
