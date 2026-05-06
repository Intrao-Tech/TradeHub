import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CompaniesHouseService } from './companies-house.service';
import { DocumentAssignmentService } from './document-assignment.service';
import { DocumentReviewService } from './document-review.service';
import { QueueService } from './queue.service';
import { VerificationService } from './verification.service';
import { AssignDocumentDto } from './dto/assign-document.dto';
import { QueueQueryDto } from './dto/queue-query.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';

@ApiTags('Verification')
@Controller('verification')
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly queueService: QueueService,
    private readonly reviewService: DocumentReviewService,
    private readonly assignmentService: DocumentAssignmentService,
    private readonly companiesHouseService: CompaniesHouseService,
    private readonly config: ConfigService,
  ) {}

  // ─── Reads ─────────────────────────────────────────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Comprehensive view of the current user's verification state (level, milestones, documents grouped by status, next action).",
  })
  getMe(@CurrentUser() user: CurrentUserPayload) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.verificationService.getMe(user.clientProfileId);
  }

  @Get('levels/:clientProfileId')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Public read of a profile verification level (badge-only). Returns 404 for deactivated accounts.',
  })
  getLevel(@Param('clientProfileId', ParseBigIntPipe) clientProfileId: bigint) {
    return this.verificationService.getPublicLevel(clientProfileId);
  }

  @Get('ladder/:clientProfileId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Trust-ladder panel data (per-rung state, next action, time-to-complete copy). Owner or staff only.',
  })
  getLadder(
    @Param('clientProfileId', ParseBigIntPipe) clientProfileId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.verificationService.getLadder(clientProfileId, {
      clientProfileId: user.clientProfileId,
      isStaff: user.isStaff,
    });
  }

  // ─── Stripe Identity ──────────────────────────────────────────

  @Post('identity/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } }) // 5/hour per IP
  @ApiOperation({
    summary:
      'Start a Stripe Identity verification session (path to Basic). Returns the hosted URL.',
  })
  startIdentity(@CurrentUser() user: CurrentUserPayload, @Ip() ip: string) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.verificationService.startIdentitySession(
      user.clientProfileId,
      ip,
    );
  }

  @Get('identity/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Most-recent Stripe Identity session status for the current user (diagnostic polling).',
  })
  getIdentityStatus(@CurrentUser() user: CurrentUserPayload) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.verificationService.getIdentityStatus(user.clientProfileId);
  }

  // ─── Companies House ──────────────────────────────────────────

  @Post('employer/companies-house-verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYER')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @ApiOperation({
    summary:
      "Verify the current employer's company against Companies House. Auto-check via free public API.",
  })
  verifyCompaniesHouse(
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.companiesHouseService.verifyEmployer(user.clientProfileId, ip);
  }

  // ─── Queue (staff) ────────────────────────────────────────────

  @Get('queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 120, ttl: 60 * 1000 } })
  @ApiOperation({
    summary:
      'Paginated review queue. Default scope: assignment=mine for moderators, all for admins.',
  })
  listQueue(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: QueueQueryDto,
  ) {
    if (!user.isStaff) {
      throw new BadRequestException({ code: 'STAFF_ONLY' });
    }
    return this.queueService.list(
      { staffMemberId: user.accountId, isAdmin: user.staffRole === 'ADMIN' },
      query,
    );
  }

  @Get('queue/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Single queue item with uploader profile snippet, assignee/reviewer, and prior history of same-doc-type submissions.',
  })
  getQueueItem(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.queueService.getOne(id);
  }

  // ─── Document review (staff) ──────────────────────────────────

  @Post('documents/:id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } })
  @ApiOperation({
    summary:
      'Approve or reject a document. The single canonical staff decision endpoint — replaces the deprecated PATCH /documents/:id/status.',
  })
  reviewDocument(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ReviewDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.reviewService.review(id, dto.decision, dto.reason, {
      accountId: user.accountId,
      staffMemberId: user.accountId,
      isAdmin: user.staffRole === 'ADMIN',
      ip,
    });
  }

  @Post('documents/:id/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Manually assign a document to a staff member, or null to clear. Admin-only.',
  })
  async assignDocument(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: AssignDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    const targetId =
      dto.staff_member_id != null ? BigInt(dto.staff_member_id) : null;
    const result = await this.assignmentService.assignToStaff(
      id,
      targetId,
      user.accountId,
      ip,
    );
    return {
      previous_assignee_id: result.from ? result.from.toString() : null,
      assigned_to: result.to ? result.to.toString() : null,
    };
  }

  @Post('documents/:id/claim')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Claim an unassigned document. Returns 409 ALREADY_ASSIGNED if the doc has someone else.',
  })
  async claimDocument(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    await this.assignmentService.claim(id, user.accountId, ip);
    return { ok: true, assigned_to: user.accountId.toString() };
  }

  // ─── Provider feature flag ────────────────────────────────────

  @Get('providers')
  @ApiOperation({
    summary:
      'Which verification providers are configured server-side (Stripe Identity, Companies House).',
  })
  getProviders() {
    return {
      stripe_identity: !!this.config.get<string>('STRIPE_SECRET_KEY'),
      companies_house: this.companiesHouseService.isConfigured(),
    };
  }

  // ─── Backward-compat: old POST /verification/start ────────────

  @Post('start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'DEPRECATED — use POST /verification/identity/start. Kept for one release; logs a deprecation warning.',
    deprecated: true,
  })
  startLegacy(@CurrentUser() user: CurrentUserPayload, @Ip() ip: string) {
    return this.startIdentity(user, ip);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'DEPRECATED — use GET /verification/me. Kept for one release.',
    deprecated: true,
  })
  async statusLegacy(@CurrentUser() user: CurrentUserPayload) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    const me = await this.verificationService.getMe(user.clientProfileId);
    return { verification_level: me.verification_level };
  }
}
