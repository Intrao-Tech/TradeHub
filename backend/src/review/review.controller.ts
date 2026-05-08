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
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import {
  AccountStateGuard,
  RequiresVerifiedEmail,
} from '../common/guards/account-state.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { ReviewService } from './review.service';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post('collaboration/:collaborationId')
  @UseGuards(JwtAuthGuard, AccountStateGuard)
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a review for a completed collaboration' })
  async create(
    @Param('collaborationId', ParseBigIntPipe) collaborationId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateReviewDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.reviewService.create(
      collaborationId,
      user.clientProfileId,
      dto,
    );
  }

  @Get('collaboration/:collaborationId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List reviews for a collaboration' })
  async getByCollaboration(
    @Param('collaborationId', ParseBigIntPipe) collaborationId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.reviewService.assertCollaborationParticipant(
      collaborationId,
      user,
    );
    return this.reviewService.getByCollaboration(collaborationId);
  }

  @Get('unpublished')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List unpublished reviews (staff publish queue)' })
  getUnpublished(@Query() query: ReviewQueryDto) {
    return this.reviewService.getUnpublished(query);
  }

  @Get('worker/:workerId')
  @ApiOperation({
    summary: 'Published reviews about a worker (from employers)',
  })
  getForWorker(
    @Param('workerId', ParseBigIntPipe) workerId: bigint,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviewService.getBySubject(workerId, query, 'WORKER');
  }

  @Get('employer/:employerId')
  @ApiOperation({
    summary: 'Published reviews about an employer (from workers)',
  })
  getForEmployer(
    @Param('employerId', ParseBigIntPipe) employerId: bigint,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviewService.getBySubject(employerId, query, 'EMPLOYER');
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Get a single review (public if published; else author or staff)',
  })
  getById(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.reviewService.getById(id, user);
  }

  @Patch(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish a review (staff)' })
  publish(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.reviewService.publish(id);
  }
}
