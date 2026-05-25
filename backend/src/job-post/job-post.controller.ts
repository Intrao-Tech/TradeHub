import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { SavedJobService } from '../saved-job/saved-job.service';
import { CreateJobPostDto } from './dto/create-job-post.dto';
import { JobPostQueryDto } from './dto/job-post-query.dto';
import { UpdateJobPostDto } from './dto/update-job-post.dto';
import { JobPostService } from './job-post.service';

@ApiTags('Job posts')
@Controller('job-posts')
export class JobPostController {
  constructor(
    private readonly jobPostService: JobPostService,
    private readonly savedJobService: SavedJobService,
  ) {}

  // Returns null when the caller is not an authenticated worker — only
  // worker accounts can save jobs, so enrichment is a no-op otherwise.
  private workerIdFromUser(user: CurrentUserPayload | undefined): bigint | null {
    if (!user || !user.isWorker || user.clientProfileId == null) return null;
    return user.clientProfileId;
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('EMPLOYER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a job post' })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateJobPostDto,
  ) {
    if (!user.isEmployer) {
      throw new BadRequestException('Only employers can create job posts');
    }
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.jobPostService.create(dto, user.clientProfileId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYER')
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the current employer's job posts" })
  findMyPosts(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: JobPostQueryDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.jobPostService.findMyPosts(user.clientProfileId, query);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'List and search job posts (public; adds is_saved when the caller is an authenticated worker)',
  })
  async findAll(
    @Query() query: JobPostQueryDto,
    @CurrentUser() user: CurrentUserPayload | undefined,
  ) {
    const result = await this.jobPostService.findAll(query);
    const workerId = this.workerIdFromUser(user);
    if (workerId == null) {
      return {
        ...result,
        items: result.items.map((item) => ({ ...item, is_saved: false })),
      };
    }
    const savedIds = await this.savedJobService.savedIdsForWorker(
      workerId,
      result.items.map((item) => item.id),
    );
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        is_saved: savedIds.has(item.id),
      })),
    };
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Get job post by id (public; adds is_saved when the caller is an authenticated worker)',
  })
  async findOne(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload | undefined,
  ) {
    const post = await this.jobPostService.findById(id);
    const workerId = this.workerIdFromUser(user);
    if (workerId == null) return { ...post, is_saved: false };
    const savedIds = await this.savedJobService.savedIdsForWorker(workerId, [
      post.id,
    ]);
    return { ...post, is_saved: savedIds.has(post.id) };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a job post (owner only)' })
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateJobPostDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.jobPostService.update(id, dto, user.clientProfileId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a job post (owner only)' })
  remove(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.jobPostService.delete(id, user.clientProfileId);
  }
}
