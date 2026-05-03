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
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { CreateJobPostDto } from './dto/create-job-post.dto';
import { JobPostQueryDto } from './dto/job-post-query.dto';
import { UpdateJobPostDto } from './dto/update-job-post.dto';
import { JobPostService } from './job-post.service';

@ApiTags('Job posts')
@Controller('job-posts')
export class JobPostController {
  constructor(private readonly jobPostService: JobPostService) {}

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
  @ApiOperation({ summary: 'List and search job posts (public)' })
  findAll(@Query() query: JobPostQueryDto) {
    return this.jobPostService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job post by id (public)' })
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.jobPostService.findById(id);
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
