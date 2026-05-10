import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { STRIPE_CLIENT } from '../stripe/stripe.module';
import {
  REFERRAL_AUDIT_EVENTS,
  REFERRAL_TYPE,
  type ReferralType,
} from './referral.constants';

type CommissionInput = {
  milestoneId: bigint;
  contractId: bigint;
  agreedAmount: Prisma.Decimal;
  platformFee: Prisma.Decimal;
  workerAccountId: bigint;
  employerAccountId: bigint;
  // Project ref attribution copied to Contract at hire-time.
  projectReferrerId: bigint | null;
  projectReferrerRole: 'WORKER' | 'EMPLOYER' | null;
};

type CommissionLine = {
  referrerAccountId: bigint;
  type: ReferralType;
  grossAmount: Prisma.Decimal; // before cap
  cappedAmount: Prisma.Decimal; // after total cap
};

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    @Optional()
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe | null = null,
  ) {}

  /**
   * Fire-and-forget commission notification email to a referrer. Looks up
   * email + display_name + contract title and sends via MailService.
   */
  private notifyCommissionPaid(
    referrerAccountId: bigint,
    contractId: bigint,
    amount: Prisma.Decimal,
    type: ReferralType,
    paidLive: boolean,
  ): void {
    void (async () => {
      try {
        const [referrer, contract] = await Promise.all([
          this.prisma.account.findUnique({
            where: { id: referrerAccountId },
            include: {
              client_profile: { select: { display_name: true } },
            },
          }),
          this.prisma.contract.findUnique({
            where: { id: contractId },
            select: { project_type: true, position: true },
          }),
        ]);
        if (!referrer) return;
        await this.mail.sendReferralCommissionPaid(
          referrer.email,
          referrer.client_profile?.display_name ?? referrer.email,
          amount.toFixed(2),
          contract?.project_type ?? `Contract #${contract?.position ?? '?'}`,
          type,
          paidLive,
        );
      } catch (err) {
        this.logger.warn(
          `Commission paid email failed for referrer=${referrerAccountId}: ${(err as Error).message}`,
        );
      }
    })();
  }

  /** Public: lookup display name for a ref code (used by signup banner). */
  async lookupReferrerByCode(code: string) {
    if (!code) return null;
    return this.prisma.account.findUnique({
      where: { referral_code: code.toUpperCase() },
      select: {
        id: true,
        referral_code: true,
        client_profile: { select: { display_name: true } },
      },
    });
  }

  async getOwnCode(accountId: bigint) {
    const acc = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { referral_code: true },
    });
    if (!acc) throw new NotFoundException('Account not found');
    return { code: acc.referral_code };
  }

  /**
   * Stats for "Account referrals" tab on /referrals page.
   * Lists every account this user has referred + earnings to date.
   */
  async getAccountStats(accountId: bigint) {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { id: 1 },
    });
    const windowMonths = setting?.account_referral_window_months ?? 12;

    const referred = await this.prisma.account.findMany({
      where: { referred_by_id: accountId },
      orderBy: { referred_at: 'desc' },
      select: {
        id: true,
        email: true,
        referred_at: true,
        client_profile: { select: { display_name: true } },
      },
    });

    // Sum payouts originating from these account-ref events.
    const totals = await this.prisma.pendingReferralPayout.aggregate({
      where: {
        referrer_client_profile_id: accountId,
        type: REFERRAL_TYPE.ACCOUNT,
      },
      _sum: { amount: true },
    });

    return {
      window_months: windowMonths,
      lifetime_signups: referred.length,
      total_earned_gbp: totals._sum.amount?.toString() ?? '0',
      items: referred.map((r) => ({
        account_id: String(r.id),
        email: r.email,
        display_name: r.client_profile?.display_name ?? null,
        referred_at: r.referred_at,
        window_ends_at:
          windowMonths != null && r.referred_at
            ? new Date(
                new Date(r.referred_at).setMonth(
                  new Date(r.referred_at).getMonth() + windowMonths,
                ),
              )
            : null,
      })),
    };
  }

  /** Project-share attributions originating from this user's link. */
  async getProjectShares(accountId: bigint) {
    const apps = await this.prisma.jobApplication.findMany({
      where: { project_referrer_id: accountId },
      orderBy: { created_at: 'desc' },
      include: {
        job_post: { select: { id: true, title: true } },
      },
    });
    const contracts = await this.prisma.contract.findMany({
      where: { project_referrer_id: accountId },
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

  async getIncomingAttribution(accountId: bigint) {
    const acc = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: {
        referrer: {
          include: { client_profile: { select: { display_name: true } } },
        },
      },
    });
    if (!acc?.referrer) return { referrer: null, total_paid_gbp: '0' };

    const totals = await this.prisma.pendingReferralPayout.aggregate({
      where: {
        referrer_client_profile_id: acc.referrer.id,
        // … paid out specifically because of THIS account's contracts: harder
        // to query precisely without a back-pointer; surface the gross sum
        // for transparency, refine later if needed.
      },
      _sum: { amount: true },
    });

    return {
      referrer: {
        account_id: String(acc.referrer.id),
        display_name: acc.referrer.client_profile?.display_name ?? null,
      },
      total_paid_gbp: totals._sum.amount?.toString() ?? '0',
    };
  }

  async getPendingPayouts(accountId: bigint) {
    return this.prisma.pendingReferralPayout.findMany({
      where: {
        referrer_client_profile_id: accountId,
        status: { in: ['PENDING', 'FAILED'] },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Compute every referral commission line for a milestone release, with
   * total cap = platform_fee. Returns ordered list of (referrer, type, gross,
   * capped).
   *
   * Three commission sources can stack:
   *  - account ref on worker (worker.referred_by_id within window)
   *  - account ref on employer (employer.referred_by_id within window)
   *  - project ref on contract (contract.project_referrer_id)
   *
   * Caller (escrow.service.executeRelease) actually fires the transfers.
   */
  async computeMilestoneCommissions(
    input: CommissionInput,
  ): Promise<CommissionLine[]> {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { id: 1 },
    });
    if (!setting) return [];

    const lines: Omit<CommissionLine, 'cappedAmount'>[] = [];

    const within = (referredAt: Date | null) => {
      if (!referredAt) return false;
      const m = setting.account_referral_window_months;
      if (m == null) return true; // lifetime
      const ends = new Date(referredAt);
      ends.setMonth(ends.getMonth() + m);
      return new Date() < ends;
    };

    // Account ref for worker.
    const worker = await this.prisma.account.findUnique({
      where: { id: input.workerAccountId },
      select: { referred_by_id: true, referred_at: true },
    });
    if (worker?.referred_by_id && within(worker.referred_at)) {
      const gross = input.platformFee
        .mul(setting.account_referral_pct)
        .div(100);
      lines.push({
        referrerAccountId: worker.referred_by_id,
        type: REFERRAL_TYPE.ACCOUNT,
        grossAmount: gross,
      });
    }

    // Account ref for employer.
    const employer = await this.prisma.account.findUnique({
      where: { id: input.employerAccountId },
      select: { referred_by_id: true, referred_at: true },
    });
    if (employer?.referred_by_id && within(employer.referred_at)) {
      const gross = input.platformFee
        .mul(setting.account_referral_pct)
        .div(100);
      lines.push({
        referrerAccountId: employer.referred_by_id,
        type: REFERRAL_TYPE.ACCOUNT,
        grossAmount: gross,
      });
    }

    // Project ref.
    if (input.projectReferrerId && input.projectReferrerRole) {
      const pct =
        input.projectReferrerRole === 'WORKER'
          ? setting.project_referral_w2w_pct
          : setting.project_referral_e2e_pct;
      const gross = input.agreedAmount.mul(pct).div(100);
      lines.push({
        referrerAccountId: input.projectReferrerId,
        type:
          input.projectReferrerRole === 'WORKER'
            ? REFERRAL_TYPE.PROJECT_W2W
            : REFERRAL_TYPE.PROJECT_E2E,
        grossAmount: gross,
      });
    }

    if (lines.length === 0) return [];

    // Cap: total of cuts must not exceed platform_fee.
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
   * Persists the commission as a PendingReferralPayout (default state PENDING)
   * so the escrow auto-release job can later transfer to the referrer's
   * Connect account once they've onboarded.
   */
  async recordPendingPayout(
    referrerAccountId: bigint,
    milestoneId: bigint,
    contractId: bigint,
    type: ReferralType,
    amount: Prisma.Decimal,
  ) {
    return this.prisma.pendingReferralPayout.create({
      data: {
        referrer_client_profile_id: referrerAccountId,
        milestone_id: milestoneId,
        contract_id: contractId,
        type,
        amount,
        status: 'PENDING',
      },
    });
  }

  /**
   * Trigger commissions for a freshly-released milestone. For each commission
   * line, attempt a live Stripe transfer to the referrer's Connect account.
   * If the referrer hasn't onboarded (or transfer rejects), fall back to a
   * PENDING PendingReferralPayout row that the backfill sweep will retry
   * after `account.updated → payouts_enabled=true`.
   */
  async fireCommissionsForRelease(input: CommissionInput) {
    const lines = await this.computeMilestoneCommissions(input);
    for (const line of lines) {
      try {
        if (line.cappedAmount.lte(0)) continue;

        const profile = await this.prisma.clientProfile.findUnique({
          where: { id: line.referrerAccountId },
          select: {
            id: true,
            stripe_connect_account_id: true,
            connect_payouts_enabled: true,
          },
        });

        const canTransferNow =
          this.stripe != null &&
          profile?.stripe_connect_account_id != null &&
          profile.connect_payouts_enabled === true;

        if (canTransferNow) {
          // Live transfer path. Idempotency keyed by milestone+referrer so a
          // retry after a partial release won't double-pay.
          const amountPence = Math.round(line.cappedAmount.mul(100).toNumber());
          try {
            const tx = await this.stripe.transfers.create(
              {
                amount: amountPence,
                currency: 'gbp',
                destination: profile.stripe_connect_account_id!,
                transfer_group: `escrow_${input.milestoneId}`,
                metadata: {
                  milestone_id: String(input.milestoneId),
                  contract_id: String(input.contractId),
                  referrer_account_id: String(line.referrerAccountId),
                  type: line.type,
                  kind: 'referral_commission',
                },
              },
              {
                idempotencyKey: `ref_payout_${input.milestoneId}_${line.referrerAccountId}_${line.type}`,
              },
            );
            // Persist as PAID — no auto-release sweep needed.
            await this.prisma.pendingReferralPayout.create({
              data: {
                referrer_client_profile_id: line.referrerAccountId,
                milestone_id: input.milestoneId,
                contract_id: input.contractId,
                type: line.type,
                amount: line.cappedAmount,
                status: 'PAID',
                stripe_transfer_id: tx.id,
                paid_at: new Date(),
              },
            });
            await this.audit.log(
              line.referrerAccountId,
              REFERRAL_AUDIT_EVENTS.COMMISSION_PAID,
              'pending_referral_payout',
              input.milestoneId,
              {
                type: line.type,
                amount_gbp: line.cappedAmount.toString(),
                contract_id: String(input.contractId),
                milestone_id: String(input.milestoneId),
                stripe_transfer_id: tx.id,
                live: true,
              },
            );
            this.notifyCommissionPaid(
              line.referrerAccountId,
              input.contractId,
              line.cappedAmount,
              line.type,
              true,
            );
            continue;
          } catch (transferErr) {
            this.logger.warn(
              `live referral transfer rejected, falling back to pending: milestone=${input.milestoneId} referrer=${line.referrerAccountId}: ${(transferErr as Error).message}`,
            );
            // Fall through to PENDING path below.
          }
        }

        // PENDING fallback: referrer not onboarded OR live transfer rejected.
        await this.recordPendingPayout(
          line.referrerAccountId,
          input.milestoneId,
          input.contractId,
          line.type,
          line.cappedAmount,
        );
        await this.audit.log(
          line.referrerAccountId,
          REFERRAL_AUDIT_EVENTS.COMMISSION_PAID,
          'pending_referral_payout',
          input.milestoneId,
          {
            type: line.type,
            amount_gbp: line.cappedAmount.toString(),
            contract_id: String(input.contractId),
            milestone_id: String(input.milestoneId),
            live: false,
            reason: canTransferNow
              ? 'transfer_rejected'
              : 'referrer_not_onboarded',
          },
        );
        this.notifyCommissionPaid(
          line.referrerAccountId,
          input.contractId,
          line.cappedAmount,
          line.type,
          false,
        );
      } catch (err) {
        this.logger.error(
          `commission record failed for milestone=${input.milestoneId} referrer=${line.referrerAccountId}`,
          err,
        );
        await this.audit.log(
          line.referrerAccountId,
          REFERRAL_AUDIT_EVENTS.COMMISSION_FAILED,
          'pending_referral_payout',
          input.milestoneId,
          { error: String(err) },
        );
      }
    }
  }

  /**
   * Backfill sweep: pay out all PENDING PendingReferralPayout rows for a
   * referrer who has just enabled Stripe payouts. Called from
   * EscrowService.handleAccountUpdated after a Connect status change.
   *
   * Idempotent — already-PAID rows are skipped, failures flip to FAILED
   * with a stored reason (visible on /referrals "Pending payouts" tab).
   */
  async payPendingReferralPayouts(referrerAccountId: bigint) {
    if (!this.stripe) {
      this.logger.warn(
        `payPendingReferralPayouts called without Stripe configured (referrer=${referrerAccountId})`,
      );
      return { paid: 0, failed: 0, skipped: 0 };
    }
    const profile = await this.prisma.clientProfile.findUnique({
      where: { id: referrerAccountId },
      select: {
        stripe_connect_account_id: true,
        connect_payouts_enabled: true,
      },
    });
    if (
      !profile?.stripe_connect_account_id ||
      !profile.connect_payouts_enabled
    ) {
      return { paid: 0, failed: 0, skipped: 0 };
    }

    const pending = await this.prisma.pendingReferralPayout.findMany({
      where: {
        referrer_client_profile_id: referrerAccountId,
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
              contract_id: row.contract_id ? String(row.contract_id) : '',
              referrer_account_id: String(referrerAccountId),
              type: row.type,
              kind: 'referral_commission_backfill',
            },
          },
          {
            idempotencyKey: `ref_payout_backfill_${row.id}`,
          },
        );
        await this.prisma.pendingReferralPayout.update({
          where: { id: row.id },
          data: {
            status: 'PAID',
            stripe_transfer_id: tx.id,
            paid_at: new Date(),
            failure_reason: null,
          },
        });
        await this.audit.log(
          referrerAccountId,
          REFERRAL_AUDIT_EVENTS.COMMISSION_PAID,
          'pending_referral_payout',
          row.id,
          {
            backfill: true,
            stripe_transfer_id: tx.id,
            amount_gbp: row.amount.toString(),
          },
        );
        paid += 1;
      } catch (err) {
        await this.prisma.pendingReferralPayout.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            failure_reason: (err as Error).message.slice(0, 500),
          },
        });
        await this.audit.log(
          referrerAccountId,
          REFERRAL_AUDIT_EVENTS.COMMISSION_FAILED,
          'pending_referral_payout',
          row.id,
          {
            backfill: true,
            error: (err as Error).message,
          },
        );
        failed += 1;
      }
    }
    return { paid, failed, skipped: 0 };
  }

  /** Used by AuthService at signup to validate cookie code + lock attribution. */
  async validateRefCodeForSignup(code: string, newEmail: string) {
    const referrer = await this.lookupReferrerByCode(code);
    if (!referrer) return null;
    // Defensive: avoid self-ref via an existing account using the same email.
    const colliding = await this.prisma.account.findFirst({
      where: { email: newEmail, id: referrer.id },
    });
    if (colliding) return null;
    return referrer;
  }

  async attributeProjectClick(input: {
    code: string;
    target_id: bigint;
    target_role: 'WORKER' | 'EMPLOYER';
  }) {
    const referrer = await this.lookupReferrerByCode(input.code);
    if (!referrer) {
      throw new NotFoundException('Referral code not found');
    }
    // Validate target exists and matches role.
    if (input.target_role === 'WORKER') {
      // Job_post that the link points to.
      const jp = await this.prisma.jobPost.findUnique({
        where: { id: input.target_id },
        select: { id: true, title: true },
      });
      if (!jp) throw new BadRequestException('Job not found');
      return {
        referrer_display_name: referrer.client_profile?.display_name ?? null,
        target: { type: 'JOB', id: String(jp.id), title: jp.title },
      };
    } else {
      const wp = await this.prisma.workerProfile.findUnique({
        where: { id: input.target_id },
        include: { client_profile: { select: { display_name: true } } },
      });
      if (!wp) throw new BadRequestException('Worker not found');
      return {
        referrer_display_name: referrer.client_profile?.display_name ?? null,
        target: {
          type: 'WORKER',
          id: String(wp.id),
          title: wp.client_profile?.display_name ?? 'Worker',
        },
      };
    }
  }
}
