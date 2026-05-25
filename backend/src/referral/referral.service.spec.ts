// TEST-CR-010..021 — ReferralService.computeMilestoneCommissions.
// Pure-logic tests with deep-mocked Prisma; no DB, no Stripe calls.
//
// Rules under test:
//  - account ref pays out on the referred user's FIRST REVENUE contract —
//    the first contract on which a milestone was actually released (money
//    moved + commission computed). There is no time window. It then pays on
//    every milestone of that contract. Worker and employer sides are
//    evaluated independently.
//  - "first revenue contract" is resolved from escrow_milestone: the contract
//    of the earliest RELEASED milestone under any of the user's
//    collaborations. No prior release anywhere → the current contract IS the
//    first revenue contract (so the very first release on a fresh contract
//    still pays).
//  - project ref is W2W only — E2E is disabled, so an EMPLOYER project ref
//    produces no commission line.
//  - the sum of all lines is capped at the milestone's platform_fee.

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

const baseInput = {
  milestoneId: MILESTONE_ID,
  contractId: CONTRACT_ID,
  agreedAmount: D('1000'),
  platformFee: D('50'),
  workerClientProfileId: WORKER_ACC,
  employerClientProfileId: EMPLOYER_ACC,
  projectReferrerId: null as bigint | null,
  projectReferrerRole: null as 'WORKER' | 'EMPLOYER' | null,
};

describe('TEST-CR-010..021 ReferralService.computeMilestoneCommissions', () => {
  test('TEST-CR-010 — no referrers anywhere → returns []', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
      .mockResolvedValueOnce({ referred_by_id: null } as never)
      .mockResolvedValueOnce({ referred_by_id: null } as never);

    const lines = await service.computeMilestoneCommissions({ ...baseInput });
    expect(lines).toEqual([]);
  });

  test('TEST-CR-011 — worker account ref on the FIRST REVENUE contract → 1 ACCOUNT line', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
      .mockResolvedValueOnce({ referred_by_id: REFERRER_W } as never)
      .mockResolvedValueOnce({ referred_by_id: null } as never);
    // No milestone has been released anywhere yet → this milestone's contract
    // IS the worker's first revenue contract.
    prisma.escrowMilestone.findFirst.mockResolvedValue(null as never);

    const lines = await service.computeMilestoneCommissions({ ...baseInput });
    expect(lines).toHaveLength(1);
    expect(lines[0].referrerClientProfileId).toBe(REFERRER_W);
    expect(lines[0].type).toBe('REFERRAL_ACCOUNT');
    expect(lines[0].grossAmount.toString()).toBe('5'); // 50 * 10/100
    expect(lines[0].cappedAmount.toString()).toBe('5');
  });

  test('TEST-CR-012 — employer account ref on the FIRST REVENUE contract → 1 ACCOUNT line', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
      .mockResolvedValueOnce({ referred_by_id: null } as never)
      .mockResolvedValueOnce({ referred_by_id: REFERRER_E } as never);
    prisma.escrowMilestone.findFirst.mockResolvedValue(null as never);

    const lines = await service.computeMilestoneCommissions({ ...baseInput });
    expect(lines).toHaveLength(1);
    expect(lines[0].referrerClientProfileId).toBe(REFERRER_E);
    expect(lines[0].type).toBe('REFERRAL_ACCOUNT');
  });

  test('TEST-CR-013 — both account refs, both on the first revenue contract → 2 ACCOUNT lines', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
      .mockResolvedValueOnce({ referred_by_id: REFERRER_W } as never)
      .mockResolvedValueOnce({ referred_by_id: REFERRER_E } as never);
    prisma.escrowMilestone.findFirst.mockResolvedValue(null as never);

    const lines = await service.computeMilestoneCommissions({ ...baseInput });
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.referrerClientProfileId).sort()).toEqual(
      [REFERRER_W, REFERRER_E].sort(),
    );
    expect(lines.every((l) => l.type === 'REFERRAL_ACCOUNT')).toBe(true);
  });

  test('TEST-CR-014 — project ref WORKER → 1 REFERRAL_W2W line', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
      .mockResolvedValueOnce({ referred_by_id: null } as never)
      .mockResolvedValueOnce({ referred_by_id: null } as never);

    const lines = await service.computeMilestoneCommissions({
      ...baseInput,
      projectReferrerId: PROJECT_REF,
      projectReferrerRole: 'WORKER',
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe('REFERRAL_W2W');
    expect(lines[0].grossAmount.toString()).toBe('20'); // 1000 * 2/100
    expect(lines[0].cappedAmount.toString()).toBe('20');
  });

  test('TEST-CR-015 — project ref EMPLOYER → no line (E2E disabled)', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
      .mockResolvedValueOnce({ referred_by_id: null } as never)
      .mockResolvedValueOnce({ referred_by_id: null } as never);

    const lines = await service.computeMilestoneCommissions({
      ...baseInput,
      projectReferrerId: PROJECT_REF,
      projectReferrerRole: 'EMPLOYER',
    });
    expect(lines).toEqual([]);
  });

  test('TEST-CR-016 — full stack (worker acc + employer acc + project W2W) on first revenue contract → 3 lines, uncapped', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
      .mockResolvedValueOnce({ referred_by_id: REFERRER_W } as never)
      .mockResolvedValueOnce({ referred_by_id: REFERRER_E } as never);
    prisma.escrowMilestone.findFirst.mockResolvedValue(null as never);

    const lines = await service.computeMilestoneCommissions({
      ...baseInput,
      projectReferrerId: PROJECT_REF,
      projectReferrerRole: 'WORKER',
    });
    expect(lines).toHaveLength(3);
    const total = lines.reduce((s, l) => s.add(l.cappedAmount), D(0));
    expect(total.toString()).toBe('30'); // 5 + 5 + 20, < 50 → no cap
    for (const l of lines) {
      expect(l.cappedAmount.toString()).toBe(l.grossAmount.toString());
    }
  });

  test('TEST-CR-017 — sum > platform_fee → scaled, total ≤ platform_fee', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce({
      ...DEFAULT_SETTING,
      account_referral_pct: D('80'),
    } as never);
    prisma.clientProfile.findUnique
      .mockResolvedValueOnce({ referred_by_id: REFERRER_W } as never)
      .mockResolvedValueOnce({ referred_by_id: REFERRER_E } as never);
    prisma.escrowMilestone.findFirst.mockResolvedValue(null as never);

    const lines = await service.computeMilestoneCommissions({
      ...baseInput,
      projectReferrerId: PROJECT_REF,
      projectReferrerRole: 'WORKER',
    });
    // gross 40 + 40 + 20 = 100 → factor 50/100 → capped total ≤ 50
    expect(lines).toHaveLength(3);
    const total = lines.reduce((s, l) => s.add(l.cappedAmount), D(0));
    expect(total.toNumber()).toBeLessThanOrEqual(50);
  });

  test('TEST-CR-018 — pence rounding accrues to the platform (ROUND_DOWN)', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce({
      ...DEFAULT_SETTING,
      account_referral_pct: D('66.6'),
    } as never);
    prisma.clientProfile.findUnique
      .mockResolvedValueOnce({ referred_by_id: REFERRER_W } as never)
      .mockResolvedValueOnce({ referred_by_id: null } as never);
    prisma.escrowMilestone.findFirst.mockResolvedValue(null as never);

    const lines = await service.computeMilestoneCommissions({
      ...baseInput,
      agreedAmount: D('100'),
      platformFee: D('3'),
    });
    // 3 * 66.6/100 = 1.998 → ROUND_DOWN → 1.99
    expect(lines).toHaveLength(1);
    expect(lines[0].cappedAmount.toString()).toBe('1.99');
  });

  test('TEST-CR-019 — account ref on a NON-first-revenue contract → ACCOUNT line excluded', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
      .mockResolvedValueOnce({ referred_by_id: REFERRER_W } as never)
      .mockResolvedValueOnce({ referred_by_id: null } as never);
    // An earlier, different contract already had a released milestone — so
    // this contract is NOT the worker's first revenue contract.
    prisma.escrowMilestone.findFirst.mockResolvedValue({
      contract_id: 6001n,
    } as never);

    const lines = await service.computeMilestoneCommissions({ ...baseInput });
    expect(lines).toEqual([]);
  });

  test('TEST-CR-020 — project W2W still pays on a non-first-revenue contract (project ref is not first-gated)', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
      .mockResolvedValueOnce({ referred_by_id: REFERRER_W } as never)
      .mockResolvedValueOnce({ referred_by_id: null } as never);
    // An earlier contract already had a released milestone → account ref is
    // excluded …
    prisma.escrowMilestone.findFirst.mockResolvedValue({
      contract_id: 6001n,
    } as never);

    const lines = await service.computeMilestoneCommissions({
      ...baseInput,
      projectReferrerId: PROJECT_REF,
      projectReferrerRole: 'WORKER',
    });
    // … but the project W2W line is unaffected by the first-revenue rule.
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe('REFERRAL_W2W');
    expect(lines[0].referrerClientProfileId).toBe(PROJECT_REF);
  });

  test('TEST-CR-021 — account ref still pays on a LATER milestone of the first revenue contract', async () => {
    const { service, prisma } = build();
    prisma.platformSetting.findUnique.mockResolvedValueOnce(
      DEFAULT_SETTING as never,
    );
    prisma.clientProfile.findUnique
      .mockResolvedValueOnce({ referred_by_id: REFERRER_W } as never)
      .mockResolvedValueOnce({ referred_by_id: null } as never);
    // An EARLIER milestone of THIS SAME contract was already released — the
    // contract is still the worker's first revenue contract, so the ref keeps
    // earning on each of its milestones.
    prisma.escrowMilestone.findFirst.mockResolvedValue({
      contract_id: CONTRACT_ID,
    } as never);

    const lines = await service.computeMilestoneCommissions({ ...baseInput });
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe('REFERRAL_ACCOUNT');
    expect(lines[0].referrerClientProfileId).toBe(REFERRER_W);
    expect(lines[0].grossAmount.toString()).toBe('5');
  });
});
