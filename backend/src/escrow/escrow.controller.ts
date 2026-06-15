import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  AccountStateGuard,
  RequiresVerifiedEmail,
} from '../common/guards/account-state.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { FeePreviewQueryDto } from './dto/fee-preview-query.dto';
import {
  CancelEscrowDto,
  FileDisputeDto,
  ResolveDisputeDto,
  RespondDisputeDto,
} from './dto/file-dispute.dto';
import { RefundMilestoneDto } from './dto/refund-milestone.dto';
import { SubmitMilestoneDto } from './dto/submit-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import {
  DecideProposalDto,
  EscalateDisputeDto,
  ProposeResolutionDto,
} from './dto/dispute-proposal.dto';
import { EscrowService } from './escrow.service';
import { DisputeProposalService } from './dispute-proposal.service';

const MILESTONE_ATTACHMENT_SUBDIR = 'uploads/milestone-attachments';
const MILESTONE_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
const MILESTONE_ATTACHMENT_ALLOWED_MIMES: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

@ApiTags('Escrow')
@Controller('escrow')
export class EscrowController {
  constructor(
    private readonly escrowService: EscrowService,
    private readonly disputeProposals: DisputeProposalService,
  ) {}

  // ─── Connect onboarding (Slice A) ──────────────────────────────

  @Post('onboarding/start')
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('WORKER')
  @RequiresVerifiedEmail()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Start Stripe Connect Express onboarding (workers). Returns a hosted-onboarding URL.',
  })
  startOnboarding(@CurrentUser() user: CurrentUserPayload, @Ip() ip: string) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.startOnboarding(user.clientProfileId, ip);
  }

  @Get('onboarding/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Read current Stripe Connect onboarding status (capability flags + requirements). Returns onboarding_url if not yet payouts-enabled.',
  })
  getOnboardingStatus(@CurrentUser() user: CurrentUserPayload) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.getOnboardingStatus(user.clientProfileId);
  }

  // ─── Milestones + Fund (Slice B) ──────────────────────────────

  @Get(':contractId/milestones')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List milestones on a contract' })
  listMilestones(@Param('contractId', ParseBigIntPipe) contractId: bigint) {
    return this.escrowService.listMilestones(contractId);
  }

  @Post(':contractId/milestones')
  @UseGuards(JwtAuthGuard, AccountStateGuard)
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Add a milestone to a contract. Employer creates → status=PENDING (immediately fundable). Worker creates → status=REQUESTED (employer must approve).',
  })
  createMilestone(
    @Param('contractId', ParseBigIntPipe) contractId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateMilestoneDto,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.createMilestone(
      contractId,
      user.clientProfileId,
      dto,
      ip,
    );
  }

  @Post('milestones/:milestoneId/approve-request')
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('EMPLOYER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Employer approves a worker-requested milestone. Status REQUESTED → PENDING.',
  })
  approveMilestoneRequest(
    @Param('milestoneId', ParseBigIntPipe) milestoneId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.approveMilestoneRequest(
      milestoneId,
      user.clientProfileId,
      ip,
    );
  }

  @Post('milestones/:milestoneId/decline-request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('EMPLOYER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Employer declines a worker-requested milestone — flips status to DECLINED so the worker can see the outcome. Worker can re-request with different terms (creates a new row).',
  })
  async declineMilestoneRequest(
    @Param('milestoneId', ParseBigIntPipe) milestoneId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.declineMilestoneRequest(
      milestoneId,
      user.clientProfileId,
      ip,
    );
  }

  @Patch('milestones/:milestoneId')
  @UseGuards(JwtAuthGuard, AccountStateGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Edit a milestone. PENDING → employer-only. REQUESTED → worker who requested it. Other states immutable.',
  })
  updateMilestone(
    @Param('milestoneId', ParseBigIntPipe) milestoneId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateMilestoneDto,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.updateMilestone(
      milestoneId,
      user.clientProfileId,
      dto,
      ip,
    );
  }

  @Delete('milestones/:milestoneId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Delete a milestone. PENDING → employer-only. REQUESTED → only the worker who requested it (employer uses /decline-request).',
  })
  async deleteMilestone(
    @Param('milestoneId', ParseBigIntPipe) milestoneId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    await this.escrowService.deleteMilestone(
      milestoneId,
      user.clientProfileId,
      ip,
    );
  }

  @Post('milestones/:milestoneId/attachments')
  @UseGuards(JwtAuthGuard, AccountStateGuard)
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Upload a milestone attachment (multipart/form-data, field name "file"). Query `phase=CREATION|SUBMISSION` (default CREATION). PDF/JPEG/PNG/WebP, ≤ 25 MB, max 3 per phase per milestone.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), MILESTONE_ATTACHMENT_SUBDIR),
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: MILESTONE_ATTACHMENT_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!MILESTONE_ATTACHMENT_ALLOWED_MIMES.includes(file.mimetype)) {
          cb(
            new BadRequestException({
              code: 'INVALID_MIME',
              message: 'Use a PDF, JPEG, PNG, or WebP file.',
            }),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async addMilestoneAttachment(
    @Param('milestoneId', ParseBigIntPipe) milestoneId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('phase') phaseRaw?: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    if (!file) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Attach a file under the "file" multipart field.',
      });
    }
    const phase: 'CREATION' | 'SUBMISSION' =
      phaseRaw === 'SUBMISSION' ? 'SUBMISSION' : 'CREATION';
    return this.escrowService.addMilestoneAttachment(
      milestoneId,
      user.clientProfileId,
      phase,
      file,
    );
  }

  @Delete('milestones/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove an attachment you uploaded (uploader-only).',
  })
  async deleteMilestoneAttachment(
    @Param('attachmentId', ParseBigIntPipe) attachmentId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    await this.escrowService.deleteMilestoneAttachment(
      attachmentId,
      user.clientProfileId,
    );
  }

  @Post('milestones/:milestoneId/fund')
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('EMPLOYER')
  @RequiresVerifiedEmail()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fund a milestone — opens Stripe Checkout for the employer.',
  })
  fundMilestone(
    @Param('milestoneId', ParseBigIntPipe) milestoneId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.fundMilestone(
      milestoneId,
      user.clientProfileId,
      ip,
    );
  }

  @Get('fee-preview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Preview fee breakdown (worker payout, platform fee, referral, Stripe estimate, employer total) for a given amount.',
  })
  previewFee(@Query() q: FeePreviewQueryDto) {
    return this.escrowService.previewFee(q.amount);
  }

  @Get('milestones/:milestoneId/funding-preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYER')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Itemised funding breakdown for a milestone (job, CIS, fees, Stripe, total) shown before checkout.',
  })
  fundingPreview(
    @Param('milestoneId', ParseBigIntPipe) milestoneId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.getMilestoneFundingPreview(
      milestoneId,
      user.clientProfileId,
    );
  }

  // ─── Submission + Release (Slice C) ──────────────────────────

  @Post('milestones/:milestoneId/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Worker submits work for a FUNDED milestone. Starts the 7-day employer review window.',
  })
  submitMilestone(
    @Param('milestoneId', ParseBigIntPipe) milestoneId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SubmitMilestoneDto,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.submitMilestone(
      milestoneId,
      user.clientProfileId,
      dto.message ?? null,
      dto.materials_amount ?? null,
      ip,
    );
  }

  @Post('milestones/:milestoneId/approve')
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('EMPLOYER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Employer approves a SUBMITTED milestone. Fires Stripe transfers (worker + referrer if any).',
  })
  approveMilestone(
    @Param('milestoneId', ParseBigIntPipe) milestoneId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.approveMilestone(
      milestoneId,
      user.clientProfileId,
      ip,
    );
  }

  @Post('milestones/:milestoneId/retry-release')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Worker manually retries a failed payout (RELEASE_FAILED) after fixing their Stripe Connect account.',
  })
  retryRelease(
    @Param('milestoneId', ParseBigIntPipe) milestoneId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.retryRelease(
      milestoneId,
      user.clientProfileId,
      ip,
    );
  }

  // ─── Refund + Dispute + Cancel + End contract (Slice D) ──────

  @Post('milestones/:milestoneId/refund')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYER')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Voluntary employer refund (FUNDED milestones only).',
  })
  refundMilestone(
    @Param('milestoneId', ParseBigIntPipe) milestoneId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RefundMilestoneDto,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.refundMilestone(
      milestoneId,
      user.clientProfileId,
      dto.reason,
      ip,
    );
  }

  @Post('milestones/:milestoneId/dispute')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60 * 60 * 1000 } })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'File a dispute on a FUNDED or SUBMITTED milestone (either party).',
  })
  fileDispute(
    @Param('milestoneId', ParseBigIntPipe) milestoneId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: FileDisputeDto,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.disputeMilestone(
      milestoneId,
      user.clientProfileId,
      dto.reason,
      ip,
    );
  }

  @Post('disputes/:disputeId/respond')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Counterparty responds to an open dispute.' })
  respondToDispute(
    @Param('disputeId', ParseBigIntPipe) disputeId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RespondDisputeDto,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.respondToDispute(
      disputeId,
      user.clientProfileId,
      dto.response,
      dto.resolution,
      ip,
    );
  }

  @Get('admin/disputes')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('escrow_disputes.read')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List open / unresolved disputes for the moderator queue.',
  })
  listOpenDisputes() {
    return this.escrowService.listOpenDisputes();
  }

  @Post('admin/disputes/:disputeId/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('disputes.propose')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '[Legacy] Moderator force-resolves a dispute without party approval. Prefer POST /admin/disputes/:id/proposals which sends the split to both parties for acceptance.',
    deprecated: true,
  })
  resolveDispute(
    @Param('disputeId', ParseBigIntPipe) disputeId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ResolveDisputeDto,
    @Ip() ip: string,
  ) {
    return this.escrowService.resolveDispute(
      disputeId,
      user.accountId,
      dto.worker_pct,
      dto.employer_refund_pct,
      dto.platform_kept_fee,
      dto.reasoning,
      ip,
    );
  }

  // ─── Dispute proposal flow (two-party approval) ────────────────────────

  @Post('admin/disputes/:disputeId/proposals')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('disputes.propose')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mediator proposes a worker/employer split. Both parties must Accept before money moves; any Reject closes the proposal (staff can propose again or escalate).',
  })
  proposeResolution(
    @Param('disputeId', ParseBigIntPipe) disputeId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ProposeResolutionDto,
    @Ip() ip: string,
  ) {
    return this.disputeProposals.propose(disputeId, user.accountId, dto, ip);
  }

  @Get('disputes/:disputeId/proposals')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Read current proposal + history for this dispute. Visible to both parties + any staff.',
  })
  listProposals(@Param('disputeId', ParseBigIntPipe) disputeId: bigint) {
    return this.disputeProposals.getCurrent(disputeId);
  }

  @Post('disputes/:disputeId/proposals/:proposalId/decision')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Worker or employer Accepts or Rejects a pending mediator proposal. When BOTH accept, the resolution executes automatically (release + refund per the split).',
  })
  decideProposal(
    @Param('disputeId', ParseBigIntPipe) disputeId: bigint,
    @Param('proposalId', ParseBigIntPipe) proposalId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: DecideProposalDto,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.disputeProposals.decide(
      disputeId,
      proposalId,
      user.clientProfileId,
      dto.decision,
      dto.note,
      ip,
    );
  }

  @Post('admin/disputes/:disputeId/escalate')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('disputes.escalate')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Move dispute to ARBITRATION_PENDING when parties cannot agree on any proposal. In-platform mediation ends here; arbitration is handled out-of-platform.',
  })
  escalateDispute(
    @Param('disputeId', ParseBigIntPipe) disputeId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: EscalateDisputeDto,
    @Ip() ip: string,
  ) {
    return this.disputeProposals.escalate(
      disputeId,
      user.accountId,
      dto.reason,
      ip,
    );
  }

  @Post('disputes/:disputeId/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Filer cancels a dispute they opened by mistake. Allowed only while status=OPEN (before the counter-party responds or staff proposes a resolution). Restores the milestone to its previous state (FUNDED or SUBMITTED).',
  })
  cancelDispute(
    @Param('disputeId', ParseBigIntPipe) disputeId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.disputeProposals.cancelByFiler(
      disputeId,
      user.clientProfileId,
      ip,
    );
  }

  // Post-CR-006 these routes' :id params now refer to a CONTRACT, not a
  // collaboration. The path keeps the legacy "collaboration" prefix until
  // frontend fully migrates to /escrow/contract/:id/... aliases.
  @Post('collaboration/:contractId/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an unfunded escrow contract (either party).',
  })
  cancelEscrow(
    @Param('contractId', ParseBigIntPipe) contractId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CancelEscrowDto,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.cancelEscrow(
      contractId,
      user.clientProfileId,
      dto.reason,
      ip,
    );
  }

  @Post('collaboration/:contractId/decline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Worker declines the contract — refunds all funded milestones, marks contract ENDED/CANCELED.',
  })
  declineContract(
    @Param('contractId', ParseBigIntPipe) contractId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CancelEscrowDto,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.declineContract(
      contractId,
      user.clientProfileId,
      dto.reason,
      ip,
    );
  }

  @Post('collaboration/:contractId/end-contract')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'End contract — moves Contract → ENDED + opens review window. Use ContractService /contracts/:id/end for the canonical surface.',
  })
  initiateEndContract(
    @Param('contractId', ParseBigIntPipe) contractId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.initiateEndContract(
      contractId,
      user.clientProfileId,
      ip,
    );
  }

  // ─── Wallet + Admin settings (Slice E) ───────────────────────

  @Get('wallet/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Worker's wallet ledger: active escrow, released history, pending referrals, failed transfers.",
  })
  getWallet(@CurrentUser() user: CurrentUserPayload) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.getWallet(user.clientProfileId);
  }

  @Get('payments/me/employer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYER')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Employer's payments view: CHARGE + REFUND history, totals by status, open disputes summary.",
  })
  getEmployerPayments(@CurrentUser() user: CurrentUserPayload) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({ code: 'NO_CLIENT_PROFILE' });
    }
    return this.escrowService.getEmployerPayments(user.clientProfileId);
  }

  @Get('admin/settings/platform')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: read platform fee settings (singleton).' })
  getPlatformSettings() {
    return this.escrowService.getPlatformSetting();
  }

  @Patch('admin/settings/platform')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Throttle({ default: { limit: 60, ttl: 60 * 60 * 1000 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Admin: update platform fee settings. Applies to NEW funding only — in-flight contracts use frozen snapshot.',
  })
  updatePlatformSettings(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    dto: {
      client_marketplace_fee_percent?: number;
      freelancer_service_fee_percent?: number;
      referral_commission_percent?: number;
      stripe_fee_passthrough?: string;
    },
    @Ip() ip: string,
  ) {
    return this.escrowService.updatePlatformSettings(user.accountId, dto, ip);
  }

  // ─── Provider feature flag (Slice F) ─────────────────────────

  @Get('providers')
  @ApiOperation({
    summary:
      'Public: which escrow providers are configured (Stripe Connect). SPA hides Fund/Withdraw CTAs when stripe_connect=false.',
  })
  getProviders() {
    return this.escrowService.getProviders();
  }

  // ─── Legacy / kept endpoints ─────────────────────────────────

  @Post('collaboration/:collaborationId')
  @UseGuards(JwtAuthGuard, RolesGuard, AccountStateGuard)
  @Roles('EMPLOYER')
  @RequiresVerifiedEmail()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Deprecated: legacy create-escrow endpoint. Escrow is now lazy-created on first GET against an ACTIVE contract. Returns 410.',
  })
  create(
    @Param('collaborationId', ParseBigIntPipe) _collaborationId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() _dto: CreateEscrowDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    throw new BadRequestException({
      code: 'DEPRECATED',
      message:
        'Escrow is now created automatically when a contract becomes ACTIVE. Use GET /escrow/by-contract/:contractId to materialise it.',
    });
  }

  @Get('collaboration/:collaborationId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Back-compat: get escrow for a collaboration. Resolves to the latest active contract under the relationship and returns its escrow.',
  })
  getByCollaboration(
    @Param('collaborationId', ParseBigIntPipe) collaborationId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.escrowService.getByCollaboration(collaborationId, user);
  }

  @Get('by-contract/:contractId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Get escrow scoped to a specific contract (preferred surface post-CR-006). Lazy-creates an empty escrow row when the contract is ACTIVE.',
  })
  getByContract(
    @Param('contractId', ParseBigIntPipe) contractId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.escrowService.getByContract(contractId, user);
  }

  // Mock contract-level endpoints (initiateDeposit / confirmDeposit /
  // release / refund / dispute) REMOVED in Slice F — they desynced DB
  // state with Stripe reality. Use the per-milestone endpoints instead:
  //
  //   POST /escrow/milestones/:id/fund     (was /escrow/:id/deposit)
  //   POST /escrow/milestones/:id/approve  (was /escrow/:id/release)
  //   POST /escrow/milestones/:id/refund   (was /escrow/:id/refund)
  //   POST /escrow/milestones/:id/dispute  (was /escrow/:id/dispute)
  //
  // confirm-deposit is gone entirely — webhook payment_intent.succeeded
  // is the source of truth (no staff endpoint can fix Stripe desync).
}
