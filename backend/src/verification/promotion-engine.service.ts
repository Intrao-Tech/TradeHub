import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CERT_DOC_TYPES, type VerificationLevel } from './constants';

type EvaluationContext = {
  isWorker: boolean;
  hasIdentityVerified: boolean;
  approvedDocTypes: Set<string>;
  // Reviews count — left for the future Reviews feature; today always 0.
  verifiedReviewsCount: number;
  // Companies House verification — auxiliary milestone, prerequisite for employer Premium.
  hasCompanyHouseVerified: boolean;
};

type PromotionResult = {
  from: VerificationLevel;
  to: VerificationLevel;
} | null;

/**
 * Decides the target `verification_level` for a client profile from the
 * union of evidence (Stripe Identity milestones + approved trade
 * certifications + Companies House check + verified reviews) and writes
 * the cached `client_profile.verification_level` if it differs.
 *
 * Intentionally split from `VerificationService` — `PromotionEngine` is
 * the *deciding* layer (pure-ish predicate truth table); `VerificationService`
 * is the orchestrating layer (Stripe, audit, mail).
 *
 * The engine is **idempotent**: running twice on the same evidence yields
 * the same level and writes nothing the second time.
 */
@Injectable()
export class PromotionEngine {
  private readonly logger = new Logger(PromotionEngine.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Pure predicate. Given the evidence context, returns the highest level the
   * profile qualifies for. Easy to unit-test with hand-rolled contexts.
   */
  evaluate(ctx: EvaluationContext): VerificationLevel {
    if (!ctx.hasIdentityVerified) return 'UNVERIFIED';

    const isCertified = ctx.isWorker
      ? Array.from(ctx.approvedDocTypes).some((t) =>
          CERT_DOC_TYPES.includes(t as (typeof CERT_DOC_TYPES)[number]),
        )
      : ctx.approvedDocTypes.has('INSURANCE') &&
        ctx.approvedDocTypes.has('COMPANY_LETTERHEAD');
    if (!isCertified) return 'BASIC';

    // Premium predicate. Workers need 5+ verified reviews; employers also
    // need Companies House. Reviews not shipped yet (verifiedReviewsCount === 0
    // always today) so this branch returns CERTIFIED in practice.
    const isPremium = ctx.isWorker
      ? ctx.verifiedReviewsCount >= 5
      : ctx.verifiedReviewsCount >= 5 && ctx.hasCompanyHouseVerified;
    if (!isPremium) return 'CERTIFIED';

    return 'PREMIUM';
  }

  /**
   * Loads the profile's evidence, computes the target level, writes the
   * cache and a `LEVEL_PROMOTED` milestone if it changes, and audit-logs
   * the transition.
   *
   * `evidenceMilestoneIds` is the list of milestone IDs that triggered this
   * run (used as `evidence_ref` on the `LEVEL_PROMOTED` row for traceability).
   */
  async runPromotion(
    clientProfileId: bigint,
    evidence: {
      milestoneIds: bigint[];
      staffMemberId: bigint | null;
      ip?: string;
    },
  ): Promise<PromotionResult> {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      include: {
        worker_profile: { select: { id: true } },
        employer_profile: { select: { id: true } },
        account: { select: { status: true } },
      },
    });
    if (!profile) return null;
    if (profile.account.status !== 'ACTIVE') {
      // Don't promote deactivated/pending users — their level stays where it was.
      return null;
    }

    const ctx = await this.gatherEvidence(
      clientProfileId,
      !!profile.worker_profile,
    );
    const newLevel = this.evaluate(ctx);
    const currentLevel = (profile.verification_level ??
      'UNVERIFIED') as VerificationLevel;

    if (newLevel === currentLevel) return null;

    await this.prisma.$transaction([
      this.prisma.clientProfile.update({
        where: { id: clientProfileId },
        data: { verification_level: newLevel },
      }),
      this.prisma.verificationMilestone.create({
        data: {
          client_profile_id: clientProfileId,
          milestone_type: 'LEVEL_PROMOTED',
          staff_member_id: evidence.staffMemberId,
          evidence_ref:
            evidence.milestoneIds.length > 0
              ? evidence.milestoneIds.map(String).join(',')
              : null,
          notes: newLevel,
        },
      }),
    ]);

    await this.audit.log(
      clientProfileId,
      'verification.level_changed',
      'client_profile',
      clientProfileId,
      {
        from: currentLevel,
        to: newLevel,
        evidence_milestones: evidence.milestoneIds.map(String),
      },
      evidence.ip,
    );

    this.logger.log(
      `Promotion: client_profile=${clientProfileId} ${currentLevel} → ${newLevel}`,
    );

    return { from: currentLevel, to: newLevel };
  }

  /**
   * Reads the union of evidence for a profile from milestones + approved
   * documents. Reviews count is hard-zero today — the Reviews feature
   * will inject the real count when it ships.
   */
  private async gatherEvidence(
    clientProfileId: bigint,
    isWorker: boolean,
  ): Promise<EvaluationContext> {
    const [milestones, approvedDocs] = await Promise.all([
      this.prisma.verificationMilestone.findMany({
        where: { client_profile_id: clientProfileId },
        select: { milestone_type: true },
      }),
      this.prisma.document.findMany({
        where: { client_profile_id: clientProfileId, status: 'APPROVED' },
        select: { doc_type: true },
      }),
    ]);

    const milestoneTypes = new Set(milestones.map((m) => m.milestone_type));

    return {
      isWorker,
      hasIdentityVerified: milestoneTypes.has('IDENTITY_VERIFIED'),
      approvedDocTypes: new Set(approvedDocs.map((d) => d.doc_type)),
      hasCompanyHouseVerified: milestoneTypes.has('COMPANY_HOUSE_VERIFIED'),
      verifiedReviewsCount: 0,
    };
  }
}
