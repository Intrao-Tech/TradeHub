import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  computeCisDeduction,
  resolveCisRate,
  cisApplies,
  type CisBreakdown,
} from './cis-calculator';
import {
  CIS_UNREGISTERED_RATE,
  type CisStatus,
  type CisMode,
} from './cis.constants';

/**
 * The caller of a milestone-scoped CIS read. When supplied, the read is gated
 * to the contract's worker/employer party or staff (prevents IDOR on the
 * breakdown/PDS endpoints). Internal/server callers pass nothing and bypass it.
 */
export type CisCaller = { clientProfileId: bigint | null; isStaff: boolean };

/**
 * Orchestration layer for CIS. The pure math lives in cis-calculator; this
 * service resolves the handling mode, confirms a worker's CIS standing (writing
 * a verification milestone), computes a milestone's breakdown from live data,
 * builds the on-demand PDS, and enforces the apply-gate.
 *
 * The escrow release flow and the V2 monthly-return service both lean on
 * `getMilestoneCisContext` so the deduction is computed in exactly one place.
 */
@Injectable()
export class CisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The global platform CIS handling mode (the V1↔V2 master switch). Stored on
   * platform_setting id=1; defaults to ASSIST (V1) when unset.
   */
  async getGlobalMode(): Promise<CisMode> {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { id: 1 },
      select: { cis_handling_mode: true },
    });
    return setting?.cis_handling_mode === 'MANAGED' ? 'MANAGED' : 'ASSIST';
  }

  /**
   * Flip the global CIS handling mode (ASSIST ↔ MANAGED). This is the seam that
   * turns V2 withholding on/off platform-wide; per-employer overrides still win.
   */
  async setGlobalMode(
    mode: CisMode,
    staffMemberId?: bigint | null,
    ip?: string,
  ): Promise<CisMode> {
    await this.prisma.platformSetting.upsert({
      where: { id: 1 },
      update: { cis_handling_mode: mode },
      create: { id: 1, cis_handling_mode: mode },
    });
    await this.audit.log(
      staffMemberId ?? null,
      'cis.global_mode_changed',
      'platform_setting',
      BigInt(1),
      { mode },
      ip,
    );
    return mode;
  }

  /**
   * The effective CIS handling mode for an employer: their per-employer
   * override if set, else the global platform default. This is the V1↔V2 seam.
   */
  async resolveModeForEmployer(employerClientProfileId: bigint): Promise<CisMode> {
    const [employer, setting] = await Promise.all([
      this.prisma.employerProfile.findUnique({
        where: { id: employerClientProfileId },
        select: { cis_handling_mode_override: true },
      }),
      this.prisma.platformSetting.findUnique({ where: { id: 1 } }),
    ]);
    const override = employer?.cis_handling_mode_override;
    if (override === 'ASSIST' || override === 'MANAGED') return override;
    const global = setting?.cis_handling_mode;
    return global === 'MANAGED' ? 'MANAGED' : 'ASSIST';
  }

  /**
   * Apply-gate: a worker cannot apply to jobs until their CIS standing is
   * confirmed (status != NONE). "Confirmed absent" (UNREGISTERED → 30%) counts
   * as confirmed — only the unresolved NONE blocks.
   */
  async assertWorkerCanApply(workerClientProfileId: bigint): Promise<void> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerClientProfileId },
      select: { cis_status: true },
    });
    if (!worker) {
      throw new BadRequestException({
        code: 'NO_WORKER_PROFILE',
        message: 'Worker profile required.',
      });
    }
    if (worker.cis_status === 'NONE') {
      throw new ForbiddenException({
        code: 'CIS_NOT_CONFIRMED',
        message:
          'Confirm your CIS (Construction Industry Scheme) status before applying for work.',
      });
    }
  }

  /**
   * Set a worker's CIS standing. Two callers:
   *   - the worker themselves (self-declaration: `verified=false`) — declares
   *     they are registered / gross / not registered. This unlocks the
   *     apply-gate and drives the V1 breakdown, but is NOT an HMRC-verified
   *     rate (`cis_verified_at` stays null).
   *   - staff / the V2 HMRC verify API (`verified=true`) — the authoritative
   *     check; stamps `cis_verified_at` and records the staff member.
   *
   * Sets the rate, records a verification milestone, and audit-logs it.
   */
  async confirmWorkerCis(input: {
    workerClientProfileId: bigint;
    status: CisStatus;
    verificationNumber?: string | null;
    staffMemberId?: bigint | null;
    /** true = HMRC/staff-verified (authoritative); false = worker self-declared. */
    verified?: boolean;
    ip?: string;
  }): Promise<void> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: input.workerClientProfileId },
      select: { id: true },
    });
    if (!worker) throw new NotFoundException('Worker profile not found');

    const verified = input.verified ?? true;
    const rate =
      input.status === 'NONE'
        ? null
        : resolveCisRate(input.status, undefined);
    const verifiedAt =
      verified && input.status !== 'NONE' ? new Date() : null;

    await this.prisma.$transaction([
      this.prisma.workerProfile.update({
        where: { id: input.workerClientProfileId },
        data: {
          cis_status: input.status,
          cis_rate: rate,
          cis_verification_number: input.verificationNumber ?? null,
          cis_verified_at: verifiedAt,
        },
      }),
      this.prisma.verificationMilestone.create({
        data: {
          client_profile_id: input.workerClientProfileId,
          milestone_type: 'HMRC_CIS_VERIFIED',
          staff_member_id: input.staffMemberId ?? null,
          notes: `${verified ? 'verified' : 'self-declared'}: ${input.status}${rate != null ? ` (${rate}%)` : ''}`,
        },
      }),
    ]);

    await this.audit.log(
      input.staffMemberId ?? input.workerClientProfileId,
      verified ? 'cis.status_confirmed' : 'cis.status_declared',
      'client_profile',
      input.workerClientProfileId,
      {
        status: input.status,
        rate,
        verified,
        verification_number: input.verificationNumber ?? null,
      },
      input.ip,
    );
  }

  /**
   * Mark a worker's CIS standing VERIFIED off the back of an APPROVED HMRC CIS
   * document review — evidence-based: a staff reviewer checked the submitted
   * UTR/NI before approving. The doc-review pipeline already writes the
   * HMRC_CIS_VERIFIED milestone, so this only stamps cis_verified_at + the
   * verification reference. No-op when the worker never declared a status.
   */
  async markCisVerifiedFromReview(
    workerClientProfileId: bigint,
    verificationNumber: string | null,
    staffMemberId?: bigint | null,
    ip?: string,
  ): Promise<void> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerClientProfileId },
      select: { cis_status: true },
    });
    if (!worker || worker.cis_status === 'NONE') return;
    await this.prisma.workerProfile.update({
      where: { id: workerClientProfileId },
      data: {
        cis_verified_at: new Date(),
        ...(verificationNumber
          ? { cis_verification_number: verificationNumber }
          : {}),
      },
    });
    await this.audit.log(
      staffMemberId ?? null,
      'cis.verified_via_document',
      'client_profile',
      workerClientProfileId,
      { verification_number: verificationNumber },
      ip,
    );
  }

  /**
   * Revoke a worker's CIS verification — e.g. their HMRC CIS document was
   * rejected. The declared status remains (so they can resubmit) but it is no
   * longer "verified" to employers.
   */
  async clearCisVerification(
    workerClientProfileId: bigint,
    staffMemberId?: bigint | null,
    ip?: string,
  ): Promise<void> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerClientProfileId },
      select: { cis_verified_at: true },
    });
    if (!worker || worker.cis_verified_at == null) return;
    await this.prisma.workerProfile.update({
      where: { id: workerClientProfileId },
      data: { cis_verified_at: null },
    });
    await this.audit.log(
      staffMemberId ?? null,
      'cis.verification_revoked',
      'client_profile',
      workerClientProfileId,
      {},
      ip,
    );
  }

  /**
   * A worker's own CIS standing — for the profile UI. Returns the declared
   * status, resolved rate, verification number, whether it has been
   * HMRC/staff-verified (vs merely self-declared), and the review status of
   * their latest HMRC CIS evidence document (NONE/PENDING/APPROVED/REJECTED).
   */
  async getWorkerCis(workerClientProfileId: bigint): Promise<{
    status: CisStatus;
    rate: number | null;
    verification_number: string | null;
    verified: boolean;
    verified_at: string | null;
    document_status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  }> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerClientProfileId },
      select: {
        cis_status: true,
        cis_rate: true,
        cis_verification_number: true,
        cis_verified_at: true,
      },
    });
    if (!worker) throw new NotFoundException('Worker profile not found');

    // Latest HMRC CIS evidence document + its review state.
    const doc = await this.prisma.document.findFirst({
      where: {
        doc_type: 'HMRC_CIS_DOCUMENT',
        reviewable_item: { client_profile_id: workerClientProfileId },
      },
      orderBy: { reviewable_item: { created_at: 'desc' } },
      select: {
        reviewable_item: {
          select: {
            review_items: {
              orderBy: { created_at: 'desc' },
              take: 1,
              select: { status: true },
            },
          },
        },
      },
    });
    const documentStatus = (doc?.reviewable_item.review_items[0]?.status ??
      'NONE') as 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

    return {
      status: (worker.cis_status ?? 'NONE') as CisStatus,
      rate: worker.cis_rate ?? null,
      verification_number: worker.cis_verification_number ?? null,
      verified: worker.cis_verified_at != null,
      verified_at: worker.cis_verified_at?.toISOString() ?? null,
      document_status: documentStatus,
    };
  }

  /**
   * Live CIS context for a milestone: whether CIS applies, the mode, the rate,
   * the labour/materials split, and the computed breakdown. The single place
   * the deduction is derived — used by the UI, the release flow and the PDS.
   */
  async getMilestoneCisContext(
    milestoneId: bigint,
    caller?: CisCaller,
  ): Promise<{
    applies: boolean;
    mode: CisMode;
    workerClientProfileId: bigint;
    employerClientProfileId: bigint;
    workerCisStatus: CisStatus;
    verificationNumber: string | null;
    verified: boolean;
    breakdown: CisBreakdown;
    // The amount the worker actually receives on-platform once funded: the
    // frozen worker payout (already net of CIS in ASSIST) minus any MANAGED
    // withholding. Differs from breakdown.netToWorker (the HMRC/PDS figure =
    // gross − CIS) because it also reflects the platform service fee. Null
    // before funding (no frozen snapshot to base it on).
    actualWorkerPayout: Prisma.Decimal | null;
  } | null> {
    const milestone = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
      select: {
        amount: true,
        labour_amount: true,
        materials_amount: true,
        frozen_worker_payout: true,
        frozen_freelancer_fee_pct: true,
        frozen_cis_mode: true,
        frozen_cis_rate: true,
        frozen_cis_amount: true,
        contract: {
          select: {
            collaboration: {
              select: {
                worker_id: true,
                employer_id: true,
                worker: {
                  select: {
                    cis_status: true,
                    cis_rate: true,
                    cis_verification_number: true,
                    cis_verified_at: true,
                  },
                },
                employer: {
                  select: { is_cis_contractor: true },
                },
              },
            },
          },
        },
      },
    });
    if (!milestone) return null;

    const collab = milestone.contract.collaboration;
    const workerProfile = collab.worker;
    const employerProfile = collab.employer;

    // Authorization: when a caller is supplied (HTTP read path), only the
    // contract's worker/employer party or staff may see the figures — prevents
    // IDOR enumeration of other contracts' financials + worker tax identifiers.
    if (
      caller &&
      !caller.isStaff &&
      caller.clientProfileId !== collab.worker_id &&
      caller.clientProfileId !== collab.employer_id
    ) {
      throw new ForbiddenException({
        code: 'NOT_PARTY',
        message: 'Only the worker or employer party can view this CIS breakdown.',
      });
    }

    const workerCisStatus = (workerProfile?.cis_status ?? 'NONE') as CisStatus;
    const employerIsContractor = employerProfile?.is_cis_contractor === true;

    // Once a milestone is FUNDED its CIS is locked (frozen_cis_*). Display the
    // frozen mode/rate/applies so the breakdown + PDS match exactly what the
    // employer was charged and what the worker will be paid, even if the
    // worker's live CIS status changes afterwards. Before funding (no frozen
    // snapshot) we compute live as a preview.
    const hasFrozenCis =
      milestone.frozen_cis_mode != null && milestone.frozen_cis_amount != null;

    // CIS only ever frozen when it applied with a >0 deduction, so a frozen
    // milestone always "applies" regardless of the worker's current status.
    const applies =
      hasFrozenCis || cisApplies({ employerIsContractor, workerCisStatus });

    // Labour/materials. Resolve atomically so gross always reconciles to the
    // milestone amount: materials defaults to 0; labour, when unset, is the
    // amount MINUS materials (not the full amount) so a materials-only split
    // can't overstate gross/over-deduct. Whole amount is labour when CIS
    // applies and neither is set.
    const materials = milestone.materials_amount ?? new Prisma.Decimal(0);
    const rawLabour =
      milestone.labour_amount ??
      (applies ? milestone.amount.sub(materials) : new Prisma.Decimal(0));

    // CIS is charged on the worker's ACTUAL labour income — i.e. labour minus
    // OUR platform service fee (the fee is our revenue, not the worker's pay).
    // So a £1000 milestone with a 10% worker fee is deducted on £900, not
    // £1000. The fee % is taken from the frozen snapshot once funded (so it
    // matches what was charged), else from the current platform setting.
    let freelancerFeePct: Prisma.Decimal;
    if (milestone.frozen_freelancer_fee_pct != null) {
      freelancerFeePct = new Prisma.Decimal(milestone.frozen_freelancer_fee_pct);
    } else {
      const settings = await this.prisma.platformSetting.findUnique({
        where: { id: 1 },
        select: { freelancer_service_fee_percent: true },
      });
      freelancerFeePct = new Prisma.Decimal(
        settings?.freelancer_service_fee_percent ?? 0,
      );
    }
    const workerFee = milestone.amount
      .mul(freelancerFeePct)
      .div(100)
      .toDecimalPlaces(2);
    // Labour subject to CIS = labour − our worker fee, never below 0.
    const labour = Prisma.Decimal.max(
      rawLabour.sub(workerFee),
      new Prisma.Decimal(0),
    );

    const mode = hasFrozenCis
      ? (milestone.frozen_cis_mode as CisMode)
      : await this.resolveModeForEmployer(collab.employer_id);

    // Rate. For ACTUAL withholding (MANAGED) we will not trust an unverified
    // self-declaration: an unverified worker is withheld at the 30% unregistered
    // default until staff/HMRC confirm them. In ASSIST (display only, employer
    // remits) we show the declared rate as-is.
    const verified = workerProfile?.cis_verified_at != null;
    const rate = !applies
      ? 0
      : hasFrozenCis
        ? Number(milestone.frozen_cis_rate ?? 0)
        : mode === 'MANAGED' && !verified
          ? CIS_UNREGISTERED_RATE
          : resolveCisRate(workerCisStatus, workerProfile?.cis_rate ?? null);

    const breakdown = computeCisDeduction({
      labour,
      materials,
      rate,
      applies,
    });

    // Actual on-platform payout to the worker (after our service fee + any
    // MANAGED withholding). Known once funded via the frozen snapshot.
    let actualWorkerPayout: Prisma.Decimal | null = null;
    if (milestone.frozen_worker_payout != null) {
      const managedWithheld =
        milestone.frozen_cis_mode === 'MANAGED' &&
        milestone.frozen_cis_amount != null
          ? milestone.frozen_cis_amount
          : new Prisma.Decimal(0);
      actualWorkerPayout = Prisma.Decimal.max(
        milestone.frozen_worker_payout.sub(managedWithheld),
        new Prisma.Decimal(0),
      );
    }

    return {
      applies,
      mode,
      workerClientProfileId: collab.worker_id,
      employerClientProfileId: collab.employer_id,
      workerCisStatus,
      verificationNumber: workerProfile?.cis_verification_number ?? null,
      verified,
      breakdown,
      actualWorkerPayout,
    };
  }

  /**
   * On-demand Payment & Deduction Statement (PDS) for a milestone. Built from
   * live data — no stored row in V1. Returns the figures a contractor must give
   * the subcontractor (gross, materials, deducted) within 14 days of the tax
   * month end.
   */
  async buildPds(
    milestoneId: bigint,
    caller?: CisCaller,
  ): Promise<{
    milestone_id: string;
    gross_paid: string;
    cost_of_materials: string;
    amount_deducted: string;
    net_paid: string;
    cis_rate: number;
    verification_number: string | null;
    applies: boolean;
  } | null> {
    const ctx = await this.getMilestoneCisContext(milestoneId, caller);
    if (!ctx) return null;
    const b = ctx.breakdown;
    return {
      milestone_id: String(milestoneId),
      gross_paid: b.gross.toFixed(2),
      cost_of_materials: b.materials.toFixed(2),
      amount_deducted: b.deduction.toFixed(2),
      net_paid: b.netToWorker.toFixed(2),
      cis_rate: b.rate,
      verification_number: ctx.verificationNumber,
      applies: ctx.applies,
    };
  }
}
