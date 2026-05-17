import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConversationService } from '../conversation/conversation.service';
import { MailService } from '../mail/mail.service';
import { ReferralService } from '../referral/referral.service';
import { STRIPE_CLIENT } from '../stripe/stripe.module';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ESCROW_AUDIT_EVENTS, grossUpForStripeFee } from './escrow.constants';

/**
 * EscrowService — milestone escrow on top of Stripe Connect.
 *
 * Post-2026-05 schema rework: there is **no `escrow_transaction` table**.
 * `escrow_milestone` hangs straight off `contract`; the "escrow" of a contract
 * is simply its set of milestones. Every money movement (employer charge,
 * worker payout, referral commission, refund) is one row in the append-only
 * `payment` ledger — "pending / held" is just `payment.status = 'PENDING'`,
 * not a separate table. Stripe object ids live on `payment.stripe_id`.
 */
@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly conversation: ConversationService,
    private readonly referrals: ReferralService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
  ) {}

  /**
   * Helper: post a SYSTEM message into the collab's chat conversation.
   * Fire-and-forget — never blocks an escrow operation.
   *
   * `actorAccountId` is the user who triggered the side-effect. SYSTEM
   * messages carry a null sender now, so it is informational only.
   */
  private postChatSystemMessage(
    collaborationId: bigint,
    content: string,
    actorAccountId?: bigint | null,
  ) {
    void this.conversation
      .postSystemMessageForCollaboration(
        collaborationId,
        content,
        actorAccountId ?? null,
      )
      .catch((err) => {
        this.logger.warn(
          `Failed to post system chat message for collab=${collaborationId}: ${(err as Error).message}`,
        );
      });
  }

  // ─── Connect onboarding (Slice A) ──────────────────────────────

  /**
   * Start Stripe Connect Express onboarding for a worker. Creates the Connect
   * account if one doesn't already exist, then returns a fresh AccountLink URL.
   */
  async startOnboarding(workerProfileId: bigint, ip?: string) {
    if (!this.stripe) {
      throw new ServiceUnavailableException({
        code: 'STRIPE_NOT_CONFIGURED',
        message:
          'Payments are temporarily unavailable. Please try again later.',
      });
    }

    const profile = await this.prisma.clientProfile.findUnique({
      where: { id: workerProfileId },
      include: {
        account: { select: { email: true } },
        worker_profile: { select: { id: true } },
      },
    });
    if (!profile) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND' });
    }
    if (!profile.worker_profile) {
      throw new ForbiddenException({
        code: 'NOT_WORKER',
        message: 'Only workers can set up Stripe Connect for payouts.',
      });
    }

    let accountId = profile.stripe_connect_account_id;

    if (!accountId) {
      const account = await this.stripe.accounts.create({
        type: 'express',
        country: 'GB',
        email: profile.account.email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: {
          client_profile_id: workerProfileId.toString(),
        },
      });
      accountId = account.id;

      await this.prisma.clientProfile.update({
        where: { id: workerProfileId },
        data: { stripe_connect_account_id: accountId },
      });

      await this.audit.log(
        workerProfileId,
        ESCROW_AUDIT_EVENTS.ONBOARDING_STARTED,
        'client_profile',
        workerProfileId,
        { account_id: accountId },
        ip,
      );
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const link = await this.stripe.accountLinks.create({
      account: accountId,
      return_url: `${frontendUrl}/wallet?onboarding=complete`,
      refresh_url: `${frontendUrl}/wallet?onboarding=incomplete`,
      type: 'account_onboarding',
    });

    return {
      account_id: accountId,
      onboarding_url: link.url,
      expires_at: new Date(link.expires_at * 1000).toISOString(),
    };
  }

  /**
   * Read the current onboarding status. Pulls fresh capability flags from
   * Stripe and refreshes the denormalised cache columns on `client_profile`.
   */
  async getOnboardingStatus(workerProfileId: bigint) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { id: workerProfileId },
      include: { worker_profile: { select: { id: true } } },
    });
    if (!profile) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND' });
    }
    if (!profile.worker_profile) {
      throw new ForbiddenException({ code: 'NOT_WORKER' });
    }
    if (!profile.stripe_connect_account_id) {
      return {
        has_account: false,
        account_id: null,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        requirements: { currently_due: [], past_due: [] },
        onboarding_url: null,
      };
    }
    if (!this.stripe) {
      // Soft-fail: reuse cached flags from DB so /wallet still renders
      return {
        has_account: true,
        account_id: profile.stripe_connect_account_id,
        charges_enabled: profile.connect_charges_enabled,
        payouts_enabled: profile.connect_payouts_enabled,
        details_submitted: profile.stripe_onboarding_complete,
        requirements: { currently_due: [], past_due: [] },
        onboarding_url: null,
      };
    }

    const acct = await this.stripe.accounts.retrieve(
      profile.stripe_connect_account_id,
    );
    const chargesEnabled = !!acct.charges_enabled;
    const payoutsEnabled = !!acct.payouts_enabled;
    const detailsSubmitted = !!acct.details_submitted;

    // Refresh DB cache
    if (
      chargesEnabled !== profile.connect_charges_enabled ||
      payoutsEnabled !== profile.connect_payouts_enabled ||
      detailsSubmitted !== profile.stripe_onboarding_complete
    ) {
      await this.prisma.clientProfile.update({
        where: { id: workerProfileId },
        data: {
          connect_charges_enabled: chargesEnabled,
          connect_payouts_enabled: payoutsEnabled,
          stripe_onboarding_complete: detailsSubmitted,
        },
      });
    }

    let onboardingUrl: string | null = null;
    if (!detailsSubmitted || !payoutsEnabled) {
      const frontendUrl =
        this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      const link = await this.stripe.accountLinks.create({
        account: profile.stripe_connect_account_id,
        return_url: `${frontendUrl}/wallet?onboarding=complete`,
        refresh_url: `${frontendUrl}/wallet?onboarding=incomplete`,
        type: 'account_onboarding',
      });
      onboardingUrl = link.url;
    }

    return {
      has_account: true,
      account_id: profile.stripe_connect_account_id,
      charges_enabled: chargesEnabled,
      payouts_enabled: payoutsEnabled,
      details_submitted: detailsSubmitted,
      requirements: {
        currently_due: acct.requirements?.currently_due ?? [],
        past_due: acct.requirements?.past_due ?? [],
      },
      onboarding_url: onboardingUrl,
    };
  }

  /**
   * Webhook handler — `account.updated` (Connect events).
   * Updates the denormalised flags on `client_profile` and, the FIRST time
   * `payouts_enabled` flips true, sweeps any held payouts + commissions.
   */
  async handleAccountUpdated(
    account: Stripe.Account,
    ip?: string,
  ): Promise<void> {
    const profile = await this.prisma.clientProfile.findFirst({
      where: { stripe_connect_account_id: account.id },
      include: { account: { select: { email: true } } },
    });
    if (!profile) {
      this.logger.warn(
        `account.updated for unknown Connect account ${account.id} — ignoring`,
      );
      return;
    }

    const wasPayoutsEnabled = profile.connect_payouts_enabled;
    const nowPayoutsEnabled = !!account.payouts_enabled;
    const nowChargesEnabled = !!account.charges_enabled;
    const nowDetailsSubmitted = !!account.details_submitted;

    await this.prisma.clientProfile.update({
      where: { id: profile.id },
      data: {
        connect_charges_enabled: nowChargesEnabled,
        connect_payouts_enabled: nowPayoutsEnabled,
        stripe_onboarding_complete: nowDetailsSubmitted,
      },
    });

    // Fire onboarding-complete email + audit only on the first true-flip.
    if (!wasPayoutsEnabled && nowPayoutsEnabled) {
      await this.audit.log(
        profile.id,
        ESCROW_AUDIT_EVENTS.ONBOARDING_COMPLETED,
        'client_profile',
        profile.id,
        { account_id: account.id },
        ip,
      );
      void this.mail.sendPayoutsEnabled(
        profile.account.email,
        profile.display_name,
      );
      // Settle any held referral commissions now that payouts are live.
      void this.backfillPendingReferralPayouts(profile.id);
      // Retry releases that failed because this worker wasn't onboarded.
      void this.retryFailedReleasesForWorker(profile.id);
      // Pay out any WORKER_PAYOUT ledger rows held because the worker
      // wasn't onboarded at release time.
      void this.payPendingWorkerPayouts(profile.id);
    }
  }

  /**
   * Sweep all PENDING `payment` rows of type WORKER_PAYOUT for a worker who
   * just enabled Stripe payouts. Idempotent — already-PAID rows are skipped.
   * Failures flip the row to FAILED with `failure_reason`.
   */
  private async payPendingWorkerPayouts(workerProfileId: bigint) {
    if (!this.stripe) return { paid: 0, failed: 0 };
    const profile = await this.prisma.clientProfile.findUnique({
      where: { id: workerProfileId },
      select: {
        stripe_connect_account_id: true,
        connect_payouts_enabled: true,
      },
    });
    if (
      !profile?.stripe_connect_account_id ||
      !profile.connect_payouts_enabled
    ) {
      return { paid: 0, failed: 0 };
    }

    const pending = await this.prisma.payment.findMany({
      where: {
        client_profile_id: workerProfileId,
        type: 'WORKER_PAYOUT',
        status: 'PENDING',
      },
    });

    let paid = 0;
    let failed = 0;
    for (const row of pending) {
      const amountPence = Math.round(row.amount.mul(100).toNumber());
      try {
        const tx = await this.stripe.transfers.create(
          {
            amount: amountPence,
            currency: 'gbp',
            destination: profile.stripe_connect_account_id,
            transfer_group: `escrow_${row.milestone_id}`,
            metadata: {
              milestone_id: String(row.milestone_id),
              payment_id: String(row.id),
              kind: 'worker_payout_backfill',
            },
          },
          { idempotencyKey: `worker_payout_backfill_${row.id}` },
        );
        await this.prisma.payment.update({
          where: { id: row.id },
          data: {
            status: 'PAID',
            stripe_id: tx.id,
            settled_at: new Date(),
            failure_reason: null,
          },
        });
        paid += 1;
      } catch (err) {
        await this.prisma.payment.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            failure_reason: (err as Error).message.slice(0, 500),
          },
        });
        failed += 1;
      }
    }
    if (paid > 0 || failed > 0) {
      this.logger.log(
        `Worker payout backfill for worker=${workerProfileId}: paid=${paid} failed=${failed}`,
      );
    }
    return { paid, failed };
  }

  /**
   * When a worker completes onboarding, re-fire release for milestones stuck
   * in RELEASE_FAILED.
   */
  private async retryFailedReleasesForWorker(workerProfileId: bigint) {
    try {
      const failed = await this.prisma.escrowMilestone.findMany({
        where: {
          status: 'RELEASE_FAILED',
          contract: { collaboration: { worker_id: workerProfileId } },
        },
        select: { id: true, title: true },
      });
      for (const m of failed) {
        try {
          await this.executeRelease(m.id, 'system');
          this.logger.log(
            `Auto-retry release succeeded for milestone ${m.id} (${m.title}) after worker onboarded`,
          );
        } catch (err) {
          this.logger.warn(
            `Auto-retry release failed for milestone ${m.id}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `retryFailedReleasesForWorker error: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Webhook handler — `account.application.deauthorized`.
   */
  async handleAccountDeauthorizedById(
    accountId: string,
    ip?: string,
  ): Promise<void> {
    const profile = await this.prisma.clientProfile.findFirst({
      where: { stripe_connect_account_id: accountId },
    });
    if (!profile) return;

    await this.prisma.clientProfile.update({
      where: { id: profile.id },
      data: {
        connect_charges_enabled: false,
        connect_payouts_enabled: false,
      },
    });
    await this.audit.log(
      profile.id,
      ESCROW_AUDIT_EVENTS.ONBOARDING_DEAUTHORIZED,
      'client_profile',
      profile.id,
      { account_id: accountId },
      ip,
    );
  }

  // ─── Platform settings + fee math (Slices B / E) ───────────────

  async getPlatformSetting() {
    const row = await this.prisma.platformSetting.findUnique({
      where: { id: 1 },
    });
    if (row) return row;
    // Defensive: seed-row should already exist via migration. Create on the fly.
    return this.prisma.platformSetting.create({ data: { id: 1 } });
  }

  /**
   * Pure computation of payout breakdown for a given amount + settings.
   * All math in pence to avoid floating-point drift.
   */
  computePayouts(
    amountPounds: string | number,
    settings: {
      client_marketplace_fee_percent: Prisma.Decimal | number;
      freelancer_service_fee_percent: Prisma.Decimal | number;
      stripe_fee_passthrough: string;
    },
    // Kept for back-compat with existing callers; ignored in current model
    // (referral commissions are paid out of platform_fee at release time
    // and never reduce the worker payout).
    _hasReferral?: boolean,
  ) {
    const job = new Prisma.Decimal(amountPounds);
    const clientFeePct = new Prisma.Decimal(
      settings.client_marketplace_fee_percent,
    );
    const freelancerFeePct = new Prisma.Decimal(
      settings.freelancer_service_fee_percent,
    );

    const clientFee = job.mul(clientFeePct).div(100).toDecimalPlaces(2);
    const freelancerFee = job.mul(freelancerFeePct).div(100).toDecimalPlaces(2);
    const workerPayout = job.minus(freelancerFee);

    let stripeFeeEstimate = new Prisma.Decimal(0);
    let employerCharge = job.plus(clientFee);

    if (settings.stripe_fee_passthrough === 'EMPLOYER_PAYS') {
      // Stripe takes 1.5% + 20p from the gross charge.
      // Gross-up so the platform receives `job + client_fee` net.
      const targetNetPence = Math.round(
        job.plus(clientFee).mul(100).toNumber(),
      );
      const grossPence = grossUpForStripeFee(targetNetPence);
      stripeFeeEstimate = new Prisma.Decimal(grossPence - targetNetPence).div(
        100,
      );
      employerCharge = new Prisma.Decimal(grossPence).div(100);
    }

    const platformKeep = clientFee.plus(freelancerFee);

    return {
      job_amount: job.toFixed(2),
      client_marketplace_fee: clientFee.toFixed(2),
      freelancer_service_fee: freelancerFee.toFixed(2),
      referral_commission: '0.00',
      worker_payout: workerPayout.toFixed(2),
      platform_keep: platformKeep.toFixed(2),
      stripe_fee_estimate: stripeFeeEstimate.toFixed(2),
      employer_charge: employerCharge.toFixed(2),
      // Pence integers for Stripe boundary
      employer_charge_pence: Math.round(employerCharge.mul(100).toNumber()),
      worker_payout_pence: Math.round(workerPayout.mul(100).toNumber()),
      referral_commission_pence: 0,
    };
  }

  async previewFee(amountPounds: string, _hasReferral?: boolean) {
    const settings = await this.getPlatformSetting();
    return this.computePayouts(amountPounds, settings);
  }

  // ─── Milestones (Slice B) ──────────────────────────────────────

  /**
   * Generalised party assertion — loads the contract behind a milestone set
   * and returns the caller's role on it ('EMPLOYER' | 'WORKER'). Rejects an
   * ENDED contract (milestones are immutable once the contract closes).
   */
  private async assertPartyOnContract(
    contractId: bigint,
    clientProfileId: bigint,
  ): Promise<{
    contract: Prisma.ContractGetPayload<{ include: { collaboration: true } }>;
    role: 'EMPLOYER' | 'WORKER';
  }> {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { collaboration: true },
    });
    if (!contract) throw new NotFoundException({ code: 'CONTRACT_NOT_FOUND' });
    if (contract.status === 'ENDED') {
      throw new BadRequestException({
        code: 'INVALID_STATE',
        message: 'Cannot edit milestones — the contract has ended.',
      });
    }
    const collab = contract.collaboration;
    if (collab.employer_id === clientProfileId) {
      return { contract, role: 'EMPLOYER' };
    }
    if (collab.worker_id === clientProfileId) {
      return { contract, role: 'WORKER' };
    }
    throw new ForbiddenException({
      code: 'NOT_PARTY',
      message: 'Only the worker or employer party can manage milestones.',
    });
  }

  /** List milestones on a contract, with held-payout flag for the SPA. */
  async listMilestones(contractId: bigint) {
    const rows = await this.prisma.escrowMilestone.findMany({
      where: { contract_id: contractId },
      orderBy: { position: 'asc' },
      include: {
        attachments: {
          orderBy: { created_at: 'asc' },
          select: {
            id: true,
            phase: true,
            file_url: true,
            original_name: true,
            mime_type: true,
            size_bytes: true,
            created_at: true,
          },
        },
      },
    });
    if (rows.length === 0) return [];

    // A milestone's worker payout is "on hold" when its WORKER_PAYOUT ledger
    // row is still PENDING/FAILED (worker hasn't completed Stripe onboarding).
    const heldPayouts = await this.prisma.payment.findMany({
      where: {
        milestone_id: { in: rows.map((m) => m.id) },
        type: 'WORKER_PAYOUT',
        status: { in: ['PENDING', 'FAILED'] },
      },
      select: { milestone_id: true },
    });
    const heldSet = new Set(heldPayouts.map((p) => p.milestone_id));

    return rows.map((m) => ({
      ...m,
      worker_payout_on_hold: heldSet.has(m.id),
    }));
  }

  /**
   * Create a milestone. Status defaults to:
   *   - PENDING when employer creates (immediately fundable)
   *   - REQUESTED when worker creates (employer must approve before fund)
   */
  async createMilestone(
    contractId: bigint,
    callerClientProfileId: bigint,
    dto: {
      title: string;
      amount: string;
      position?: number;
      description?: string | null;
    },
    ip?: string,
  ) {
    const { role } = await this.assertPartyOnContract(
      contractId,
      callerClientProfileId,
    );
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lt(5)) {
      throw new BadRequestException({
        code: 'AMOUNT_TOO_SMALL',
        message: 'Milestone amount must be at least £5.00.',
      });
    }

    const existing = await this.prisma.escrowMilestone.findMany({
      where: { contract_id: contractId },
      select: { position: true },
    });
    const usedPositions = new Set(existing.map((m) => m.position));
    let position = dto.position;
    if (position == null) {
      position = existing.reduce((max, m) => Math.max(max, m.position), 0) + 1;
    } else if (usedPositions.has(position)) {
      throw new ConflictException({
        code: 'POSITION_CONFLICT',
        message: `Position ${position} is already used in this contract.`,
      });
    }

    const initialStatus = role === 'WORKER' ? 'REQUESTED' : 'PENDING';

    const created = await this.prisma.escrowMilestone.create({
      data: {
        contract_id: contractId,
        position,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        amount,
        status: initialStatus,
        created_by_role: role,
      },
    });

    await this.audit.log(
      callerClientProfileId,
      ESCROW_AUDIT_EVENTS.MILESTONE_CREATED,
      'escrow_milestone',
      created.id,
      {
        contract_id: String(contractId),
        title: created.title,
        amount: created.amount.toString(),
        position,
        status: initialStatus,
        created_by_role: role,
      },
      ip,
    );
    return created;
  }

  /**
   * Persist a milestone attachment (file already uploaded to disk by the
   * controller's multer interceptor). Cap: 3 per phase per milestone.
   * The uploader is NOT stored — it is derived (SUBMISSION → worker;
   * CREATION → the milestone's `created_by_role` party).
   */
  async addMilestoneAttachment(
    milestoneId: bigint,
    uploaderClientProfileId: bigint,
    phase: 'CREATION' | 'SUBMISSION',
    file: {
      filename: string;
      originalname: string;
      mimetype: string;
      size: number;
      path?: string;
    },
  ) {
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
    });
    if (!milestone)
      throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    const { role } = await this.assertPartyOnContract(
      milestone.contract_id,
      uploaderClientProfileId,
    );

    if (phase === 'CREATION') {
      if (!['REQUESTED', 'PENDING'].includes(milestone.status)) {
        throw new ConflictException({
          code: 'INVALID_STATE',
          message:
            'Creation-phase attachments only allowed while milestone is REQUESTED or PENDING.',
        });
      }
      if (milestone.created_by_role !== role) {
        throw new ForbiddenException({
          code: 'NOT_CREATOR',
          message: 'Only the milestone creator can add CREATION attachments.',
        });
      }
    } else {
      // SUBMISSION
      if (role !== 'WORKER') {
        throw new ForbiddenException({
          code: 'NOT_WORKER',
          message: 'Only the worker can add SUBMISSION attachments.',
        });
      }
      if (!['FUNDED', 'SUBMITTED'].includes(milestone.status)) {
        throw new ConflictException({
          code: 'INVALID_STATE',
          message:
            'Submission attachments only allowed while milestone is FUNDED or SUBMITTED.',
        });
      }
    }

    const existing = await this.prisma.escrowMilestoneAttachment.count({
      where: { milestone_id: milestoneId, phase },
    });
    if (existing >= 3) {
      throw new BadRequestException({
        code: 'TOO_MANY_ATTACHMENTS',
        message: 'Maximum 3 attachments per phase per milestone.',
      });
    }

    return this.prisma.escrowMilestoneAttachment.create({
      data: {
        milestone_id: milestoneId,
        phase,
        file_url: `/uploads/milestone-attachments/${file.filename}`,
        original_name: file.originalname,
        mime_type: file.mimetype,
        size_bytes: file.size,
      },
    });
  }

  /**
   * Delete a milestone attachment. The uploader is derived (SUBMISSION →
   * worker; CREATION → the milestone's `created_by_role` party); only that
   * party may remove the file, and only before the milestone leaves the
   * relevant phase.
   */
  async deleteMilestoneAttachment(
    attachmentId: bigint,
    callerClientProfileId: bigint,
  ) {
    const att = await this.prisma.escrowMilestoneAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        milestone: {
          include: { contract: { include: { collaboration: true } } },
        },
      },
    });
    if (!att) throw new NotFoundException({ code: 'ATTACHMENT_NOT_FOUND' });

    const collab = att.milestone.contract.collaboration;
    // Derive the uploader: SUBMISSION is always the worker; CREATION is
    // whichever party created the milestone.
    const uploaderRole =
      att.phase === 'SUBMISSION' ? 'WORKER' : att.milestone.created_by_role;
    const uploaderId =
      uploaderRole === 'WORKER' ? collab.worker_id : collab.employer_id;
    if (uploaderId !== callerClientProfileId) {
      throw new ForbiddenException({ code: 'NOT_OWNER' });
    }

    const status = att.milestone.status;
    if (
      att.phase === 'CREATION' &&
      !['REQUESTED', 'PENDING'].includes(status)
    ) {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message:
          'Cannot remove a CREATION attachment after milestone is funded.',
      });
    }
    if (
      att.phase === 'SUBMISSION' &&
      !['FUNDED', 'SUBMITTED'].includes(status)
    ) {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message:
          'Cannot remove a SUBMISSION attachment after milestone moved past review.',
      });
    }
    await this.prisma.escrowMilestoneAttachment.delete({
      where: { id: attachmentId },
    });
  }

  /**
   * Move REQUESTED → PENDING (employer approves a worker-requested milestone).
   */
  async approveMilestoneRequest(
    milestoneId: bigint,
    employerClientProfileId: bigint,
    ip?: string,
  ) {
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
    });
    if (!milestone)
      throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    const { role } = await this.assertPartyOnContract(
      milestone.contract_id,
      employerClientProfileId,
    );
    if (role !== 'EMPLOYER') {
      throw new ForbiddenException({ code: 'NOT_EMPLOYER' });
    }
    if (milestone.status !== 'REQUESTED') {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: `Only REQUESTED milestones can be approved (this one is ${milestone.status}).`,
      });
    }
    const updated = await this.prisma.escrowMilestone.update({
      where: { id: milestoneId },
      data: { status: 'PENDING' },
    });
    await this.audit.log(
      employerClientProfileId,
      ESCROW_AUDIT_EVENTS.MILESTONE_UPDATED,
      'escrow_milestone',
      milestoneId,
      { from: 'REQUESTED', to: 'PENDING' },
      ip,
    );
    const contract = await this.prisma.contract.findUniqueOrThrow({
      where: { id: milestone.contract_id },
      select: { collaboration_id: true },
    });
    this.postChatSystemMessage(
      contract.collaboration_id,
      `Milestone "${milestone.title}" approved — ready to fund.`,
      employerClientProfileId,
    );
    return updated;
  }

  /**
   * Decline a worker-requested milestone — flips status to DECLINED.
   */
  async declineMilestoneRequest(
    milestoneId: bigint,
    employerClientProfileId: bigint,
    ip?: string,
  ) {
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
    });
    if (!milestone)
      throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    const { role } = await this.assertPartyOnContract(
      milestone.contract_id,
      employerClientProfileId,
    );
    if (role !== 'EMPLOYER') {
      throw new ForbiddenException({ code: 'NOT_EMPLOYER' });
    }
    if (milestone.status !== 'REQUESTED') {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: `Only REQUESTED milestones can be declined (this one is ${milestone.status}).`,
      });
    }
    const updated = await this.prisma.escrowMilestone.update({
      where: { id: milestoneId },
      data: { status: 'DECLINED' },
    });
    await this.audit.log(
      employerClientProfileId,
      ESCROW_AUDIT_EVENTS.MILESTONE_REQUEST_DECLINED,
      'escrow_milestone',
      milestoneId,
      {
        title: milestone.title,
        amount: milestone.amount.toString(),
      },
      ip,
    );
    return updated;
  }

  async updateMilestone(
    milestoneId: bigint,
    callerClientProfileId: bigint,
    dto: {
      title?: string;
      amount?: string;
      position?: number;
      description?: string | null;
    },
    ip?: string,
  ) {
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
    });
    if (!milestone)
      throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    const { role } = await this.assertPartyOnContract(
      milestone.contract_id,
      callerClientProfileId,
    );

    // PENDING editable by employer only; REQUESTED editable by worker only
    // (the requester). All other states are immutable.
    if (milestone.status === 'PENDING') {
      if (role !== 'EMPLOYER') {
        throw new ForbiddenException({ code: 'NOT_EMPLOYER' });
      }
    } else if (milestone.status === 'REQUESTED') {
      if (role !== 'WORKER' || milestone.created_by_role !== 'WORKER') {
        throw new ForbiddenException({
          code: 'NOT_REQUESTER',
          message: 'Only the worker who requested this milestone can edit it.',
        });
      }
    } else {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: `Cannot edit milestone in ${milestone.status} state.`,
      });
    }

    const data: Prisma.EscrowMilestoneUpdateInput = {};
    if (dto.title != null) data.title = dto.title.trim();
    if (dto.amount != null) {
      const amt = new Prisma.Decimal(dto.amount);
      if (amt.lt(5)) {
        throw new BadRequestException({ code: 'AMOUNT_TOO_SMALL' });
      }
      data.amount = amt;
    }
    if (dto.position != null) {
      data.position = dto.position;
    }
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }

    const updated = await this.prisma.escrowMilestone.update({
      where: { id: milestoneId },
      data,
    });
    await this.audit.log(
      callerClientProfileId,
      ESCROW_AUDIT_EVENTS.MILESTONE_UPDATED,
      'escrow_milestone',
      milestoneId,
      { changes: dto, by_role: role },
      ip,
    );
    return updated;
  }

  async deleteMilestone(
    milestoneId: bigint,
    callerClientProfileId: bigint,
    ip?: string,
  ) {
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
    });
    if (!milestone)
      throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    const { role } = await this.assertPartyOnContract(
      milestone.contract_id,
      callerClientProfileId,
    );

    if (milestone.status === 'PENDING') {
      if (role !== 'EMPLOYER') {
        throw new ForbiddenException({ code: 'NOT_EMPLOYER' });
      }
    } else if (milestone.status === 'REQUESTED') {
      if (role !== 'WORKER' || milestone.created_by_role !== 'WORKER') {
        throw new ForbiddenException({
          code: 'NOT_REQUESTER',
          message:
            'Only the worker who requested this milestone can delete it. Employers should use the decline endpoint.',
        });
      }
    } else {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: `Cannot delete milestone in ${milestone.status} state.`,
      });
    }
    await this.prisma.escrowMilestone.delete({ where: { id: milestoneId } });
    await this.audit.log(
      callerClientProfileId,
      ESCROW_AUDIT_EVENTS.MILESTONE_DELETED,
      'escrow_milestone',
      milestoneId,
      {
        contract_id: String(milestone.contract_id),
        title: milestone.title,
        by_role: role,
      },
      ip,
    );
  }

  // ─── Funding (Slice B) ─────────────────────────────────────────

  async fundMilestone(
    milestoneId: bigint,
    employerClientProfileId: bigint,
    _ip?: string,
  ) {
    if (!this.stripe) {
      throw new ServiceUnavailableException({ code: 'STRIPE_NOT_CONFIGURED' });
    }
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        contract: {
          include: {
            collaboration: {
              include: {
                worker: { include: { client_profile: true } },
              },
            },
          },
        },
      },
    });
    if (!milestone)
      throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    if (
      milestone.contract.collaboration.employer_id !== employerClientProfileId
    ) {
      throw new ForbiddenException({ code: 'NOT_EMPLOYER' });
    }
    if (milestone.status !== 'PENDING') {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: `Milestone is already ${milestone.status.toLowerCase()}.`,
      });
    }

    // Lockstep check 1: another in-flight milestone.
    const othersInFlight = await this.prisma.escrowMilestone.findMany({
      where: {
        contract_id: milestone.contract_id,
        id: { not: milestoneId },
        status: { in: ['FUNDED', 'SUBMITTED', 'DISPUTED', 'RELEASE_FAILED'] },
      },
      select: { id: true, status: true, title: true },
    });
    if (othersInFlight.some((m) => m.status === 'DISPUTED')) {
      throw new ConflictException({
        code: 'BLOCKED_BY_DISPUTE',
        message: 'Resolve the disputed milestone before funding another.',
      });
    }
    if (othersInFlight.length > 0) {
      throw new ConflictException({
        code: 'BLOCKED_BY_OTHER_FUNDED',
        message: `Release the current milestone "${othersInFlight[0].title}" before funding the next one.`,
      });
    }

    // Lockstep check 2: position order — Upwork-style sequential funding.
    const earlierPending = await this.prisma.escrowMilestone.findFirst({
      where: {
        contract_id: milestone.contract_id,
        status: 'PENDING',
        position: { lt: milestone.position },
      },
      select: { id: true, title: true, position: true },
      orderBy: { position: 'asc' },
    });
    if (earlierPending) {
      throw new ConflictException({
        code: 'BLOCKED_BY_EARLIER_PENDING',
        message: `Fund "${earlierPending.title}" first — milestones are funded in order.`,
      });
    }

    // Worker Connect onboarding is an INFORMATIONAL flag, not a hard block.
    const workerProfile =
      milestone.contract.collaboration.worker.client_profile;
    const workerOnboardingPending = !workerProfile.connect_payouts_enabled;

    const settings = await this.getPlatformSetting();
    const breakdown = this.computePayouts(
      milestone.amount.toString(),
      settings,
    );

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const contractId = String(milestone.contract_id);
    const milestoneIdStr = String(milestoneId);

    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'gbp',
              product_data: {
                name: `Milestone "${milestone.title}"`,
                description: `TradeHub escrow — contract ${contractId}`,
              },
              unit_amount: breakdown.employer_charge_pence,
            },
            quantity: 1,
          },
        ],
        metadata: {
          milestone_id: milestoneIdStr,
          contract_id: contractId,
        },
        payment_intent_data: {
          transfer_group: `escrow_${milestoneIdStr}`,
          metadata: {
            milestone_id: milestoneIdStr,
            contract_id: contractId,
          },
        },
        success_url: `${frontendUrl}/contracts/${contractId}/escrow?funded=${milestoneIdStr}`,
        cancel_url: `${frontendUrl}/contracts/${contractId}/escrow?canceled=${milestoneIdStr}`,
      },
      { idempotencyKey: `escrow_milestone_${milestoneIdStr}_fund` },
    );

    return {
      checkout_url: session.url,
      session_id: session.id,
      breakdown,
      worker_onboarding_pending: workerOnboardingPending,
    };
  }

  /**
   * Webhook handler for `payment_intent.succeeded` when metadata.milestone_id
   * is set. Writes the inbound CHARGE ledger row + advances milestone to
   * FUNDED with the frozen fee snapshot. Idempotent — no-op if not PENDING.
   */
  async handleMilestonePaymentSucceeded(pi: Stripe.PaymentIntent, ip?: string) {
    const milestoneIdStr = pi.metadata?.milestone_id;
    if (!milestoneIdStr) return;
    let milestoneId: bigint;
    try {
      milestoneId = BigInt(milestoneIdStr);
    } catch {
      return;
    }
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
      include: { contract: { include: { collaboration: true } } },
    });
    if (!milestone) {
      this.logger.warn(
        `payment_intent.succeeded for unknown milestone ${milestoneIdStr}`,
      );
      return;
    }
    if (milestone.status !== 'PENDING') {
      this.logger.log(
        `Duplicate payment_intent.succeeded for milestone ${milestoneIdStr} (status=${milestone.status}) — no-op`,
      );
      return;
    }

    // Freeze fee snapshot
    const settings = await this.getPlatformSetting();
    const breakdown = this.computePayouts(
      milestone.amount.toString(),
      settings,
    );
    const chargedAmount = new Prisma.Decimal(
      pi.amount_received ?? pi.amount ?? 0,
    ).div(100);

    await this.prisma.$transaction(async (tx) => {
      await tx.escrowMilestone.update({
        where: { id: milestoneId },
        data: {
          status: 'FUNDED',
          frozen_client_fee_pct: settings.client_marketplace_fee_percent,
          frozen_freelancer_fee_pct: settings.freelancer_service_fee_percent,
          frozen_referral_fee_pct: new Prisma.Decimal(0),
          frozen_worker_payout: new Prisma.Decimal(breakdown.worker_payout),
          frozen_referral_commission: new Prisma.Decimal(
            breakdown.referral_commission,
          ),
          frozen_platform_fee: new Prisma.Decimal(breakdown.platform_keep),
        },
      });
      // Inbound CHARGE row — the employer is the counterparty.
      await tx.payment.create({
        data: {
          milestone_id: milestoneId,
          client_profile_id: milestone.contract.collaboration.employer_id,
          type: 'CHARGE',
          amount: chargedAmount,
          currency: (pi.currency ?? 'gbp').toUpperCase(),
          status: 'PAID',
          stripe_id: pi.id,
          settled_at: new Date(),
        },
      });
    });

    await this.audit.log(
      milestone.contract.collaboration.employer_id,
      ESCROW_AUDIT_EVENTS.MILESTONE_FUNDED,
      'escrow_milestone',
      milestoneId,
      {
        contract_id: String(milestone.contract_id),
        amount: milestone.amount.toString(),
        payment_intent_id: pi.id,
      },
      ip,
    );

    this.postChatSystemMessage(
      milestone.contract.collaboration_id,
      `💷 Milestone "${milestone.title}" funded — £${milestone.amount.toFixed(2)} in escrow.`,
      milestone.contract.collaboration.employer_id,
    );

    void this.notifyMilestoneFunded(milestoneId);
  }

  /**
   * Webhook handler for `payment_intent.payment_failed` / `.canceled` with a
   * milestone_id. The Checkout never completed — the milestone stays PENDING
   * so the employer can simply retry funding; no ledger row is written.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async handleMilestonePaymentFailed(pi: Stripe.PaymentIntent): Promise<void> {
    const milestoneIdStr = pi.metadata?.milestone_id;
    if (!milestoneIdStr) return;
    this.logger.warn(
      `Milestone funding payment failed/canceled :: milestone=${milestoneIdStr} pi=${pi.id}`,
    );
  }

  /**
   * Email notification helper — fired after a milestone is FUNDED.
   */
  private async notifyMilestoneFunded(milestoneId: bigint) {
    try {
      const m = await this.prisma.escrowMilestone.findUnique({
        where: { id: milestoneId },
        include: {
          contract: {
            include: {
              collaboration: {
                include: {
                  worker: {
                    include: {
                      client_profile: {
                        include: { account: { select: { email: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!m) return;
      const worker = m.contract.collaboration.worker.client_profile;
      void this.mail.sendEscrowMilestoneFunded(
        worker.account.email,
        worker.display_name,
        m.title,
        m.amount.toFixed(2),
        worker.connect_payouts_enabled,
      );
    } catch (err) {
      this.logger.warn(`Funded notification failed: ${(err as Error).message}`);
    }
  }

  // ─── Submission + Release (Slice C) ───────────────────────────

  async submitMilestone(
    milestoneId: bigint,
    workerClientProfileId: bigint,
    message: string | null,
    ip?: string,
  ) {
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        contract: {
          include: {
            collaboration: {
              select: { id: true, worker_id: true, employer_id: true },
            },
          },
        },
      },
    });
    if (!milestone)
      throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    if (milestone.contract.collaboration.worker_id !== workerClientProfileId) {
      throw new ForbiddenException({ code: 'NOT_WORKER' });
    }
    if (milestone.status !== 'FUNDED') {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: `Cannot submit milestone in ${milestone.status} state.`,
      });
    }
    const updated = await this.prisma.escrowMilestone.update({
      where: { id: milestoneId },
      data: {
        status: 'SUBMITTED',
        worker_submitted_at: new Date(),
        submission_message: message?.trim() || null,
      },
    });
    await this.audit.log(
      milestone.contract.collaboration.employer_id, // subject = the user who needs to act
      ESCROW_AUDIT_EVENTS.MILESTONE_SUBMITTED,
      'escrow_milestone',
      milestoneId,
      {
        contract_id: String(milestone.contract_id),
        submitted_by: String(workerClientProfileId),
      },
      ip,
    );
    this.postChatSystemMessage(
      milestone.contract.collaboration_id,
      `📩 Worker submitted milestone "${milestone.title}" for review. Employer has 7 days to approve or dispute, otherwise auto-release fires.${message?.trim() ? `\n\n"${message.trim()}"` : ''}`,
      workerClientProfileId,
    );
    void this.notifyMilestoneSubmitted(milestoneId);
    return updated;
  }

  private async notifyMilestoneReleased(
    milestoneId: bigint,
    actor: 'employer' | 'system',
  ) {
    try {
      const m = await this.prisma.escrowMilestone.findUnique({
        where: { id: milestoneId },
        include: {
          contract: {
            include: {
              collaboration: {
                include: {
                  worker: {
                    include: {
                      client_profile: {
                        include: { account: { select: { email: true } } },
                      },
                    },
                  },
                  employer: {
                    include: {
                      client_profile: {
                        include: { account: { select: { email: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!m) return;
      const worker = m.contract.collaboration.worker.client_profile;
      const amount = (m.frozen_worker_payout ?? m.amount).toFixed(2);
      void this.mail.sendEscrowMilestoneReleased(
        worker.account.email,
        worker.display_name,
        m.title,
        amount,
        actor === 'system',
      );
      if (actor === 'system') {
        const employer = m.contract.collaboration.employer.client_profile;
        void this.mail.sendEscrowMilestoneAutoReleased(
          employer.account.email,
          employer.display_name,
          m.title,
          amount,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Released notification failed: ${(err as Error).message}`,
      );
    }
  }

  private async notifyMilestoneSubmitted(milestoneId: bigint) {
    try {
      const m = await this.prisma.escrowMilestone.findUnique({
        where: { id: milestoneId },
        include: {
          contract: {
            include: {
              collaboration: {
                include: {
                  employer: {
                    include: {
                      client_profile: {
                        include: { account: { select: { email: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!m) return;
      const employer = m.contract.collaboration.employer.client_profile;
      void this.mail.sendEscrowMilestoneSubmitted(
        employer.account.email,
        employer.display_name,
        m.title,
        m.amount.toFixed(2),
      );
    } catch (err) {
      this.logger.warn(
        `Submitted notification failed: ${(err as Error).message}`,
      );
    }
  }

  async approveMilestone(
    milestoneId: bigint,
    employerClientProfileId: bigint,
    ip?: string,
  ) {
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
      include: { contract: { include: { collaboration: true } } },
    });
    if (!milestone)
      throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    if (
      milestone.contract.collaboration.employer_id !== employerClientProfileId
    ) {
      throw new ForbiddenException({ code: 'NOT_EMPLOYER' });
    }
    if (milestone.status !== 'SUBMITTED') {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: `Cannot approve milestone in ${milestone.status} state.`,
      });
    }
    return this.executeRelease(milestoneId, 'employer', ip);
  }

  /**
   * Pure release flow — used by both employer-approve and the auto-release
   * cron. Fires the Stripe worker transfer + referral commission transfers,
   * writes the matching `payment` ledger rows, and advances milestone to
   * RELEASED. Idempotent via per-transfer `Idempotency-Key`.
   *
   *  - worker onboarded → transfer immediately, WORKER_PAYOUT row = PAID.
   *  - not onboarded / transfer rejected → WORKER_PAYOUT row = PENDING; the
   *    `account.updated` sweep pays it once the worker finishes onboarding.
   */
  private async executeRelease(
    milestoneId: bigint,
    actor: 'employer' | 'system',
    ip?: string,
  ) {
    if (!this.stripe) {
      throw new ServiceUnavailableException({ code: 'STRIPE_NOT_CONFIGURED' });
    }
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        contract: {
          include: {
            collaboration: {
              include: {
                worker: { include: { client_profile: true } },
              },
            },
          },
        },
      },
    });
    if (!milestone)
      throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });

    const contract = milestone.contract;
    const collab = contract.collaboration;
    const workerProfile = collab.worker.client_profile;
    const workerConnectId = workerProfile.stripe_connect_account_id;
    const workerOnboarded =
      !!workerConnectId && !!workerProfile.connect_payouts_enabled;

    const workerPayoutAmount =
      milestone.frozen_worker_payout ?? milestone.amount;
    const workerPayoutPence = Math.round(
      workerPayoutAmount.mul(100).toNumber(),
    );
    const milestoneIdStr = String(milestoneId);
    const transferGroup = `escrow_${milestoneIdStr}`;

    // ── Worker transfer ──────────────────────────────────────────
    let workerTransfer: Stripe.Transfer | null = null;
    if (workerOnboarded) {
      try {
        workerTransfer = await this.stripe.transfers.create(
          {
            amount: workerPayoutPence,
            currency: 'gbp',
            destination: workerConnectId,
            transfer_group: transferGroup,
            metadata: { milestone_id: milestoneIdStr, kind: 'worker_payout' },
          },
          {
            idempotencyKey: `escrow_milestone_${milestoneIdStr}_release_worker`,
          },
        );
      } catch (err) {
        const code = (err as { code?: string }).code ?? 'unknown';
        this.logger.warn(
          `Live worker transfer rejected for milestone ${milestoneIdStr} (${code}); writing a PENDING WORKER_PAYOUT row instead.`,
        );
        await this.audit.log(
          collab.worker_id,
          ESCROW_AUDIT_EVENTS.MILESTONE_TRANSFER_FAILED,
          'escrow_milestone',
          milestoneId,
          {
            actor,
            error_code: code,
            attempt: milestone.release_attempts + 1,
            fallback: 'pending_worker_payout',
          },
          ip,
        );
      }
    }

    // WORKER_PAYOUT ledger row — PAID if the transfer fired, else PENDING
    // (held until the worker completes Stripe onboarding).
    const workerPayoutRow = await this.prisma.payment.create({
      data: {
        milestone_id: milestoneId,
        client_profile_id: collab.worker_id,
        type: 'WORKER_PAYOUT',
        amount: workerPayoutAmount,
        currency: 'GBP',
        status: workerTransfer ? 'PAID' : 'PENDING',
        stripe_id: workerTransfer?.id ?? null,
        settled_at: workerTransfer ? new Date() : null,
      },
    });

    // ── Referral commissions ─────────────────────────────────────
    // Computed via ReferralService (account + project refs, capped at the
    // milestone's platform_fee). Each line becomes a REFERRAL_* payment row,
    // paid live if the referrer is onboarded, otherwise held PENDING.
    try {
      const lines = await this.referrals.computeMilestoneCommissions({
        milestoneId,
        contractId: milestone.contract_id,
        agreedAmount: milestone.amount,
        platformFee: milestone.frozen_platform_fee ?? new Prisma.Decimal(0),
        workerClientProfileId: collab.worker_id,
        employerClientProfileId: collab.employer_id,
        projectReferrerId: contract.project_referrer_id,
        projectReferrerRole:
          (contract.project_referrer_role as 'WORKER' | 'EMPLOYER' | null) ??
          null,
      });
      for (const line of lines) {
        if (line.cappedAmount.lte(0)) continue;
        await this.payReferralCommission(line, milestoneId, transferGroup);
      }
    } catch (err) {
      this.logger.warn(
        `Referral commissions skipped for milestone=${milestoneIdStr}: ${(err as Error).message}`,
      );
    }

    // ── Advance milestone ────────────────────────────────────────
    const now = new Date();
    await this.prisma.escrowMilestone.update({
      where: { id: milestoneId },
      data: {
        status: 'RELEASED',
        released_at: now,
        employer_approved_at: actor === 'employer' ? now : null,
      },
    });

    await this.audit.log(
      collab.worker_id,
      ESCROW_AUDIT_EVENTS.MILESTONE_RELEASED,
      'escrow_milestone',
      milestoneId,
      {
        actor,
        worker_amount: workerPayoutAmount.toFixed(2),
        platform_fee: milestone.frozen_platform_fee?.toString() ?? '0',
        worker_transfer_id: workerTransfer?.id ?? null,
        worker_payout_payment_id: String(workerPayoutRow.id),
        worker_payout_status: workerPayoutRow.status,
      },
      ip,
    );

    const releaseLabel =
      actor === 'system'
        ? `auto-released after 7 days of silence`
        : `released by employer`;
    const workerLabel = workerTransfer
      ? `£${workerPayoutAmount.toFixed(2)} sent to worker`
      : `£${workerPayoutAmount.toFixed(2)} held in escrow — paid out automatically when worker completes Stripe Connect onboarding`;
    this.postChatSystemMessage(
      collab.id,
      `✅ Milestone "${milestone.title}" ${releaseLabel}. ${workerLabel}.`,
      actor === 'employer' ? collab.employer_id : collab.worker_id,
    );
    void this.notifyMilestoneReleased(milestoneId, actor);

    return this.prisma.escrowMilestone.findUniqueOrThrow({
      where: { id: milestoneId },
    });
  }

  /**
   * Create the REFERRAL_* `payment` row for one commission line and, if the
   * referrer is Stripe-onboarded, fire the transfer immediately. Otherwise
   * the row stays PENDING and is settled by `backfillPendingReferralPayouts`.
   */
  private async payReferralCommission(
    line: {
      referrerClientProfileId: bigint;
      type: 'REFERRAL_ACCOUNT' | 'REFERRAL_W2W' | 'REFERRAL_E2E';
      cappedAmount: Prisma.Decimal;
    },
    milestoneId: bigint,
    transferGroup: string,
  ) {
    const referrer = await this.prisma.clientProfile.findUnique({
      where: { id: line.referrerClientProfileId },
      select: {
        stripe_connect_account_id: true,
        connect_payouts_enabled: true,
      },
    });
    const canPayLive =
      !!this.stripe &&
      !!referrer?.stripe_connect_account_id &&
      !!referrer.connect_payouts_enabled;

    let transfer: Stripe.Transfer | null = null;
    if (canPayLive && this.stripe) {
      const amountPence = Math.round(line.cappedAmount.mul(100).toNumber());
      try {
        transfer = await this.stripe.transfers.create(
          {
            amount: amountPence,
            currency: 'gbp',
            destination: referrer.stripe_connect_account_id!,
            transfer_group: transferGroup,
            metadata: {
              milestone_id: String(milestoneId),
              kind: 'referral_commission',
              referral_type: line.type,
            },
          },
          {
            idempotencyKey: `escrow_milestone_${String(milestoneId)}_${line.type}_${line.referrerClientProfileId}`,
          },
        );
      } catch (err) {
        this.logger.warn(
          `Referral commission transfer rejected for referrer=${line.referrerClientProfileId}: ${(err as Error).message}`,
        );
      }
    }

    const row = await this.prisma.payment.create({
      data: {
        milestone_id: milestoneId,
        client_profile_id: line.referrerClientProfileId,
        type: line.type,
        amount: line.cappedAmount,
        currency: 'GBP',
        status: transfer ? 'PAID' : 'PENDING',
        stripe_id: transfer?.id ?? null,
        settled_at: transfer ? new Date() : null,
      },
    });

    const contract = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
      select: { contract_id: true },
    });
    if (contract) {
      this.referrals.notifyCommissionPaid(
        line.referrerClientProfileId,
        contract.contract_id,
        line.cappedAmount,
        line.type,
        transfer != null,
      );
    }
    return row;
  }

  async retryRelease(
    milestoneId: bigint,
    workerClientProfileId: bigint,
    ip?: string,
  ) {
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        contract: {
          include: { collaboration: { select: { worker_id: true } } },
        },
      },
    });
    if (!milestone)
      throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    if (milestone.contract.collaboration.worker_id !== workerClientProfileId) {
      throw new ForbiddenException({ code: 'NOT_WORKER' });
    }
    if (milestone.status !== 'RELEASE_FAILED') {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: 'Only failed releases can be retried.',
      });
    }
    return this.executeRelease(milestoneId, 'employer', ip);
  }

  /**
   * Auto-release scheduled job — runs hourly, finds SUBMITTED milestones
   * older than the configured window where the employer hasn't acted.
   */
  async runAutoReleaseSweep() {
    const hours =
      Number(this.config.get<string>('ESCROW_AUTO_RELEASE_HOURS')) || 168;
    const threshold = new Date(Date.now() - hours * 60 * 60 * 1000);
    const candidates = await this.prisma.escrowMilestone.findMany({
      where: {
        status: 'SUBMITTED',
        worker_submitted_at: { lt: threshold },
      },
      select: { id: true },
    });
    for (const c of candidates) {
      try {
        await this.executeRelease(c.id, 'system');
      } catch (err) {
        this.logger.error(
          `Auto-release failed for milestone ${c.id}: ${(err as Error).message}`,
        );
      }
    }
    if (candidates.length > 0) {
      this.logger.log(
        `Auto-release: processed ${candidates.length} submitted milestones`,
      );
    }
    return { processed: candidates.length };
  }

  /**
   * Webhook handler — `transfer.created` / `transfer.paid`. Confirmation
   * only; the WORKER_PAYOUT / REFERRAL_* row was written in executeRelease.
   * Best-effort: stamp the matching payment row PAID by stripe_id.
   */
  async handleTransferPaid(transfer: Stripe.Transfer) {
    const milestoneIdStr = transfer.metadata?.milestone_id;
    this.logger.log(
      `Transfer paid confirmation :: milestone=${milestoneIdStr ?? '—'} transfer=${transfer.id} kind=${transfer.metadata?.kind ?? '—'}`,
    );
    try {
      await this.prisma.payment.updateMany({
        where: { stripe_id: transfer.id, status: { not: 'PAID' } },
        data: { status: 'PAID', settled_at: new Date() },
      });
    } catch (err) {
      this.logger.warn(
        `transfer.paid ledger sync failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Webhook handler — `transfer.reversed`. Flips milestone to RELEASE_FAILED
   * and the matching WORKER_PAYOUT row to FAILED; worker retries from /wallet.
   */
  async handleTransferFailed(transfer: Stripe.Transfer, ip?: string) {
    const milestoneIdStr = transfer.metadata?.milestone_id;
    if (!milestoneIdStr) return;
    let milestoneId: bigint;
    try {
      milestoneId = BigInt(milestoneIdStr);
    } catch {
      return;
    }
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        contract: {
          include: { collaboration: { select: { worker_id: true } } },
        },
      },
    });
    if (!milestone) return;
    await this.prisma.escrowMilestone.update({
      where: { id: milestoneId },
      data: { status: 'RELEASE_FAILED', release_attempts: { increment: 1 } },
    });
    await this.prisma.payment.updateMany({
      where: { stripe_id: transfer.id },
      data: {
        status: 'FAILED',
        failure_reason: 'Stripe transfer reversed',
      },
    });
    await this.audit.log(
      milestone.contract.collaboration.worker_id,
      ESCROW_AUDIT_EVENTS.MILESTONE_TRANSFER_FAILED,
      'escrow_milestone',
      milestoneId,
      { transfer_id: transfer.id, attempt: milestone.release_attempts + 1 },
      ip,
    );
  }

  /**
   * Settle held referral commissions when a referrer completes onboarding —
   * sweeps PENDING REFERRAL_* `payment` rows for that referrer.
   */
  private async backfillPendingReferralPayouts(referrerProfileId: bigint) {
    if (!this.stripe) return { paid: 0, failed: 0 };
    const referrer = await this.prisma.clientProfile.findUnique({
      where: { id: referrerProfileId },
      select: {
        stripe_connect_account_id: true,
        connect_payouts_enabled: true,
      },
    });
    if (
      !referrer?.stripe_connect_account_id ||
      !referrer.connect_payouts_enabled
    ) {
      return { paid: 0, failed: 0 };
    }

    const pending = await this.prisma.payment.findMany({
      where: {
        client_profile_id: referrerProfileId,
        type: { in: ['REFERRAL_ACCOUNT', 'REFERRAL_W2W', 'REFERRAL_E2E'] },
        status: 'PENDING',
      },
    });

    let paid = 0;
    let failed = 0;
    for (const row of pending) {
      const amountPence = Math.round(row.amount.mul(100).toNumber());
      try {
        const transfer = await this.stripe.transfers.create(
          {
            amount: amountPence,
            currency: 'gbp',
            destination: referrer.stripe_connect_account_id,
            transfer_group: `escrow_${row.milestone_id}`,
            metadata: {
              milestone_id: String(row.milestone_id),
              payment_id: String(row.id),
              kind: 'referral_commission_backfill',
            },
          },
          { idempotencyKey: `referral_payout_backfill_${row.id}` },
        );
        await this.prisma.payment.update({
          where: { id: row.id },
          data: {
            status: 'PAID',
            stripe_id: transfer.id,
            settled_at: new Date(),
            failure_reason: null,
          },
        });
        paid += 1;
      } catch (err) {
        await this.prisma.payment.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            failure_reason: (err as Error).message.slice(0, 500),
          },
        });
        failed += 1;
      }
    }
    if (paid > 0 || failed > 0) {
      this.logger.log(
        `Pending referral payout backfill for referrer=${referrerProfileId}: paid=${paid} failed=${failed}`,
      );
    }
    return { paid, failed };
  }

  // ─── Refund + Dispute + Cancel (Slice D) ──────────────────────

  /**
   * Find the inbound CHARGE ledger row (the employer's PaymentIntent) for a
   * milestone — needed to issue a Stripe refund.
   */
  private async findChargePayment(milestoneId: bigint) {
    return this.prisma.payment.findFirst({
      where: { milestone_id: milestoneId, type: 'CHARGE', status: 'PAID' },
      orderBy: { created_at: 'desc' },
    });
  }

  async refundMilestone(
    milestoneId: bigint,
    employerClientProfileId: bigint,
    reason: string,
    ip?: string,
  ) {
    if (!this.stripe)
      throw new ServiceUnavailableException({ code: 'STRIPE_NOT_CONFIGURED' });
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        contract: {
          include: {
            collaboration: {
              select: { id: true, employer_id: true, worker_id: true },
            },
          },
        },
      },
    });
    if (!milestone)
      throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    if (
      milestone.contract.collaboration.employer_id !== employerClientProfileId
    ) {
      throw new ForbiddenException({ code: 'NOT_EMPLOYER' });
    }
    if (milestone.status === 'SUBMITTED') {
      throw new ConflictException({
        code: 'USE_DISPUTE_FLOW',
        message:
          'Worker has submitted work — use dispute flow to contest, not refund.',
      });
    }
    if (milestone.status !== 'FUNDED') {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: `Cannot refund milestone in ${milestone.status} state.`,
      });
    }
    const charge = await this.findChargePayment(milestoneId);
    if (!charge?.stripe_id) {
      throw new ConflictException({
        code: 'NO_PAYMENT_INTENT',
        message: 'No payment to refund.',
      });
    }

    const refund = await this.stripe.refunds.create(
      { payment_intent: charge.stripe_id },
      { idempotencyKey: `escrow_milestone_${String(milestoneId)}_refund` },
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const m = await tx.escrowMilestone.update({
        where: { id: milestoneId },
        data: {
          status: 'REFUNDED',
          refunded_at: new Date(),
          refund_reason: reason.trim(),
        },
      });
      await tx.payment.create({
        data: {
          milestone_id: milestoneId,
          client_profile_id: milestone.contract.collaboration.employer_id,
          type: 'REFUND',
          amount: new Prisma.Decimal(refund.amount).div(100),
          currency: (refund.currency ?? 'gbp').toUpperCase(),
          status: 'PAID',
          stripe_id: refund.id,
          settled_at: new Date(),
        },
      });
      return m;
    });

    await this.audit.log(
      milestone.contract.collaboration.worker_id, // subject = worker (not getting paid)
      ESCROW_AUDIT_EVENTS.MILESTONE_REFUNDED,
      'escrow_milestone',
      milestoneId,
      {
        amount: milestone.amount.toString(),
        reason,
        refunded_by: String(employerClientProfileId),
        refund_id: refund.id,
      },
      ip,
    );
    this.postChatSystemMessage(
      milestone.contract.collaboration_id,
      `↩️ Milestone "${milestone.title}" refunded — £${milestone.amount.toFixed(2)} returned to employer.\n\nReason: ${reason}`,
      employerClientProfileId,
    );
    void this.notifyMilestoneRefunded(milestoneId, reason);
    return updated;
  }

  private async notifyMilestoneRefunded(milestoneId: bigint, reason: string) {
    try {
      const m = await this.prisma.escrowMilestone.findUnique({
        where: { id: milestoneId },
        include: {
          contract: {
            include: {
              collaboration: {
                include: {
                  worker: {
                    include: {
                      client_profile: {
                        include: { account: { select: { email: true } } },
                      },
                    },
                  },
                  employer: {
                    include: {
                      client_profile: {
                        include: { account: { select: { email: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!m) return;
      const worker = m.contract.collaboration.worker.client_profile;
      const employer = m.contract.collaboration.employer.client_profile;
      void this.mail.sendEscrowMilestoneRefunded(
        worker.account.email,
        worker.display_name,
        m.title,
        m.amount.toFixed(2),
        reason,
      );
      void this.mail.sendEscrowMilestoneRefunded(
        employer.account.email,
        employer.display_name,
        m.title,
        m.amount.toFixed(2),
        reason,
      );
    } catch (err) {
      this.logger.warn(`Refund notification failed: ${(err as Error).message}`);
    }
  }

  async disputeMilestone(
    milestoneId: bigint,
    filerClientProfileId: bigint,
    reason: string,
    ip?: string,
  ) {
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        contract: {
          include: {
            collaboration: {
              select: { id: true, worker_id: true, employer_id: true },
            },
          },
        },
        dispute: true,
      },
    });
    if (!milestone)
      throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    const collab = milestone.contract.collaboration;
    const filedByRole =
      collab.worker_id === filerClientProfileId
        ? 'WORKER'
        : collab.employer_id === filerClientProfileId
          ? 'EMPLOYER'
          : null;
    if (!filedByRole) throw new ForbiddenException({ code: 'NOT_PARTY' });
    if (milestone.status !== 'FUNDED' && milestone.status !== 'SUBMITTED') {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: `Cannot file dispute on milestone in ${milestone.status} state.`,
      });
    }
    if (milestone.dispute) {
      throw new ConflictException({ code: 'ALREADY_DISPUTED' });
    }

    return this.prisma
      .$transaction(async (tx) => {
        const dispute = await tx.escrowDispute.create({
          data: {
            milestone_id: milestoneId,
            filed_by_role: filedByRole,
            reason: reason.trim(),
          },
        });
        await tx.escrowMilestone.update({
          where: { id: milestoneId },
          data: { status: 'DISPUTED', disputed_at: new Date() },
        });
        await this.audit.log(
          filerClientProfileId,
          ESCROW_AUDIT_EVENTS.MILESTONE_DISPUTED,
          'escrow_dispute',
          dispute.id,
          { milestone_id: String(milestoneId), filed_by_role: filedByRole },
          ip,
        );
        return dispute;
      })
      .then((dispute) => {
        this.postChatSystemMessage(
          collab.id,
          `⚠️ Dispute filed on milestone "${milestone.title}". A TradeHub mediator will review within 24h. The other party can respond with their side via the escrow page.\n\nReason: ${reason}`,
          filerClientProfileId,
        );
        void this.notifyDisputeFiled(dispute.id, filerClientProfileId, reason);
        return dispute;
      });
  }

  private async notifyDisputeFiled(
    disputeId: bigint,
    filerProfileId: bigint,
    reason: string,
  ) {
    try {
      const d = await this.prisma.escrowDispute.findUnique({
        where: { id: disputeId },
        include: {
          milestone: {
            include: {
              contract: {
                include: {
                  collaboration: {
                    include: {
                      worker: {
                        include: {
                          client_profile: {
                            include: { account: { select: { email: true } } },
                          },
                        },
                      },
                      employer: {
                        include: {
                          client_profile: {
                            include: { account: { select: { email: true } } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!d) return;
      const worker = d.milestone.contract.collaboration.worker.client_profile;
      const employer =
        d.milestone.contract.collaboration.employer.client_profile;
      // Email the OTHER party (not the filer)
      const filerIsWorker = filerProfileId === worker.id;
      const recipient = filerIsWorker ? employer : worker;
      void this.mail.sendEscrowMilestoneDisputed(
        recipient.account.email,
        recipient.display_name,
        d.milestone.title,
        reason,
      );
    } catch (err) {
      this.logger.warn(
        `Dispute notification failed: ${(err as Error).message}`,
      );
    }
  }

  async respondToDispute(
    disputeId: bigint,
    responderClientProfileId: bigint,
    response: string,
    resolution: 'accept' | 'reject',
    ip?: string,
  ) {
    const dispute = await this.prisma.escrowDispute.findUnique({
      where: { id: disputeId },
      include: {
        milestone: {
          include: {
            contract: {
              include: {
                collaboration: {
                  select: { worker_id: true, employer_id: true },
                },
              },
            },
          },
        },
      },
    });
    if (!dispute) throw new NotFoundException({ code: 'DISPUTE_NOT_FOUND' });
    const collab = dispute.milestone.contract.collaboration;
    // The filer is derived from the role string stored on the dispute.
    const filerId =
      dispute.filed_by_role === 'WORKER'
        ? collab.worker_id
        : collab.employer_id;
    if (filerId === responderClientProfileId) {
      throw new ForbiddenException({
        code: 'CANNOT_RESPOND_OWN',
        message: 'You cannot respond to your own dispute.',
      });
    }
    const isParty =
      collab.worker_id === responderClientProfileId ||
      collab.employer_id === responderClientProfileId;
    if (!isParty) throw new ForbiddenException({ code: 'NOT_PARTY' });
    if (dispute.status !== 'OPEN') {
      throw new ConflictException({ code: 'INVALID_STATE' });
    }

    const updated = await this.prisma.escrowDispute.update({
      where: { id: disputeId },
      data: {
        status: resolution === 'accept' ? 'RESOLVED' : 'MEDIATION',
        response: response.trim(),
        responded_at: new Date(),
      },
    });
    await this.audit.log(
      responderClientProfileId,
      ESCROW_AUDIT_EVENTS.DISPUTE_RESPONDED,
      'escrow_dispute',
      disputeId,
      { resolution },
      ip,
    );
    return updated;
  }

  /**
   * Moderator-only: resolve a dispute by setting the worker/employer split.
   * worker_pct + employer_refund_pct must sum to 100.
   */
  async resolveDispute(
    disputeId: bigint,
    moderatorAccountId: bigint,
    workerPct: number,
    employerRefundPct: number,
    platformKeptFee: boolean,
    reasoning: string,
    ip?: string,
  ) {
    if (!this.stripe)
      throw new ServiceUnavailableException({ code: 'STRIPE_NOT_CONFIGURED' });
    if (Math.round(workerPct + employerRefundPct) !== 100) {
      throw new BadRequestException({
        code: 'INVALID_SPLIT',
        message: 'Worker % + employer refund % must equal 100.',
      });
    }
    const dispute = await this.prisma.escrowDispute.findUnique({
      where: { id: disputeId },
      include: {
        milestone: {
          include: {
            contract: {
              include: {
                collaboration: {
                  include: {
                    worker: { include: { client_profile: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!dispute) throw new NotFoundException({ code: 'DISPUTE_NOT_FOUND' });
    if (dispute.status === 'RESOLVED')
      throw new ConflictException({ code: 'ALREADY_RESOLVED' });

    const milestone = dispute.milestone;
    const collab = milestone.contract.collaboration;
    const milestoneIdStr = String(milestone.id);
    const workerProfile = collab.worker.client_profile;

    // Compute amounts
    const workerPayoutFull =
      milestone.frozen_worker_payout?.toNumber() ?? milestone.amount.toNumber();
    const workerAmountPence = Math.round(
      ((workerPayoutFull * workerPct) / 100) * 100,
    );
    const employerRefundPence = Math.round(
      ((milestone.amount.toNumber() * employerRefundPct) / 100) * 100,
    );

    let workerTransfer: Stripe.Transfer | null = null;
    let refund: Stripe.Refund | null = null;

    if (
      workerAmountPence > 0 &&
      workerProfile.stripe_connect_account_id &&
      workerProfile.connect_payouts_enabled
    ) {
      workerTransfer = await this.stripe.transfers.create(
        {
          amount: workerAmountPence,
          currency: 'gbp',
          destination: workerProfile.stripe_connect_account_id,
          transfer_group: `escrow_${milestoneIdStr}`,
          metadata: {
            milestone_id: milestoneIdStr,
            kind: 'dispute_worker_share',
            dispute_id: String(disputeId),
          },
        },
        {
          idempotencyKey: `escrow_dispute_${String(disputeId)}_resolve_worker`,
        },
      );
    }

    const charge = await this.findChargePayment(milestone.id);
    if (employerRefundPence > 0 && charge?.stripe_id) {
      refund = await this.stripe.refunds.create(
        {
          payment_intent: charge.stripe_id,
          amount: employerRefundPence,
          refund_application_fee: !platformKeptFee,
        },
        {
          idempotencyKey: `escrow_dispute_${String(disputeId)}_resolve_employer`,
        },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.escrowDispute.update({
        where: { id: disputeId },
        data: {
          status: 'RESOLVED',
          resolution: {
            worker_pct: workerPct,
            employer_refund_pct: employerRefundPct,
            platform_kept_fee: platformKeptFee,
          },
          resolved_by: moderatorAccountId,
          resolved_at: new Date(),
          resolution_reasoning: reasoning,
        },
      });
      // Milestone moves to RELEASED if any worker payout, else REFUNDED.
      const newStatus = workerAmountPence > 0 ? 'RELEASED' : 'REFUNDED';
      await tx.escrowMilestone.update({
        where: { id: milestone.id },
        data: {
          status: newStatus,
          released_at: workerAmountPence > 0 ? new Date() : null,
          refunded_at: employerRefundPence > 0 ? new Date() : null,
        },
      });
      // Ledger rows for the split.
      if (workerAmountPence > 0) {
        await tx.payment.create({
          data: {
            milestone_id: milestone.id,
            client_profile_id: collab.worker_id,
            type: 'WORKER_PAYOUT',
            amount: new Prisma.Decimal(workerAmountPence).div(100),
            currency: 'GBP',
            status: workerTransfer ? 'PAID' : 'PENDING',
            stripe_id: workerTransfer?.id ?? null,
            settled_at: workerTransfer ? new Date() : null,
          },
        });
      }
      if (employerRefundPence > 0) {
        await tx.payment.create({
          data: {
            milestone_id: milestone.id,
            client_profile_id: collab.employer_id,
            type: 'REFUND',
            amount: new Prisma.Decimal(employerRefundPence).div(100),
            currency: 'GBP',
            status: refund ? 'PAID' : 'PENDING',
            stripe_id: refund?.id ?? null,
            settled_at: refund ? new Date() : null,
          },
        });
      }
    });

    await this.audit.log(
      moderatorAccountId,
      ESCROW_AUDIT_EVENTS.DISPUTE_RESOLVED,
      'escrow_dispute',
      disputeId,
      {
        worker_pct: workerPct,
        employer_refund_pct: employerRefundPct,
        platform_kept_fee: platformKeptFee,
        reasoning,
        worker_transfer_id: workerTransfer?.id ?? null,
        refund_id: refund?.id ?? null,
      },
      ip,
    );

    this.postChatSystemMessage(
      collab.id,
      `⚖️ Mediator resolved dispute on milestone "${milestone.title}":\n• Worker: £${(workerAmountPence / 100).toFixed(2)} (${workerPct}%)\n• Employer refund: £${(employerRefundPence / 100).toFixed(2)} (${employerRefundPct}%)\n\nReasoning: ${reasoning}`,
      collab.employer_id, // moderator isn't a participant; use employer as sender placeholder
    );

    return this.prisma.escrowDispute.findUniqueOrThrow({
      where: { id: disputeId },
    });
  }

  async listOpenDisputes() {
    return this.prisma.escrowDispute.findMany({
      where: { status: { in: ['OPEN', 'RESPONDED', 'MEDIATION'] } },
      orderBy: { created_at: 'asc' },
      include: {
        milestone: {
          include: {
            contract: {
              include: {
                collaboration: {
                  include: {
                    worker: { include: { client_profile: true } },
                    employer: { include: { client_profile: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async cancelEscrow(
    contractId: bigint,
    actorClientProfileId: bigint,
    reason: string,
    ip?: string,
  ) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { collaboration: true, milestones: true },
    });
    if (!contract) throw new NotFoundException({ code: 'CONTRACT_NOT_FOUND' });
    const isParty =
      contract.collaboration.worker_id === actorClientProfileId ||
      contract.collaboration.employer_id === actorClientProfileId;
    if (!isParty) throw new ForbiddenException({ code: 'NOT_PARTY' });

    const everFunded = contract.milestones.some((m) =>
      [
        'FUNDED',
        'SUBMITTED',
        'RELEASED',
        'DISPUTED',
        'REFUNDED',
        'RELEASE_FAILED',
      ].includes(m.status),
    );
    if (everFunded) {
      throw new ConflictException({
        code: 'ALREADY_FUNDED',
        message:
          'Cannot cancel — at least one milestone has been funded. Use decline (worker) or refund/dispute (employer) instead.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.escrowMilestone.updateMany({
        where: { contract_id: contractId, status: 'PENDING' },
        data: { status: 'CANCELED' },
      });
      await tx.contract.update({
        where: { id: contractId },
        data: { status: 'ENDED', end_reason: 'CANCELED', ended_at: new Date() },
      });
    });

    await this.audit.log(
      actorClientProfileId,
      ESCROW_AUDIT_EVENTS.CONTRACT_CANCELED,
      'contract',
      contractId,
      { reason, canceled_by: String(actorClientProfileId), refunded_count: 0 },
      ip,
    );
    this.postChatSystemMessage(
      contract.collaboration_id,
      `🚫 Contract canceled before any milestones were funded.\n\nReason: ${reason}`,
      actorClientProfileId,
    );
    return { ok: true };
  }

  async declineContract(
    contractId: bigint,
    workerClientProfileId: bigint,
    reason: string,
    ip?: string,
  ) {
    if (!this.stripe)
      throw new ServiceUnavailableException({ code: 'STRIPE_NOT_CONFIGURED' });
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { collaboration: true, milestones: true },
    });
    if (!contract) throw new NotFoundException({ code: 'CONTRACT_NOT_FOUND' });
    if (contract.collaboration.worker_id !== workerClientProfileId) {
      throw new ForbiddenException({ code: 'NOT_WORKER' });
    }

    let refundedCount = 0;
    let refundedAmount = new Prisma.Decimal(0);
    for (const m of contract.milestones) {
      if (['FUNDED', 'SUBMITTED'].includes(m.status)) {
        const charge = await this.findChargePayment(m.id);
        if (!charge?.stripe_id) continue;
        try {
          const r = await this.stripe.refunds.create(
            { payment_intent: charge.stripe_id },
            {
              idempotencyKey: `escrow_milestone_${String(m.id)}_decline_refund`,
            },
          );
          await this.prisma.$transaction(async (tx) => {
            await tx.escrowMilestone.update({
              where: { id: m.id },
              data: {
                status: 'REFUNDED',
                refunded_at: new Date(),
                refund_reason: 'Worker declined contract',
              },
            });
            await tx.payment.create({
              data: {
                milestone_id: m.id,
                client_profile_id: contract.collaboration.employer_id,
                type: 'REFUND',
                amount: new Prisma.Decimal(r.amount).div(100),
                currency: (r.currency ?? 'gbp').toUpperCase(),
                status: 'PAID',
                stripe_id: r.id,
                settled_at: new Date(),
              },
            });
          });
          refundedCount += 1;
          refundedAmount = refundedAmount.plus(m.amount);
        } catch (err) {
          this.logger.error(
            `Decline refund failed for milestone ${m.id}: ${(err as Error).message}`,
          );
        }
      } else if (m.status === 'PENDING') {
        await this.prisma.escrowMilestone.update({
          where: { id: m.id },
          data: { status: 'CANCELED' },
        });
      }
    }

    await this.prisma.contract.update({
      where: { id: contractId },
      data: { status: 'ENDED', end_reason: 'CANCELED', ended_at: new Date() },
    });
    await this.audit.log(
      workerClientProfileId,
      ESCROW_AUDIT_EVENTS.CONTRACT_CANCELED,
      'contract',
      contractId,
      {
        reason,
        canceled_by: String(workerClientProfileId),
        actor_role: 'worker_decline',
        refunded_count: refundedCount,
        refunded_amount: refundedAmount.toString(),
      },
      ip,
    );
    this.postChatSystemMessage(
      contract.collaboration_id,
      `🚫 Worker declined the contract. ${refundedCount} milestone${refundedCount === 1 ? '' : 's'} refunded (£${refundedAmount.toFixed(2)} total).\n\nReason: ${reason}`,
      workerClientProfileId,
    );
    return {
      ok: true,
      refunded_count: refundedCount,
      refunded_amount: refundedAmount.toString(),
    };
  }

  /**
   * @deprecated Replaced by ContractService.endContract. Kept for HTTP
   * back-compat — delegates to the new path.
   */
  async initiateEndContract(
    contractId: bigint,
    actorClientProfileId: bigint,
    ip?: string,
  ) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { collaboration: true },
    });
    if (!contract) throw new NotFoundException({ code: 'CONTRACT_NOT_FOUND' });
    const isParty =
      contract.collaboration.worker_id === actorClientProfileId ||
      contract.collaboration.employer_id === actorClientProfileId;
    if (!isParty) throw new ForbiddenException({ code: 'NOT_PARTY' });
    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: {
        status: 'ENDED',
        end_reason: 'COMPLETED',
        ended_at: new Date(),
      },
    });
    await this.audit.log(
      actorClientProfileId,
      ESCROW_AUDIT_EVENTS.CONTRACT_ENDED,
      'contract',
      contractId,
      { initiated_by: String(actorClientProfileId) },
      ip,
    );
    this.postChatSystemMessage(
      contract.collaboration_id,
      `🏁 Contract ended. Review window now open.`,
      actorClientProfileId,
    );
    return updated;
  }

  /**
   * No-op stub — silent contest sweep is no longer used after the Contract
   * refactor. Kept for cron back-compat.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async runEndContractSweep() {
    return { ended: 0 };
  }

  // ─── Wallet + Admin settings (Slice E) ────────────────────────

  async getWallet(workerProfileId: bigint) {
    const [profile, milestones, pendingPayments] = await Promise.all([
      this.prisma.clientProfile.findUnique({
        where: { id: workerProfileId },
        select: {
          id: true,
          stripe_connect_account_id: true,
          connect_charges_enabled: true,
          connect_payouts_enabled: true,
          stripe_onboarding_complete: true,
        },
      }),
      this.prisma.escrowMilestone.findMany({
        where: {
          contract: { collaboration: { worker_id: workerProfileId } },
        },
        orderBy: { updated_at: 'desc' },
        take: 100,
        select: {
          id: true,
          title: true,
          amount: true,
          status: true,
          contract_id: true,
          released_at: true,
          frozen_worker_payout: true,
        },
      }),
      // Worker payouts + referral commissions still awaiting Stripe payout.
      this.prisma.payment.findMany({
        where: {
          client_profile_id: workerProfileId,
          type: {
            in: [
              'WORKER_PAYOUT',
              'REFERRAL_ACCOUNT',
              'REFERRAL_W2W',
              'REFERRAL_E2E',
            ],
          },
          status: { in: ['PENDING', 'FAILED'] },
        },
        orderBy: { created_at: 'desc' },
        include: {
          milestone: { select: { title: true, contract_id: true } },
        },
      }),
    ]);
    if (!profile) throw new NotFoundException({ code: 'PROFILE_NOT_FOUND' });

    const active = milestones.filter((m) =>
      ['FUNDED', 'SUBMITTED'].includes(m.status),
    );
    const released = milestones.filter((m) => m.status === 'RELEASED');
    const failed = milestones.filter((m) => m.status === 'RELEASE_FAILED');

    const pendingWorkerPayouts = pendingPayments.filter(
      (p) => p.type === 'WORKER_PAYOUT',
    );
    const pendingReferralPayouts = pendingPayments.filter((p) =>
      ['REFERRAL_ACCOUNT', 'REFERRAL_W2W', 'REFERRAL_E2E'].includes(p.type),
    );

    return {
      onboarding: {
        has_account: !!profile.stripe_connect_account_id,
        payouts_enabled: profile.connect_payouts_enabled,
      },
      active_escrow: active.map((m) => ({
        milestone_id: String(m.id),
        title: m.title,
        amount: m.amount.toString(),
        status: m.status,
        contract_id: String(m.contract_id),
        expected_payout:
          m.frozen_worker_payout?.toString() ?? m.amount.toString(),
      })),
      released_history: released.map((m) => ({
        milestone_id: String(m.id),
        title: m.title,
        amount: m.frozen_worker_payout?.toString() ?? m.amount.toString(),
        released_at: m.released_at?.toISOString() ?? null,
        contract_id: String(m.contract_id),
      })),
      // Money authorised by the employer (milestone RELEASED) but not yet
      // paid out — the worker hasn't completed Stripe Connect onboarding or
      // a live transfer hit a transient rejection. Auto-paid on the
      // `account.updated → payouts_enabled` webhook.
      pending_worker_payouts: pendingWorkerPayouts.map((p) => ({
        id: String(p.id),
        amount: p.amount.toString(),
        milestone_id: String(p.milestone_id),
        milestone_title: p.milestone.title,
        contract_id: String(p.milestone.contract_id),
        status: p.status,
        failure_reason: p.failure_reason,
        created_at: p.created_at.toISOString(),
      })),
      pending_referral_payouts: pendingReferralPayouts.map((p) => ({
        id: String(p.id),
        amount: p.amount.toString(),
        milestone_title: p.milestone.title,
        status: p.status,
        created_at: p.created_at.toISOString(),
      })),
      failed_transfers: failed.map((m) => ({
        milestone_id: String(m.id),
        amount: m.frozen_worker_payout?.toString() ?? m.amount.toString(),
        contract_id: String(m.contract_id),
        title: m.title,
      })),
    };
  }

  async updatePlatformSettings(
    actorAccountId: bigint,
    patch: {
      client_marketplace_fee_percent?: number;
      freelancer_service_fee_percent?: number;
      referral_commission_percent?: number;
      stripe_fee_passthrough?: string;
    },
    ip?: string,
  ) {
    // Validate ranges
    const validatePct = (v: number | undefined, max: number, name: string) => {
      if (v == null) return;
      if (!Number.isFinite(v) || v < 0 || v > max) {
        throw new BadRequestException({
          code: 'INVALID_RANGE',
          message: `${name} must be between 0 and ${max}.`,
        });
      }
    };
    validatePct(
      patch.client_marketplace_fee_percent,
      50,
      'Client marketplace fee',
    );
    validatePct(
      patch.freelancer_service_fee_percent,
      50,
      'Freelancer service fee',
    );
    validatePct(patch.referral_commission_percent, 25, 'Referral commission');
    if (
      patch.stripe_fee_passthrough &&
      !['EMPLOYER_PAYS', 'PLATFORM_ABSORBS', 'WORKER_ABSORBS'].includes(
        patch.stripe_fee_passthrough,
      )
    ) {
      throw new BadRequestException({ code: 'INVALID_PASSTHROUGH_MODE' });
    }

    const before = await this.getPlatformSetting();
    // `referral_commission_percent` is not a column — referral percentages
    // are configured separately; ignore it on the settings patch.
    const { referral_commission_percent: _drop, ...settingPatch } = patch;
    const updated = await this.prisma.platformSetting.update({
      where: { id: 1 },
      data: {
        ...settingPatch,
        updated_by: actorAccountId,
      },
    });
    await this.audit.log(
      actorAccountId,
      ESCROW_AUDIT_EVENTS.PLATFORM_SETTINGS_CHANGED,
      'platform_setting',
      BigInt(1),
      {
        from: {
          client_marketplace_fee_percent:
            before.client_marketplace_fee_percent.toString(),
          freelancer_service_fee_percent:
            before.freelancer_service_fee_percent.toString(),
          account_referral_pct: before.account_referral_pct.toString(),
          account_referral_window_months: before.account_referral_window_months,
          project_referral_w2w_pct: before.project_referral_w2w_pct.toString(),
          project_referral_e2e_pct: before.project_referral_e2e_pct.toString(),
          stripe_fee_passthrough: before.stripe_fee_passthrough,
        },
        to: {
          client_marketplace_fee_percent:
            updated.client_marketplace_fee_percent.toString(),
          freelancer_service_fee_percent:
            updated.freelancer_service_fee_percent.toString(),
          account_referral_pct: updated.account_referral_pct.toString(),
          account_referral_window_months:
            updated.account_referral_window_months,
          project_referral_w2w_pct: updated.project_referral_w2w_pct.toString(),
          project_referral_e2e_pct: updated.project_referral_e2e_pct.toString(),
          stripe_fee_passthrough: updated.stripe_fee_passthrough,
        },
      },
      ip,
    );
    return updated;
  }

  // ─── Contract-keyed escrow surface ─────────────────────────────

  /**
   * Get the escrow view for a contract — the contract status + its ordered
   * milestones. There is no separate escrow row anymore; `contract_id` IS the
   * escrow key.
   */
  async getByContract(contractId: bigint, user: CurrentUserPayload) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        collaboration: true,
        milestones: { orderBy: { position: 'asc' } },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');

    if (!user.isStaff) {
      const cp = user.clientProfileId;
      if (
        cp == null ||
        (contract.collaboration.worker_id !== cp &&
          contract.collaboration.employer_id !== cp)
      ) {
        throw new ForbiddenException('Cannot access this escrow');
      }
    }

    return {
      contract_id: contract.id,
      collaboration_id: contract.collaboration_id,
      status: contract.status,
      agreed_amount: contract.agreed_amount,
      milestones: contract.milestones,
    };
  }

  /**
   * Back-compat: old surface that accepted collaborationId. Resolves to the
   * latest active contract under the collab and returns its escrow view.
   */
  async getByCollaboration(collaborationId: bigint, user: CurrentUserPayload) {
    const collaboration = await this.prisma.collaboration.findUnique({
      where: { id: collaborationId },
      include: {
        contracts: {
          where: { status: { in: ['ACTIVE', 'PROPOSED'] } },
          orderBy: { position: 'desc' },
          take: 1,
        },
      },
    });
    if (!collaboration) throw new NotFoundException('Collaboration not found');
    const latest = collaboration.contracts[0];
    if (!latest) return null;
    return this.getByContract(latest.id, user);
  }

  /**
   * Provider feature flag — SPA reads this to hide Fund/Withdraw CTAs
   * when Stripe Connect isn't configured.
   */
  getProviders() {
    return {
      stripe_connect: this.stripe != null,
    };
  }
}
