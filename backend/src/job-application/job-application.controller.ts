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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { ApplicationQueryDto } from './dto/application-query.dto';
import { ApplyJobDto } from './dto/apply-job.dto';
import { InviteWorkerDto } from './dto/invite-worker.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { JobApplicationService } from './job-application.service';
import { CisService } from '../cis/cis.service';

@ApiTags('Job Applications')
@Controller('job-applications')
export class JobApplicationController {
  constructor(
    private readonly jobApplicationService: JobApplicationService,
    private readonly cis: CisService,
  ) {}

  @Post('jobs/:jobPostId/apply')
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('WORKER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apply to a job post as a worker' })
  async apply(
    @Param('jobPostId', ParseBigIntPipe) jobPostId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ApplyJobDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    // CIS apply-gate: a worker must have a confirmed CIS standing before
    // applying for work (throws CIS_NOT_CONFIRMED while status is NONE).
    await this.cis.assertWorkerCanApply(user.clientProfileId);
    return this.jobApplicationService.apply(
      jobPostId,
      user.clientProfileId,
      dto,
    );
  }

  @Post('jobs/:jobPostId/invite')
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('EMPLOYER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a worker to a job post' })
  invite(
    @Param('jobPostId', ParseBigIntPipe) jobPostId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: InviteWorkerDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.jobApplicationService.invite(
      jobPostId,
      BigInt(dto.worker_id),
      user.clientProfileId,
      dto.message,
    );
  }

  @Get('jobs/:jobPostId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List applications for a job post (owner only)' })
  getByJobPost(
    @Param('jobPostId', ParseBigIntPipe) jobPostId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ApplicationQueryDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.jobApplicationService.getByJobPost(
      jobPostId,
      user.clientProfileId,
      query,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my job applications and invitations' })
  getMine(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ApplicationQueryDto,
  ) {
    if (user.clientProfileId == null || !user.isWorker) {
      throw new BadRequestException('Worker profile required');
    }
    return this.jobApplicationService.getMyApplications(
      user.clientProfileId,
      query,
    );
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update application status' })
  updateStatus(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.jobApplicationService.updateStatus(
      id,
      dto.status,
      user.clientProfileId,
    );
  }

  @Post(':id/to-collaboration')
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('EMPLOYER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Convert an accepted application into a collaboration',
  })
  toCollaboration(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.jobApplicationService.toCollaboration(id, user.clientProfileId);
  }
}
