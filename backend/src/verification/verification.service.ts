import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { STRIPE_CLIENT } from '../stripe/stripe.module';
import { PromotionEngine } from './promotion-engine.service';
import { type VerificationLevel } from './constants';

type LadderRungState = 'DONE' | 'IN_PROGRESS' | 'NOT_STARTED' | 'COMING_SOON';

/**
 * Stripe Identity orchestration plus the "give me everything" reads
 * (`/verification/me`, `/verification/levels/:id`, `/verification/ladder/:id`).
 *
 * Document review and assignment are owned by their dedicated services in
 * this module; this class is the umbrella that the controller calls into.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
    private readonly promotionEngine: PromotionEngine,
    private readonly mail: MailService,
  ) {}

  // ─── Stripe Identity (path to Basic) ───────────────────────────

  async startIdentitySession(clientProfileId: bigint, ip?: string) {
    if (!this.stripe) {
      throw new ServiceUnavailableException({
        code: 'STRIPE_NOT_CONFIGURED',
        message:
          'Identity verification is temporarily unavailable. Please try again later or contact support.',
      });
    }

    const profile = await this.prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      include: { account: true },
    });
    if (!profile) {
      throw new NotFoundException({
        code: 'PROFILE_NOT_FOUND',
        message: 'Client profile not found.',
      });
    }

    if (profile.verification_level !== 'UNVERIFIED') {
      throw new ConflictException({
        code: 'ALREADY_VERIFIED',
        message: 'You are already verified.',
      });
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const session = await this.stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: {
        account_id: clientProfileId.toString(),
        client_profile_id: profile.id.toString(),
      },
      options: {
        document: {
          allowed_types: ['driving_license', 'passport', 'id_card'],
          require_matching_selfie: true,
        },
      },
      return_url: `${frontendUrl}/profile?verification=complete`,
    });

    await this.audit.log(
      clientProfileId,
      'verification.identity.started',
      'client_profile',
      clientProfileId,
      { session_id: session.id },
      ip,
    );

    return {
      verification_url: session.url,
      session_id: session.id,
      status: session.status,
    };
  }

  /**
   * Stripe webhook handler. Idempotent — duplicate events for the same
   * session produce no extra milestones (the handler checks for an existing
   * milestone with the same `evidence_ref = session.id` before writing).
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    if (
      event.type !== 'identity.verification_session.verified' &&
      event.type !== 'identity.verification_session.requires_input'
    ) {
      return;
    }

    const session = event.data.object;
    const accountIdStr = session.metadata?.account_id;
    if (!accountIdStr) {
      this.logger.warn(
        `Verification event without account_id in metadata: ${session.id}`,
      );
      return;
    }
    const clientProfileId = BigInt(accountIdStr);

    const profile = await this.prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      include: { account: { select: { email: true } } },
    });

    if (event.type === 'identity.verification_session.requires_input') {
      const reason = session.last_error?.code ?? 'unknown';
      await this.audit.log(
        clientProfileId,
        'verification.identity.failed',
        'client_profile',
        clientProfileId,
        { session_id: session.id, reason },
      );
      if (profile?.account.email) {
        void this.mail.sendVerificationFailed(
          profile.account.email,
          profile.display_name,
          reason,
        );
      }
      return;
    }

    // event.type === 'identity.verification_session.verified'
    const existing = await this.prisma.verificationMilestone.findFirst({
      where: {
        client_profile_id: clientProfileId,
        milestone_type: 'IDENTITY_VERIFIED',
        evidence_ref: session.id,
      },
    });
    if (existing) {
      this.logger.log(
        `Duplicate IDENTITY_VERIFIED webhook for ${session.id} — no-op`,
      );
      return;
    }

    const milestone = await this.prisma.verificationMilestone.create({
      data: {
        client_profile_id: clientProfileId,
        milestone_type: 'IDENTITY_VERIFIED',
        evidence_ref: session.id,
      },
    });
    await this.audit.log(
      clientProfileId,
      'verification.identity.verified',
      'client_profile',
      clientProfileId,
      { session_id: session.id },
    );

    await this.promotionEngine.runPromotion(clientProfileId, {
      milestoneIds: [milestone.id],
      staffMemberId: null,
    });

    if (profile?.account.email) {
      void this.mail.sendVerificationVerified(
        profile.account.email,
        profile.display_name,
      );
    }
  }

  // ─── Reads ─────────────────────────────────────────────────────

  /**
   * GET /verification/identity/status — most-recent Stripe session status,
   * useful for diagnostic polling. Returns nulls if the user has never
   * started a session.
   */
  async getIdentityStatus(clientProfileId: bigint) {
    if (!this.stripe) {
      return { session_id: null, status: null };
    }
    // Stripe's Identity list endpoint doesn't support filtering by metadata,
    // so we look up the most recent session id from our own audit log
    // (written by `startIdentitySession`) and fetch by id.
    const lastStart = await this.prisma.auditLog.findFirst({
      where: {
        account_id: clientProfileId,
        action: 'verification.identity.started',
      },
      orderBy: { created_at: 'desc' },
      select: { metadata: true },
    });
    const sessionId =
      lastStart?.metadata && typeof lastStart.metadata === 'object'
        ? (lastStart.metadata as { session_id?: string }).session_id
        : undefined;
    if (!sessionId) return { session_id: null, status: null };
    const session =
      await this.stripe.identity.verificationSessions.retrieve(sessionId);
    return { session_id: session.id, status: session.status };
  }

  /**
   * GET /verification/me — comprehensive view for the user's own profile.
   * Single canonical "give me everything I need to render my own state."
   */
  async getMe(clientProfileId: bigint) {
    const [profile, milestones, documents] = await Promise.all([
      this.prisma.clientProfile.findUnique({
        where: { id: clientProfileId },
        include: {
          worker_profile: { select: { id: true } },
          employer_profile: { select: { id: true } },
        },
      }),
      this.prisma.verificationMilestone.findMany({
        where: { client_profile_id: clientProfileId },
        orderBy: { achieved_at: 'desc' },
        select: {
          milestone_type: true,
          achieved_at: true,
          expires_at: true,
          evidence_ref: true,
        },
      }),
      this.prisma.document.findMany({
        where: { client_profile_id: clientProfileId },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          doc_type: true,
          file_url: true,
          status: true,
          rejection_reason: true,
          metadata: true,
          created_at: true,
          reviewed_at: true,
        },
      }),
    ]);
    if (!profile) {
      throw new NotFoundException({ code: 'PROFILE_NOT_FOUND' });
    }

    const grouped = {
      pending: documents.filter((d) => d.status === 'PENDING'),
      in_review: documents.filter((d) => d.status === 'IN_REVIEW'),
      approved: documents.filter((d) => d.status === 'APPROVED'),
      rejected: documents.filter((d) => d.status === 'REJECTED'),
    };

    const ladder = this.computeLadder(
      (profile.verification_level ?? 'UNVERIFIED') as VerificationLevel,
      !!profile.worker_profile,
      milestones,
      documents,
    );

    return {
      verification_level: profile.verification_level as VerificationLevel,
      milestones,
      documents: grouped,
      next_action: ladder.next_action,
    };
  }

  /**
   * GET /verification/levels/:clientProfileId — public.
   * Returns the level plus high-level milestone flags so other users can
   * see WHAT was verified, not just the rung. Doc IDs / titles / metadata
   * stay private — only booleans + a list of approved certification
   * doc-types are exposed publicly. Returns 404 for deactivated accounts
   * (don't leak deactivation state).
   */
  async getPublicLevel(clientProfileId: bigint) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      include: {
        account: { select: { status: true, updated_at: true } },
        worker_profile: {
          select: { rating_avg: true, rating_count: true },
        },
        employer_profile: {
          select: { rating_avg: true, rating_count: true },
        },
      },
    });
    if (!profile || profile.account.status !== 'ACTIVE') {
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }

    const milestones = await this.prisma.verificationMilestone.findMany({
      where: { client_profile_id: clientProfileId },
      select: { milestone_type: true, evidence_ref: true },
    });

    const certificationDocIds = milestones
      .filter((m) => m.milestone_type === 'CERTIFICATION_APPROVED')
      .map((m) => m.evidence_ref)
      .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0)
      .map((ref) => {
        try {
          return BigInt(ref);
        } catch {
          return null;
        }
      })
      .filter((id): id is bigint => id !== null);

    const certifications = certificationDocIds.length
      ? await this.prisma.document.findMany({
          where: { id: { in: certificationDocIds }, status: 'APPROVED' },
          select: { doc_type: true },
        })
      : [];

    const has = (type: string) =>
      milestones.some((m) => m.milestone_type === type);

    const ratingCount =
      profile.worker_profile?.rating_count ??
      profile.employer_profile?.rating_count ??
      0;
    const ratingAvg =
      profile.worker_profile?.rating_avg ??
      profile.employer_profile?.rating_avg ??
      null;

    return {
      verification_level: profile.verification_level as VerificationLevel,
      last_evaluated_at: profile.updated_at,
      flags: {
        identity_verified: has('IDENTITY_VERIFIED'),
        insurance_approved: has('INSURANCE_APPROVED'),
        company_house_verified: has('COMPANY_HOUSE_VERIFIED'),
        company_letterhead_approved: has('COMPANY_LETTERHEAD_APPROVED'),
        right_to_work_verified: has('RIGHT_TO_WORK_VERIFIED'),
        hmrc_cis_verified: has('HMRC_CIS_VERIFIED'),
        certification_doc_types: Array.from(
          new Set(certifications.map((d) => d.doc_type)),
        ),
      },
      reviews: {
        count: ratingCount,
        average: ratingAvg,
      },
    };
  }

  /**
   * GET /verification/ladder/:clientProfileId — full ladder panel data
   * for the trust-ladder component. Owner OR staff only.
   */
  async getLadder(
    clientProfileId: bigint,
    requester: { clientProfileId: bigint | null; isStaff: boolean },
  ) {
    if (!requester.isStaff && requester.clientProfileId !== clientProfileId) {
      throw new ForbiddenException({ code: 'FORBIDDEN' });
    }
    const [profile, milestones, documents] = await Promise.all([
      this.prisma.clientProfile.findUnique({
        where: { id: clientProfileId },
        include: {
          worker_profile: { select: { id: true } },
          employer_profile: { select: { id: true } },
        },
      }),
      this.prisma.verificationMilestone.findMany({
        where: { client_profile_id: clientProfileId },
        orderBy: { achieved_at: 'desc' },
      }),
      this.prisma.document.findMany({
        where: { client_profile_id: clientProfileId },
        orderBy: { created_at: 'desc' },
        select: { id: true, doc_type: true, status: true },
      }),
    ]);
    if (!profile) throw new NotFoundException({ code: 'PROFILE_NOT_FOUND' });

    const isWorker = !!profile.worker_profile;
    const ladder = this.computeLadder(
      (profile.verification_level ?? 'UNVERIFIED') as VerificationLevel,
      isWorker,
      milestones,
      documents,
    );
    return {
      current_level: profile.verification_level as VerificationLevel,
      rungs: ladder.rungs,
    };
  }

  // ─── Internal: ladder computation ─────────────────────────────

  /**
   * Computes the four-rung ladder state (DONE / IN_PROGRESS / NOT_STARTED
   * / COMING_SOON) for the trust-ladder panel. Pure function over the
   * inputs — easy to test.
   */
  private computeLadder(
    currentLevel: VerificationLevel,
    isWorker: boolean,
    milestones: Array<{
      milestone_type: string;
      achieved_at: Date;
    }>,
    documents: Array<{ doc_type: string; status: string }>,
  ): {
    rungs: Array<{
      level: VerificationLevel;
      state: LadderRungState;
      label: string;
      next_doc_types?: string[];
      estimated_time?: string;
      completed_at?: Date | null;
    }>;
    next_action: {
      rung: VerificationLevel;
      label: string;
      doc_types?: string[];
    } | null;
  } {
    const identity = milestones.find(
      (m) => m.milestone_type === 'IDENTITY_VERIFIED',
    );
    const hasIdentity = !!identity;
    // BASIC IN_PROGRESS would require querying the user's most recent Stripe
    // session status (`processing`). The frontend reads that directly via
    // `/verification/identity/status`; the ladder rung stays binary here.

    const certEvidenceTypes = isWorker
      ? ['CSCS_CARD', 'GAS_SAFE_CERT', 'NICEIC_CERT', 'FIRAS_CERT']
      : ['INSURANCE', 'COMPANY_LETTERHEAD'];
    const approvedCert = documents.some(
      (d) => d.status === 'APPROVED' && certEvidenceTypes.includes(d.doc_type),
    );
    const pendingCert = documents.some(
      (d) =>
        (d.status === 'PENDING' || d.status === 'IN_REVIEW') &&
        certEvidenceTypes.includes(d.doc_type),
    );

    const rungs: Array<{
      level: VerificationLevel;
      state: LadderRungState;
      label: string;
      next_doc_types?: string[];
      estimated_time?: string;
      completed_at?: Date | null;
    }> = [
      {
        level: 'UNVERIFIED',
        state: 'DONE',
        label: 'Account created',
      },
      {
        level: 'BASIC',
        state: hasIdentity ? 'DONE' : 'NOT_STARTED',
        label: hasIdentity
          ? 'Identity verified'
          : 'Verify your identity with Stripe',
        completed_at: identity?.achieved_at ?? null,
        estimated_time: hasIdentity ? undefined : 'Usually takes 2–5 minutes',
      },
      {
        level: 'CERTIFIED',
        state: approvedCert
          ? 'DONE'
          : pendingCert
            ? 'IN_PROGRESS'
            : hasIdentity
              ? 'NOT_STARTED'
              : 'NOT_STARTED',
        label: isWorker
          ? approvedCert
            ? 'Trade certification verified'
            : 'Upload a trade certification (CSCS / Gas Safe / NICEIC / FIRAS)'
          : approvedCert
            ? 'Insurance + company letterhead verified'
            : 'Upload insurance and company letterhead',
        next_doc_types: approvedCert ? undefined : certEvidenceTypes,
        estimated_time: approvedCert
          ? undefined
          : 'Usually takes 24–48h after upload',
      },
      {
        level: 'PREMIUM',
        state: 'COMING_SOON',
        label: 'Coming soon — requires 5+ verified reviews',
      },
    ];

    let next_action: ReturnType<typeof this.computeLadder>['next_action'] =
      null;
    if (currentLevel === 'UNVERIFIED') {
      next_action = { rung: 'BASIC', label: 'Verify your identity' };
    } else if (currentLevel === 'BASIC') {
      next_action = {
        rung: 'CERTIFIED',
        label: isWorker
          ? 'Upload a trade certification'
          : 'Upload insurance and company letterhead',
        doc_types: certEvidenceTypes,
      };
    }

    return { rungs, next_action };
  }
}
