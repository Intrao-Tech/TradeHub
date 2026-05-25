import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { SavedJobService } from './saved-job.service';

class SavedJobQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// Lives under its own /saved-jobs prefix instead of /job-posts/* to avoid
// a route collision with JobPostController's `GET /job-posts/:id` (where
// the literal segment "saved" would parse as `:id` and trip ParseBigIntPipe).
@ApiTags('Saved Jobs')
@Controller('saved-jobs')
export class SavedJobController {
  constructor(private readonly savedJobService: SavedJobService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the current worker's saved job posts" })
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: SavedJobQueryDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('Worker profile required');
    }
    return this.savedJobService.listForWorker(
      user.clientProfileId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Post(':jobPostId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save a job post (idempotent)' })
  save(
    @Param('jobPostId', ParseBigIntPipe) jobPostId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('Worker profile required');
    }
    return this.savedJobService.save(user.clientProfileId, jobPostId);
  }

  @Delete(':jobPostId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a job post from saved (idempotent)' })
  async unsave(
    @Param('jobPostId', ParseBigIntPipe) jobPostId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('Worker profile required');
    }
    await this.savedJobService.unsave(user.clientProfileId, jobPostId);
  }
}
