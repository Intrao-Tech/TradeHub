import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

/**
 * Payment `type` values for referral commissions — these are the values
 * stored on `payment.type`. The release flow in EscrowService turns each
 * CommissionLine into a `payment` row of this type.
 */
export type ReferralPaymentType =
  | 'REFERRAL_ACCOUNT'
  | 'REFERRAL_W2W'
  | 'REFERRAL_E2E';

type CommissionInput = {
  milestoneId: bigint;
  contractId: bigint;
  agreedAmount: Prisma.Decimal;
  platformFee: Prisma.Decimal;
  // worker / employer of the contract — these are client_profile ids.
  workerClientProfileId: bigint;
  employerClientProfileId: bigint;
  // Project ref attribution copied onto the Contract at hire-time.
  projectReferrerId: bigint | null;
  projectReferrerRole: 'WORKER' | 'EMPLOYER' | null;
};

export type CommissionLine = {
  // The referrer — a client_profile id.
  referrerClientProfileId: bigint;
  type: ReferralPaymentType;
  grossAmount: Prisma.Decimal; // before cap
  cappedAmount: Prisma.Decimal; // after the platform-fee cap
};

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Fire-and-forget commission notification email to a referrer.
   * `referrerClientProfileId` is a client_profile id.
   */
  notifyCommissionPaid(
    referrerClientProfileId: bigint,
    contractId: bigint,
    amount: Prisma.Decimal,
    type: ReferralPaymentType,
    paidLive: boolean,
  ): void {
    void (async () => {
      try {
        const [referrer, contract] = await Promise.all([
          this.prisma.clientProfile.findUnique({
            where: { id: referrerClientProfileId },
            select: {
              display_name: true,
              account: { select: { email: true } },
            },
          }),
          this.prisma.contract.findUnique({
            where: { id: contractId },
            select: { project_type: true, position: true },
          }),
        ]);
        if (!referrer) return;
        // Map ledger `payment.type` -> the mail template's referral enum.
        const refType =
          type === 'REFERRAL_ACCOUNT'
            ? 'ACCOUNT'
            : type === 'REFERRAL_W2W'
              ? 'PROJECT_W2W'
              : 'PROJECT_E2E';
        await this.mail.sendReferralCommissionPaid(
          referrer.account.email,
          referrer.display_name,
          amount.toFixed(2),
          contract?.project_type ?? `Contract #${contract?.position ?? '?'}`,
          refType,
          paidLive,
        );
      } catch (err) {
        this.logger.warn(
          `Commission paid email failed for referrer=${referrerClientProfileId}: ${(err as Error).message}`,
        );
      }
    })();
  }

  /** Public: lookup a referrer's client_profile by ref code (signup banner). */
  async lookupReferrerByCode(code: string) {
    if (!code) return null;
    return this.prisma.clientProfile.findUnique({
      where: { referral_code: code.toUpperCase() },
      select: { id: true, referral_code: true, display_name: true },
    });
  }

  async getOwnCode(clientProfileId: bigint) {
    const cp = await this.prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      select: { referral_code: true },
    });
    if (!cp) throw new NotFoundException('Profile not found');
    return { code: cp.referral_code };
  }

  /**
   * Stats for the "Account referrals" tab on `/referrals`.
   * Lists every client this user has referred + earnings to date.
   */
  async getAccountStats(clientProfileId: bigint) {
    const referred = await this.prisma.clientProfile.findMany({
      where: { referred_by_id: clientProfileId },
      orderBy: { referred_at: 'desc' },
      select: {
        id: true,
        display_name: true,
        referred_at: true,
        account: { select: { email: true } },
      },
    });

    // Sum REFERRAL_ACCOUNT payments earned by this referrer.
    const totals = await this.prisma.payment.aggregate({
      where: { client_profile_id: clientProfileId, type: 'REFERRAL_ACCOUNT' },
      _sum: { amount: true },
    });

    return {
      lifetime_signups: referred.length,
      total_earned_gbp: totals._sum.amount?.toString() ?? '0',
      items: referred.map((r) => ({
        account_id: String(r.id),
        email: r.account.email,
        display_name: r.display_name,
        referred_at: r.referred_at,
      })),
    };
  }

  /** Project-share attributions originating from this user's link. */
  async getProjectShares(clientProfileId: bigint) {
    const apps = await this.prisma.jobApplication.findMany({
      where: { project_referrer_id: clientProfileId },
      orderBy: { created_at: 'desc' },
      include: { job_post: { select: { id: true, title: true } } },
    });
    const contracts = await this.prisma.contract.findMany({
      where: { project_referrer_id: clientProfileId },
      orderBy: { created_at: 'desc' },
      include: {
        collaboration: {
          select: {
            worker: {
              include: { client_profile: { select: { display_name: true } } },
            },
          },
        },
      },
    });
    return { applications: apps, contracts };
  }

  async getIncomingAttribution(clientProfileId: bigint) {
    const cp = await this.prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      include: { referrer: { select: { id: true, display_name: true } } },
    });
    if (!cp?.referrer) return { referrer: null, total_paid_gbp: '0' };

    const totals = await this.prisma.payment.aggregate({
      where: {
        client_profile_id: cp.referrer.id,
        type: { in: ['REFERRAL_ACCOUNT', 'REFERRAL_W2W', 'REFERRAL_E2E'] },
      },
      _sum: { amount: true },
    });

    return {
      referrer: {
        account_id: String(cp.referrer.id),
        display_name: cp.referrer.display_name,
      },
      total_paid_gbp: totals._sum.amount?.toString() ?? '0',
    };
  }

  /** Referral-commission `payment` rows for this referrer (any status). */
  async getReferralPayments(clientProfileId: bigint) {
    return this.prisma.payment.findMany({
      where: {
        client_profile_id: clientProfileId,
        type: { in: ['REFERRAL_ACCOUNT', 'REFERRAL_W2W', 'REFERRAL_E2E'] },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Compute every referral commission line for a milestone release, with the
   * total capped at the milestone's platform_fee. Pure computation — the
   * caller (EscrowService release flow) turns each line into a `payment` row.
   *
   * Commission sources can stack:
   *  - account ref on the worker   — paid only on the worker's FIRST REVENUE
   *    contract (first contract with a released milestone), every milestone
   *  - account ref on the employer — same rule, evaluated for the employer
   *  - project ref on the contract — W2W only (E2E is disabled for now)
   */
  async computeMilestoneCommissions(
    input: CommissionInput,
  ): Promise<CommissionLine[]> {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { id: 1 },
    });
    if (!setting) return [];

    const lines: Omit<CommissionLine, 'cappedAmount'>[] = [];

    // Account ref pays out on the referred user's FIRST REVENUE contract
    // only — the first contract on which a milestone was actually released
    // (money moved + commission computed). Drafts / proposed / abandoned
    // contracts that never had a released milestone do not count. Once that
    // contract is fixed the ref is paid on every one of its milestones.
    //
    // The current milestone is excluded from the scan so the result does not
    // depend on whether it has already been flipped to RELEASED. Collaboration
    // `worker_id` / `employer_id` share the client_profile PK, so they match a
    // client_profile id directly.
    const isFirstRevenueContract = async (userId: bigint): Promise<boolean> => {
      const earliestRelease = await this.prisma.escrowMilestone.findFirst({
        where: {
          status: 'RELEASED',
          id: { not: input.milestoneId },
          contract: {
            collaboration: {
              OR: [{ worker_id: userId }, { employer_id: userId }],
            },
          },
        },
        orderBy: [{ released_at: 'asc' }, { id: 'asc' }],
        select: { contract_id: true },
      });
      // No prior release anywhere → this milestone's contract IS the user's
      // first revenue contract. Otherwise it must equal the earliest one.
      const firstRevenueContractId =
        earliestRelease?.contract_id ?? input.contractId;
      return firstRevenueContractId === input.contractId;
    };

    // Account ref for the worker — first contract only.
    const worker = await this.prisma.clientProfile.findUnique({
      where: { id: input.workerClientProfileId },
      select: { referred_by_id: true },
    });
    if (
      worker?.referred_by_id &&
      (await isFirstRevenueContract(input.workerClientProfileId))
    ) {
      lines.push({
        referrerClientProfileId: worker.referred_by_id,
        type: 'REFERRAL_ACCOUNT',
        grossAmount: input.platformFee
          .mul(setting.account_referral_pct)
          .div(100),
      });
    }

    // Account ref for the employer — first contract only.
    const employer = await this.prisma.clientProfile.findUnique({
      where: { id: input.employerClientProfileId },
      select: { referred_by_id: true },
    });
    if (
      employer?.referred_by_id &&
      (await isFirstRevenueContract(input.employerClientProfileId))
    ) {
      lines.push({
        referrerClientProfileId: employer.referred_by_id,
        type: 'REFERRAL_ACCOUNT',
        grossAmount: input.platformFee
          .mul(setting.account_referral_pct)
          .div(100),
      });
    }

    // Project ref — W2W only. The W→W referrer is paid on every milestone of
    // every contract tied to the referred job post. E2E is disabled for now.
    if (input.projectReferrerId && input.projectReferrerRole === 'WORKER') {
      lines.push({
        referrerClientProfileId: input.projectReferrerId,
        type: 'REFERRAL_W2W',
        grossAmount: input.agreedAmount
          .mul(setting.project_referral_w2w_pct)
          .div(100),
      });
    }

    if (lines.length === 0) return [];

    // Cap: total of all cuts must not exceed platform_fee.
    const totalGross = lines.reduce(
      (s, l) => s.add(l.grossAmount),
      new Prisma.Decimal(0),
    );
    const factor = totalGross.gt(input.platformFee)
      ? input.platformFee.div(totalGross)
      : new Prisma.Decimal(1);

    return lines.map((l) => ({
      ...l,
      cappedAmount: l.grossAmount
        .mul(factor)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
    }));
  }

  /**
   * Record a click intent for a logged-in client. Replaces cookie-based
   * attribution: the click is persisted server-side keyed by the actor
   * client_profile, so a later qualifying action (apply / hire) resolves the
   * referrer regardless of page / tab / device.
   *
   * No-op if the actor IS the referrer (self-ref) or the referrer/target
   * doesn't exist. Returns the referrer's display name for UI confirmation.
   */
  async recordProjectIntent(input: {
    code: string;
    actor_client_profile_id: bigint;
    target_id: bigint;
    target_role: 'WORKER' | 'EMPLOYER';
  }) {
    const referrer = await this.lookupReferrerByCode(input.code);
    if (!referrer) {
      throw new NotFoundException('Referral code not found');
    }
    if (referrer.id === input.actor_client_profile_id) {
      return { referrer_display_name: null, recorded: false };
    }

    let targetTitle = '';
    if (input.target_role === 'WORKER') {
      const jp = await this.prisma.jobPost.findUnique({
        where: { id: input.target_id },
        select: { id: true, title: true },
      });
      if (!jp) throw new BadRequestException('Job not found');
      targetTitle = jp.title;
    } else {
      const wp = await this.prisma.workerProfile.findUnique({
        where: { id: input.target_id },
        include: { client_profile: { select: { display_name: true } } },
      });
      if (!wp) throw new BadRequestException('Worker not found');
      targetTitle = wp.client_profile?.display_name ?? 'Worker';
    }

    // 30-day intent window.
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.referralIntent.create({
      data: {
        actor_id: input.actor_client_profile_id,
        referrer_id: referrer.id,
        target_job_post_id:
          input.target_role === 'WORKER' ? input.target_id : null,
        target_worker_id:
          input.target_role === 'EMPLOYER' ? input.target_id : null,
        expires_at: expiresAt,
      },
    });

    return {
      referrer_display_name: referrer.display_name,
      target: {
        type: input.target_role === 'WORKER' ? 'JOB' : 'WORKER',
        id: String(input.target_id),
        title: targetTitle,
      },
      recorded: true,
    };
  }

  /**
   * Look up the latest non-expired intent for (actor, target). Used at
   * apply / hire time to copy attribution onto the durable row. Does NOT
   * delete the intent — multiple actions on the same target can each consume
   * it. Returns `{ referrer_id }` or null.
   */
  async findActiveIntent(
    actorClientProfileId: bigint,
    targetRole: 'WORKER' | 'EMPLOYER',
    targetId: bigint,
  ): Promise<{ referrer_id: bigint } | null> {
    const intent = await this.prisma.referralIntent.findFirst({
      where: {
        actor_id: actorClientProfileId,
        ...(targetRole === 'WORKER'
          ? { target_job_post_id: targetId }
          : { target_worker_id: targetId }),
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
      select: { referrer_id: true },
    });
    return intent;
  }
}
