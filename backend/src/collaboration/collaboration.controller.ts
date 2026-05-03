import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
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
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { CollaborationService } from './collaboration.service';
import {
  CollaborationQueryDto,
  CreateCollaborationDto,
  FlagCollaborationDto,
  UpdateCollaborationStatusDto,
} from './dto/collaboration.dto';

@ApiTags('Collaborations')
@Controller('collaborations')
export class CollaborationController {
  constructor(private readonly collaborationService: CollaborationService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('WORKER', 'EMPLOYER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a collaboration' })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCollaborationDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }

    if (
      dto.worker_id != null &&
      dto.employer_id != null
    ) {
      throw new BadRequestException(
        'Pass only worker_id (employer initiates) or only employer_id (worker initiates)',
      );
    }

    if (dto.employer_id != null && dto.worker_id == null) {
      if (!user.isWorker) {
        throw new BadRequestException('Only workers can invite an employer');
      }
      return this.collaborationService.create(
        dto,
        'WORKER',
        user.clientProfileId,
      );
    }

    if (dto.worker_id != null && dto.employer_id == null) {
      if (!user.isEmployer) {
        throw new BadRequestException('Only employers can invite a worker');
      }
      return this.collaborationService.create(
        dto,
        'EMPLOYER',
        user.clientProfileId,
      );
    }

    throw new BadRequestException(
      'Provide employer_id when inviting as worker, or worker_id when inviting as employer',
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List collaborations for the current user' })
  listMine(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: CollaborationQueryDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.collaborationService.getByUser(user.clientProfileId, query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get collaboration by id (participant or staff)' })
  getById(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.collaborationService.getByIdForUser(id, user);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update collaboration status' })
  updateStatus(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateCollaborationStatusDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.collaborationService.updateStatus(
      id,
      dto.status,
      user.clientProfileId,
    );
  }

  @Post(':id/flag')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Flag a collaboration' })
  flag(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: FlagCollaborationDto,
  ) {
    return this.collaborationService.flag(id, dto.reason, user);
  }
}
