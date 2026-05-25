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
import { SavedWorkerService } from './saved-worker.service';

class SavedWorkerQueryDto {
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

// Mirrors SavedJobController. Lives under its own /saved-workers prefix
// (not nested under /worker-profiles/*) to avoid colliding with
// `GET /worker-profiles/:id` — the literal "saved" segment would otherwise
// parse as :id and trip ParseBigIntPipe.
@ApiTags('Saved Workers')
@Controller('saved-workers')
export class SavedWorkerController {
  constructor(private readonly savedWorkerService: SavedWorkerService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYER')
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the current employer's saved workers" })
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: SavedWorkerQueryDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('Employer profile required');
    }
    return this.savedWorkerService.listForEmployer(
      user.clientProfileId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Post(':workerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYER')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save a worker (idempotent)' })
  save(
    @Param('workerId', ParseBigIntPipe) workerId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('Employer profile required');
    }
    return this.savedWorkerService.save(user.clientProfileId, workerId);
  }

  @Delete(':workerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYER')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a worker from saved (idempotent)' })
  async unsave(
    @Param('workerId', ParseBigIntPipe) workerId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('Employer profile required');
    }
    await this.savedWorkerService.unsave(user.clientProfileId, workerId);
  }
}
