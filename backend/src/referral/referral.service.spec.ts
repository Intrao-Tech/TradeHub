// TEST-CR-010..020 — ReferralService.computeMilestoneCommissions cap math.
// Pure-logic tests with deep-mocked Prisma; no DB, no Stripe calls.
// Tests target the contract in tasks/in-progress/contracts-and-referrals/spec.md
// CR-041 (compute math + cap) and CR-107 (account ref window).

import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { ReferralService } from './referral.service';
import { PrismaService } from '../prisma/prisma.service';
import { REFERRAL_TYPE } from './referral.constants';

type StripeStub = {
  transfers: { create: jest.Mock };
};

function build(opts: { stripe?: StripeStub | null } = {}): {
  service: ReferralService;
  prisma: DeepMockProxy<PrismaService>;
  audit: { log: jest.Mock };
  mail: { sendReferralCommissionPaid: jest.Mock };
  stripe: StripeStub | null;
} {
  const prisma = mockDeep<PrismaService>();
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const mail = {
    sendReferralCommissionPaid: jest.fn().mockResolvedValue(undefined),
  };
  const stripe = opts.stripe ?? null;
  const service = new ReferralService(
    prisma,
    audit as unknown as ConstructorParameters<typeof ReferralService>[1],
    mail as unknown as ConstructorParameters<typeof ReferralService>[2],
    stripe as unknown as ConstructorParameters<typeof ReferralService>[3],
  );
  return { service, prisma, audit, mail, stripe };
}

const D = (n: string | number) => new Prisma.Decimal(n);

const DEFAULT_SETTING = {
  id: 1,
  client_marketplace_fee_percent: D('5'),
  freelancer_service_fee_percent: D('10'),
  account_referral_pct: D('10'),
  account_referral_window_months: 12,
  project_referral_w2w_pct: D('2'),
  project_referral_e2e_pct: D('2'),
  stripe_fee_passthrough: 'EMPLOYER_PAYS',
  updated_at: new Date(),
  updated_by: null,
};

const WORKER_ACC = 100n;
const EMPLOYER_ACC = 200n;
const REFERRER_W = 300n;
const REFERRER_E = 400n;
const PROJECT_REF = 500n;
const MILESTONE_ID = 9001n;
const CONTRACT_ID = 7001n;

describe('TEST-CR-010..020 ReferralService.computeMilestoneCommissions', () => {
  test('TEST-CR-010 (CR-041) — no referrers anywhere → returns []', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never) // worker
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never); // employer

    const lines = await service.computeMilestoneCommissions({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(lines).toEqual([]);
  });

  test('TEST-CR-011 (CR-041) — only worker has account ref within window → 1 ACCOUNT line', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_W,
        referred_at: new Date(), // fresh
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never);

    const lines = await service.computeMilestoneCommissions({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].referrerAccountId).toBe(REFERRER_W);
    expect(lines[0].type).toBe(REFERRAL_TYPE.ACCOUNT);
    // 50 * 10/100 = 5
    expect(lines[0].grossAmount.toString()).toBe('5');
    expect(lines[0].cappedAmount.toString()).toBe('5');
  });

  test('TEST-CR-012 (CR-041) — only employer has account ref → 1 ACCOUNT line for employer ref', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_E,
        referred_at: new Date(),
      } as never);

    const lines = await service.computeMilestoneCommissions({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].referrerAccountId).toBe(REFERRER_E);
    expect(lines[0].type).toBe(REFERRAL_TYPE.ACCOUNT);
  });

  test('TEST-CR-013 (CR-041) — both worker AND employer have account refs → 2 ACCOUNT lines', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_W,
        referred_at: new Date(),
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_E,
        referred_at: new Date(),
      } as never);

    const lines = await service.computeMilestoneCommissions({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.referrerAccountId).sort()).toEqual(
      [REFERRER_W, REFERRER_E].sort(),
    );
    expect(lines.every((l) => l.type === REFERRAL_TYPE.ACCOUNT)).toBe(true);
  });

  test('TEST-CR-014 (CR-041) — project ref WORKER → 1 PROJECT_W2W line', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never);

    const lines = await service.computeMilestoneCommissions({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: PROJECT_REF,
      projectReferrerRole: 'WORKER',
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe(REFERRAL_TYPE.PROJECT_W2W);
    // 1000 * 2/100 = 20
    expect(lines[0].grossAmount.toString()).toBe('20');
    // 20 < 50 platform_fee, no cap
    expect(lines[0].cappedAmount.toString()).toBe('20');
  });

  test('TEST-CR-015 (CR-041) — project ref EMPLOYER → 1 PROJECT_E2E line', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never);

    const lines = await service.computeMilestoneCommissions({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: PROJECT_REF,
      projectReferrerRole: 'EMPLOYER',
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe(REFERRAL_TYPE.PROJECT_E2E);
    expect(lines[0].grossAmount.toString()).toBe('20');
  });

  test('TEST-CR-016 (CR-041) — full stack, sum ≤ platform_fee → all lines uncapped', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_W,
        referred_at: new Date(),
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_E,
        referred_at: new Date(),
      } as never);

    const lines = await service.computeMilestoneCommissions({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: PROJECT_REF,
      projectReferrerRole: 'WORKER',
    });

    expect(lines).toHaveLength(3);
    // 5 + 5 + 20 = 30, < 50 → no cap
    const totalCapped = lines.reduce(
      (s, l) => s.add(l.cappedAmount),
      new Prisma.Decimal(0),
    );
    expect(totalCapped.toString()).toBe('30');
    // Each line uncapped → cappedAmount === grossAmount
    for (const l of lines) {
      expect(l.cappedAmount.toString()).toBe(l.grossAmount.toString());
    }
  });

  test('TEST-CR-017 (CR-041 cap clause) — sum > platform_fee → scaled, total ≤ platform_fee', async () => {
    const { service, prisma } = build();
    // High account ref % that pushes total over platform_fee.
    const highSetting = {
      ...DEFAULT_SETTING,
      account_referral_pct: D('80'), // 80% of platform_fee per ACCOUNT line
    };
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      highSetting as never,
    );
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_W,
        referred_at: new Date(),
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_E,
        referred_at: new Date(),
      } as never);

    const lines = await service.computeMilestoneCommissions({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: PROJECT_REF,
      projectReferrerRole: 'WORKER',
    });

    // gross: 50*0.8 + 50*0.8 + 1000*0.02 = 40 + 40 + 20 = 100
    // cap: scale by 50/100 = 0.5
    // cappedAmount: 20 + 20 + 10 = 50
    expect(lines).toHaveLength(3);
    const totalCapped = lines.reduce(
      (s, l) => s.add(l.cappedAmount),
      new Prisma.Decimal(0),
    );
    expect(totalCapped.toNumber()).toBeLessThanOrEqual(50);
  });

  test('TEST-CR-018 (notes.md cap math) — pence rounding accrues to platform (ROUND_DOWN)', async () => {
    const { service, prisma } = build();
    // Force a fractional cap so rounding is observable.
    // platform_fee=£3, refs each gross=£2 → sum=£4, factor=3/4=0.75
    // each capped: 2*0.75 = 1.5 → with the scale that's exact;
    // try odd: account=£2.50 + project=£0.50 → sum=£3, no cap, no rounding
    // odd: account=£1.999 → ROUND_DOWN to 1.99
    const highSetting = {
      ...DEFAULT_SETTING,
      account_referral_pct: D('66.6'),
    };
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      highSetting as never,
    );
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_W,
        referred_at: new Date(),
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never);

    const lines = await service.computeMilestoneCommissions({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('100'),
      platformFee: D('3'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    // 3 * 66.6/100 = 1.998 → ROUND_DOWN to 1.99
    expect(lines).toHaveLength(1);
    expect(lines[0].cappedAmount.toString()).toBe('1.99');
  });

  test('TEST-CR-019 (CR-107) — account ref window expired → ACCOUNT line excluded', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never, // 12-month window
    );
    // referred_at 18 months ago → outside window
    const longAgo = new Date();
    longAgo.setMonth(longAgo.getMonth() - 18);
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_W,
        referred_at: longAgo,
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never);

    const lines = await service.computeMilestoneCommissions({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(lines).toEqual([]);
  });

  test('TEST-CR-020 (CR-107) — window NULL = lifetime, ancient referred_at still credits', async () => {
    const { service, prisma } = build();
    const lifetimeSetting = {
      ...DEFAULT_SETTING,
      account_referral_window_months: null,
    };
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      lifetimeSetting as never,
    );
    const ancient = new Date();
    ancient.setFullYear(ancient.getFullYear() - 10);
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_W,
        referred_at: ancient,
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never);

    const lines = await service.computeMilestoneCommissions({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].referrerAccountId).toBe(REFERRER_W);
  });
});

describe('TEST-CR-070..077 ReferralService.fireCommissionsForRelease', () => {
  test('TEST-CR-070 (CR-042) — no referrers → no PendingReferralPayout rows', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never);

    await service.fireCommissionsForRelease({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(prisma.pendingReferralPayout.create).not.toHaveBeenCalled();
  });

  test('TEST-CR-071 (CR-042 live) — referrer onboarded → live transfer fires + PAID row', async () => {
    const stripe: StripeStub = {
      transfers: {
        create: jest.fn().mockResolvedValue({ id: 'tr_test_123' }),
      },
    };
    const { service, prisma, mail } = build({ stripe });
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_W,
        referred_at: new Date(),
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never);
    // Referrer profile: onboarded.
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: REFERRER_W,
      stripe_connect_account_id: 'acct_live_x',
      connect_payouts_enabled: true,
    } as never);
    prisma.contract.findUnique.mockResolvedValue({
      project_type: 'X',
      position: 1,
    } as never);

    await service.fireCommissionsForRelease({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(stripe.transfers.create).toHaveBeenCalledTimes(1);
    expect(prisma.pendingReferralPayout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PAID',
          stripe_transfer_id: 'tr_test_123',
        }),
      }),
    );
    // (Email notification is fire-and-forget; covered by integration tests.)
    void mail;
  });

  test('TEST-CR-072 (CR-042 fallback) — referrer not onboarded → PENDING row, no transfer', async () => {
    const stripe: StripeStub = {
      transfers: { create: jest.fn() },
    };
    const { service, prisma } = build({ stripe });
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_W,
        referred_at: new Date(),
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never);
    // Referrer profile: NOT onboarded.
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: REFERRER_W,
      stripe_connect_account_id: null,
      connect_payouts_enabled: false,
    } as never);
    prisma.contract.findUnique.mockResolvedValue({
      project_type: 'X',
      position: 1,
    } as never);

    await service.fireCommissionsForRelease({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(stripe.transfers.create).not.toHaveBeenCalled();
    expect(prisma.pendingReferralPayout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
        }),
      }),
    );
  });

  test('TEST-CR-073 (CR-042 fallback) — live transfer rejects → PENDING fallback', async () => {
    const stripe: StripeStub = {
      transfers: {
        create: jest.fn().mockRejectedValue(new Error('insufficient funds')),
      },
    };
    const { service, prisma } = build({ stripe });
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.account.findUnique
      .mockResolvedValueOnce({
        referred_by_id: REFERRER_W,
        referred_at: new Date(),
      } as never)
      .mockResolvedValueOnce({
        referred_by_id: null,
        referred_at: null,
      } as never);
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: REFERRER_W,
      stripe_connect_account_id: 'acct_x',
      connect_payouts_enabled: true,
    } as never);
    prisma.contract.findUnique.mockResolvedValue({
      project_type: 'X',
      position: 1,
    } as never);

    await service.fireCommissionsForRelease({
      milestoneId: MILESTONE_ID,
      contractId: CONTRACT_ID,
      agreedAmount: D('1000'),
      platformFee: D('50'),
      workerAccountId: WORKER_ACC,
      employerAccountId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(stripe.transfers.create).toHaveBeenCalled();
    expect(prisma.pendingReferralPayout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });
});

describe('TEST-CR-080..085 ReferralService.payPendingReferralPayouts (backfill)', () => {
  test('TEST-CR-080 (followup) — no PENDING rows → no-op {paid:0, failed:0}', async () => {
    const stripe: StripeStub = {
      transfers: { create: jest.fn() },
    };
    const { service, prisma } = build({ stripe });
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      stripe_connect_account_id: 'acct_x',
      connect_payouts_enabled: true,
    } as never);
    prisma.pendingReferralPayout.findMany.mockResolvedValueOnce([] as never);
    const r = await service.payPendingReferralPayouts(REFERRER_W);
    expect(r).toEqual({ paid: 0, failed: 0, skipped: 0 });
    expect(stripe.transfers.create).not.toHaveBeenCalled();
  });

  test('TEST-CR-080 (followup) — referrer not onboarded → no-op', async () => {
    const stripe: StripeStub = {
      transfers: { create: jest.fn() },
    };
    const { service, prisma } = build({ stripe });
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      stripe_connect_account_id: null,
      connect_payouts_enabled: false,
    } as never);
    const r = await service.payPendingReferralPayouts(REFERRER_W);
    expect(r).toEqual({ paid: 0, failed: 0, skipped: 0 });
    expect(stripe.transfers.create).not.toHaveBeenCalled();
  });

  test('TEST-CR-081 (followup) — onboarded + 1 PENDING → live transfer + flip to PAID', async () => {
    const stripe: StripeStub = {
      transfers: {
        create: jest.fn().mockResolvedValue({ id: 'tr_backfill_x' }),
      },
    };
    const { service, prisma } = build({ stripe });
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      stripe_connect_account_id: 'acct_x',
      connect_payouts_enabled: true,
    } as never);
    prisma.pendingReferralPayout.findMany.mockResolvedValueOnce([
      {
        id: 1n,
        amount: D('5'),
        milestone_id: 100n,
        contract_id: 200n,
        type: 'ACCOUNT',
      },
    ] as never);
    const r = await service.payPendingReferralPayouts(REFERRER_W);
    expect(r.paid).toBe(1);
    expect(r.failed).toBe(0);
    expect(stripe.transfers.create).toHaveBeenCalledTimes(1);
    expect(prisma.pendingReferralPayout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1n },
        data: expect.objectContaining({
          status: 'PAID',
          stripe_transfer_id: 'tr_backfill_x',
        }),
      }),
    );
  });

  test('TEST-CR-082 (followup) — transfer rejects → row flips to FAILED with reason', async () => {
    const stripe: StripeStub = {
      transfers: {
        create: jest.fn().mockRejectedValue(new Error('account_blocked')),
      },
    };
    const { service, prisma } = build({ stripe });
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      stripe_connect_account_id: 'acct_x',
      connect_payouts_enabled: true,
    } as never);
    prisma.pendingReferralPayout.findMany.mockResolvedValueOnce([
      {
        id: 99n,
        amount: D('1'),
        milestone_id: 1n,
        contract_id: 1n,
        type: 'ACCOUNT',
      },
    ] as never);
    const r = await service.payPendingReferralPayouts(REFERRER_W);
    expect(r.failed).toBe(1);
    expect(prisma.pendingReferralPayout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 99n },
        data: expect.objectContaining({
          status: 'FAILED',
          failure_reason: expect.stringContaining('account_blocked'),
        }),
      }),
    );
  });
});
