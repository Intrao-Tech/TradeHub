// TEST-CR-010..020 — ReferralService.computeMilestoneCommissions cap math.
// Pure-logic tests with deep-mocked Prisma; no DB, no Stripe calls.
// Targets CR-041 (compute math + cap) and CR-107 (account ref window).
// Post-2026-05 rework: commissions are computed against the client_profile
// referral columns; the payment ledger + Stripe transfers moved to
// EscrowService (fireCommissionsForRelease was removed from ReferralService).

import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { ReferralService } from './referral.service';
import { PrismaService } from '../prisma/prisma.service';

function build(): {
  service: ReferralService;
  prisma: DeepMockProxy<PrismaService>;
  mail: { sendReferralCommissionPaid: jest.Mock };
} {
  const prisma = mockDeep<PrismaService>();
  const mail = {
    sendReferralCommissionPaid: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ReferralService(
    prisma,
    mail as unknown as ConstructorParameters<typeof ReferralService>[1],
  );
  return { service, prisma, mail };
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
    prisma.clientProfile.findUnique
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
      workerClientProfileId: WORKER_ACC,
      employerClientProfileId: EMPLOYER_ACC,
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
    prisma.clientProfile.findUnique
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
      workerClientProfileId: WORKER_ACC,
      employerClientProfileId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].referrerClientProfileId).toBe(REFERRER_W);
    expect(lines[0].type).toBe('REFERRAL_ACCOUNT');
    // 50 * 10/100 = 5
    expect(lines[0].grossAmount.toString()).toBe('5');
    expect(lines[0].cappedAmount.toString()).toBe('5');
  });

  test('TEST-CR-012 (CR-041) — only employer has account ref → 1 ACCOUNT line for employer ref', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
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
      workerClientProfileId: WORKER_ACC,
      employerClientProfileId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].referrerClientProfileId).toBe(REFERRER_E);
    expect(lines[0].type).toBe('REFERRAL_ACCOUNT');
  });

  test('TEST-CR-013 (CR-041) — both worker AND employer have account refs → 2 ACCOUNT lines', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
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
      workerClientProfileId: WORKER_ACC,
      employerClientProfileId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.referrerClientProfileId).sort()).toEqual(
      [REFERRER_W, REFERRER_E].sort(),
    );
    expect(lines.every((l) => l.type === 'REFERRAL_ACCOUNT')).toBe(true);
  });

  test('TEST-CR-014 (CR-041) — project ref WORKER → 1 PROJECT_W2W line', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
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
      workerClientProfileId: WORKER_ACC,
      employerClientProfileId: EMPLOYER_ACC,
      projectReferrerId: PROJECT_REF,
      projectReferrerRole: 'WORKER',
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe('REFERRAL_W2W');
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
    prisma.clientProfile.findUnique
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
      workerClientProfileId: WORKER_ACC,
      employerClientProfileId: EMPLOYER_ACC,
      projectReferrerId: PROJECT_REF,
      projectReferrerRole: 'EMPLOYER',
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe('REFERRAL_E2E');
    expect(lines[0].grossAmount.toString()).toBe('20');
  });

  test('TEST-CR-016 (CR-041) — full stack, sum ≤ platform_fee → all lines uncapped', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
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
      workerClientProfileId: WORKER_ACC,
      employerClientProfileId: EMPLOYER_ACC,
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
    prisma.clientProfile.findUnique
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
      workerClientProfileId: WORKER_ACC,
      employerClientProfileId: EMPLOYER_ACC,
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
    prisma.clientProfile.findUnique
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
      workerClientProfileId: WORKER_ACC,
      employerClientProfileId: EMPLOYER_ACC,
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
    prisma.clientProfile.findUnique
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
      workerClientProfileId: WORKER_ACC,
      employerClientProfileId: EMPLOYER_ACC,
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
    prisma.clientProfile.findUnique
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
      workerClientProfileId: WORKER_ACC,
      employerClientProfileId: EMPLOYER_ACC,
      projectReferrerId: null,
      projectReferrerRole: null,
    });

    expect(lines).toHaveLength(1);
    expect(lines[0].referrerClientProfileId).toBe(REFERRER_W);
  });
});
