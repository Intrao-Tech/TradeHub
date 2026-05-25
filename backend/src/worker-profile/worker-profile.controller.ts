import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { SavedWorkerService } from '../saved-worker/saved-worker.service';
import { WorkerProfileService } from './worker-profile.service';
import { LinkSpecialisationDto } from './dto/link-specialisation.dto';
import { UpdateWorkerProfileDto } from './dto/update-worker-profile.dto';
import { WorkerSearchQueryDto } from './dto/worker-search-query.dto';

@ApiTags('Worker profiles')
@Controller('worker-profiles')
export class WorkerProfileController {
  constructor(
    private readonly workerProfileService: WorkerProfileService,
    private readonly savedWorkerService: SavedWorkerService,
  ) {}

  // Returns null when the caller is not an authenticated employer — only
  // employer accounts can save workers, so enrichment is a no-op otherwise.
  private employerIdFromUser(
    user: CurrentUserPayload | undefined,
  ): bigint | null {
    if (!user || !user.isEmployer || user.clientProfileId == null) return null;
    return user.clientProfileId;
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Search worker profiles (public; adds is_saved when the caller is an authenticated employer)',
  })
  async search(
    @Query() query: WorkerSearchQueryDto,
    @CurrentUser() user: CurrentUserPayload | undefined,
  ) {
    const result = await this.workerProfileService.search(query);
    const employerId = this.employerIdFromUser(user);
    if (employerId == null) {
      return {
        ...result,
        data: result.data.map((item) => ({ ...item, is_saved: false })),
      };
    }
    const savedIds = await this.savedWorkerService.savedIdsForEmployer(
      employerId,
      result.data.map((item) => item.id),
    );
    return {
      ...result,
      data: result.data.map((item) => ({
        ...item,
        is_saved: savedIds.has(item.id),
      })),
    };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own worker profile' })
  updateMe(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateWorkerProfileDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.workerProfileService.update(user.clientProfileId, dto);
  }

  @Post('me/specialisations/:specialisationId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Link a specialisation to my worker profile (PROF-036)',
  })
  linkSpecialisation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('specialisationId', ParseIntPipe) specialisationId: number,
    @Body() dto: LinkSpecialisationDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.workerProfileService.linkSpecialisation(
      user.clientProfileId,
      specialisationId,
      dto.is_primary ?? false,
    );
  }

  @Delete('me/specialisations/:specialisationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unlink a specialisation from my worker profile' })
  async unlinkSpecialisation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('specialisationId', ParseIntPipe) specialisationId: number,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    await this.workerProfileService.unlinkSpecialisation(
      user.clientProfileId,
      specialisationId,
    );
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Worker profile by id (public; adds is_saved when the caller is an authenticated employer)',
  })
  async getById(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload | undefined,
  ) {
    const worker = await this.workerProfileService.getById(id);
    const employerId = this.employerIdFromUser(user);
    if (employerId == null) return { ...worker, is_saved: false };
    const savedIds = await this.savedWorkerService.savedIdsForEmployer(
      employerId,
      [worker.id],
    );
    return { ...worker, is_saved: savedIds.has(worker.id) };
  }
}
