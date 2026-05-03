import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { WorkerProfileService } from './worker-profile.service';
import { UpdateWorkerProfileDto } from './dto/update-worker-profile.dto';
import { WorkerSearchQueryDto } from './dto/worker-search-query.dto';

@ApiTags('Worker profiles')
@Controller('worker-profiles')
export class WorkerProfileController {
  constructor(private readonly workerProfileService: WorkerProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Search worker profiles' })
  search(@Query() query: WorkerSearchQueryDto) {
    return this.workerProfileService.search(query);
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

  @Get(':id')
  @ApiOperation({ summary: 'Worker profile by id' })
  getById(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.workerProfileService.getById(id);
  }
}
