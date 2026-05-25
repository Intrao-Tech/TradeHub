// TEST-VER-100..107 — PromotionEngine unit specs.
//
// Truth-table coverage of the verification ladder predicate plus the
// orchestration around `runPromotion` (audit, milestone write, idempotency,
// deactivated guard). Prisma deep-mocked; no DB.

import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { PromotionEngine } from './promotion-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type EvalCtx = Parameters<PromotionEngine['evaluate']>[0];

function build(): {
  engine: PromotionEngine;
  prisma: DeepMockProxy<PrismaService>;
  audit: { log: jest.Mock };
} {
  const prisma = mockDeep<PrismaService>();
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const engine = new PromotionEngine(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  // Default `$transaction` returns the array verbatim.
  // Cast to `never` matches the deep-mocked overload's expected return type.

  prisma.$transaction.mockImplementation(async (calls: unknown) => {
    if (Array.isArray(calls)) return calls.map(() => ({}) as unknown) as never;
    return undefined as never;
  });
  return { engine, prisma, audit };
}

const PROFILE_ID = 42n;

function ctx(overrides: Partial<EvalCtx> = {}): EvalCtx {
  return {
    isWorker: true,
    hasIdentityVerified: false,
    approvedDocTypes: new Set<string>(),
    verifiedReviewsCount: 0,
    hasCompanyHouseVerified: false,
    ...overrides,
  };
}

describe('TEST-VER-100 PromotionEngine.evaluate() — worker truth table — VER-010 / VER-011', () => {
  test('VER-010 — no identity → UNVERIFIED', () => {
    const { engine } = build();
    expect(engine.evaluate(ctx())).toBe('UNVERIFIED');
  });

  test('VER-011 — identity only → BASIC', () => {
    const { engine } = build();
    expect(engine.evaluate(ctx({ hasIdentityVerified: true }))).toBe('BASIC');
  });

  test.each([
    ['CSCS_CARD'],
    ['GAS_SAFE_CERT'],
    ['NICEIC_CERT'],
    ['FIRAS_CERT'],
  ])('VER-012 — identity + %s approved → CERTIFIED', (docType) => {
    const { engine } = build();
    expect(
      engine.evaluate(
        ctx({
          hasIdentityVerified: true,
          approvedDocTypes: new Set([docType]),
        }),
      ),
    ).toBe('CERTIFIED');
  });

  test('VER-013 — identity + cert + 4 reviews → CERTIFIED (Premium predicate fails)', () => {
    const { engine } = build();
    expect(
      engine.evaluate(
        ctx({
          hasIdentityVerified: true,
          approvedDocTypes: new Set(['CSCS_CARD']),
          verifiedReviewsCount: 4,
        }),
      ),
    ).toBe('CERTIFIED');
  });

  test('VER-013 — identity + cert + 5 reviews → PREMIUM (predicate path)', () => {
    const { engine } = build();
    expect(
      engine.evaluate(
        ctx({
          hasIdentityVerified: true,
          approvedDocTypes: new Set(['CSCS_CARD']),
          verifiedReviewsCount: 5,
        }),
      ),
    ).toBe('PREMIUM');
  });

  test('VER-012 — identity + non-cert doc only (INSURANCE) for worker → BASIC', () => {
    const { engine } = build();
    expect(
      engine.evaluate(
        ctx({
          hasIdentityVerified: true,
          approvedDocTypes: new Set(['INSURANCE']),
        }),
      ),
    ).toBe('BASIC');
  });
});

describe('TEST-VER-101 PromotionEngine.evaluate() — employer truth table — VER-012 / VER-013', () => {
  test('VER-012 — identity only → BASIC', () => {
    const { engine } = build();
    expect(
      engine.evaluate(ctx({ isWorker: false, hasIdentityVerified: true })),
    ).toBe('BASIC');
  });

  test('VER-012 — identity + INSURANCE only → BASIC (employer needs both)', () => {
    const { engine } = build();
    expect(
      engine.evaluate(
        ctx({
          isWorker: false,
          hasIdentityVerified: true,
          approvedDocTypes: new Set(['INSURANCE']),
        }),
      ),
    ).toBe('BASIC');
  });

  test('VER-012 — identity + COMPANY_LETTERHEAD only → BASIC', () => {
    const { engine } = build();
    expect(
      engine.evaluate(
        ctx({
          isWorker: false,
          hasIdentityVerified: true,
          approvedDocTypes: new Set(['COMPANY_LETTERHEAD']),
        }),
      ),
    ).toBe('BASIC');
  });

  test('VER-012 — identity + INSURANCE + COMPANY_LETTERHEAD → CERTIFIED', () => {
    const { engine } = build();
    expect(
      engine.evaluate(
        ctx({
          isWorker: false,
          hasIdentityVerified: true,
          approvedDocTypes: new Set(['INSURANCE', 'COMPANY_LETTERHEAD']),
        }),
      ),
    ).toBe('CERTIFIED');
  });

  test('VER-013 — employer Premium needs Companies House (5 reviews + no CH → CERTIFIED)', () => {
    const { engine } = build();
    expect(
      engine.evaluate(
        ctx({
          isWorker: false,
          hasIdentityVerified: true,
          approvedDocTypes: new Set(['INSURANCE', 'COMPANY_LETTERHEAD']),
          verifiedReviewsCount: 5,
          hasCompanyHouseVerified: false,
        }),
      ),
    ).toBe('CERTIFIED');
  });

  test('VER-013 — employer Premium with 5 reviews + CH → PREMIUM', () => {
    const { engine } = build();
    expect(
      engine.evaluate(
        ctx({
          isWorker: false,
          hasIdentityVerified: true,
          approvedDocTypes: new Set(['INSURANCE', 'COMPANY_LETTERHEAD']),
          verifiedReviewsCount: 5,
          hasCompanyHouseVerified: true,
        }),
      ),
    ).toBe('PREMIUM');
  });
});

describe('TEST-VER-102 PromotionEngine.runPromotion() milestone shape — VER-014', () => {
  test('writes LEVEL_PROMOTED with comma-joined evidence_ref + notes=newLevel', async () => {
    const { engine, prisma, audit } = build();
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'UNVERIFIED',
      worker_profile: { id: PROFILE_ID },
      employer_profile: null,
      account: { status: 'ACTIVE' },
    } as never);
    prisma.verificationMilestone.findMany.mockResolvedValueOnce([
      { milestone_type: 'IDENTITY_VERIFIED' },
    ] as never);
    prisma.document.findMany.mockResolvedValueOnce([] as never);

    const result = await engine.runPromotion(PROFILE_ID, {
      milestoneIds: [10n, 20n],
      staffMemberId: 7n,
    });

    expect(result).toEqual({ from: 'UNVERIFIED', to: 'BASIC' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.verificationMilestone.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client_profile_id: PROFILE_ID,
        milestone_type: 'LEVEL_PROMOTED',
        staff_member_id: 7n,
        evidence_ref: '10,20',
        notes: 'BASIC',
      }),
    });
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  test('empty milestoneIds → evidence_ref null', async () => {
    const { engine, prisma } = build();
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'UNVERIFIED',
      worker_profile: { id: PROFILE_ID },
      employer_profile: null,
      account: { status: 'ACTIVE' },
    } as never);
    prisma.verificationMilestone.findMany.mockResolvedValueOnce([
      { milestone_type: 'IDENTITY_VERIFIED' },
    ] as never);
    prisma.document.findMany.mockResolvedValueOnce([] as never);

    await engine.runPromotion(PROFILE_ID, {
      milestoneIds: [],
      staffMemberId: null,
    });

    expect(prisma.verificationMilestone.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        evidence_ref: null,
        staff_member_id: null,
      }),
    });
  });
});

describe('TEST-VER-103 PromotionEngine.runPromotion() idempotency — VER-014', () => {
  test('second run on identical evidence returns null and writes nothing', async () => {
    const { engine, prisma, audit } = build();
    // Already at BASIC — running again with the same evidence is a no-op.
    prisma.clientProfile.findUnique.mockResolvedValue({
      id: PROFILE_ID,
      verification_level: 'BASIC',
      worker_profile: { id: PROFILE_ID },
      employer_profile: null,
      account: { status: 'ACTIVE' },
    } as never);
    prisma.verificationMilestone.findMany.mockResolvedValue([
      { milestone_type: 'IDENTITY_VERIFIED' },
    ] as never);
    prisma.document.findMany.mockResolvedValue([] as never);

    const result = await engine.runPromotion(PROFILE_ID, {
      milestoneIds: [1n],
      staffMemberId: null,
    });

    expect(result).toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('TEST-VER-104 PromotionEngine.runPromotion() deactivated-account guard', () => {
  test('account.status !== ACTIVE → returns null, writes nothing', async () => {
    const { engine, prisma, audit } = build();
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'UNVERIFIED',
      worker_profile: { id: PROFILE_ID },
      employer_profile: null,
      account: { status: 'DEACTIVATED' },
    } as never);

    const result = await engine.runPromotion(PROFILE_ID, {
      milestoneIds: [1n],
      staffMemberId: null,
    });

    expect(result).toBeNull();
    expect(prisma.verificationMilestone.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  test('profile not found → returns null', async () => {
    const { engine, prisma } = build();
    prisma.clientProfile.findUnique.mockResolvedValueOnce(null as never);
    const result = await engine.runPromotion(PROFILE_ID, {
      milestoneIds: [],
      staffMemberId: null,
    });
    expect(result).toBeNull();
  });
});

describe('TEST-VER-105 PromotionEngine.runPromotion() audit row — VER-014', () => {
  test('transition writes verification.level_changed with from/to/evidence_milestones', async () => {
    const { engine, prisma, audit } = build();
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'BASIC',
      worker_profile: { id: PROFILE_ID },
      employer_profile: null,
      account: { status: 'ACTIVE' },
    } as never);
    prisma.verificationMilestone.findMany.mockResolvedValueOnce([
      { milestone_type: 'IDENTITY_VERIFIED' },
    ] as never);
    prisma.document.findMany.mockResolvedValueOnce([
      { doc_type: 'CSCS_CARD' },
    ] as never);

    await engine.runPromotion(PROFILE_ID, {
      milestoneIds: [55n],
      staffMemberId: 7n,
      ip: '127.0.0.1',
    });

    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      PROFILE_ID,
      'verification.level_changed',
      'client_profile',
      PROFILE_ID,
      {
        from: 'BASIC',
        to: 'CERTIFIED',
        evidence_milestones: ['55'],
      },
      '127.0.0.1',
    );
  });

  test('no-op run (same level) does not write audit row', async () => {
    const { engine, prisma, audit } = build();
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'BASIC',
      worker_profile: { id: PROFILE_ID },
      employer_profile: null,
      account: { status: 'ACTIVE' },
    } as never);
    prisma.verificationMilestone.findMany.mockResolvedValueOnce([
      { milestone_type: 'IDENTITY_VERIFIED' },
    ] as never);
    prisma.document.findMany.mockResolvedValueOnce([] as never);

    await engine.runPromotion(PROFILE_ID, {
      milestoneIds: [],
      staffMemberId: null,
    });
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('TEST-VER-106 PromotionEngine demotion path — VER-004', () => {
  test('certified worker losing the cert document drops back to BASIC', async () => {
    const { engine, prisma } = build();
    // currently CERTIFIED, but no APPROVED cert docs anymore.
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'CERTIFIED',
      worker_profile: { id: PROFILE_ID },
      employer_profile: null,
      account: { status: 'ACTIVE' },
    } as never);
    prisma.verificationMilestone.findMany.mockResolvedValueOnce([
      { milestone_type: 'IDENTITY_VERIFIED' },
    ] as never);
    prisma.document.findMany.mockResolvedValueOnce([] as never);

    const result = await engine.runPromotion(PROFILE_ID, {
      milestoneIds: [],
      staffMemberId: null,
    });
    expect(result).toEqual({ from: 'CERTIFIED', to: 'BASIC' });
  });

  test('basic worker losing the IDENTITY_VERIFIED milestone drops to UNVERIFIED', async () => {
    const { engine, prisma } = build();
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'BASIC',
      worker_profile: { id: PROFILE_ID },
      employer_profile: null,
      account: { status: 'ACTIVE' },
    } as never);
    prisma.verificationMilestone.findMany.mockResolvedValueOnce([] as never);
    prisma.document.findMany.mockResolvedValueOnce([] as never);

    const result = await engine.runPromotion(PROFILE_ID, {
      milestoneIds: [],
      staffMemberId: null,
    });
    expect(result).toEqual({ from: 'BASIC', to: 'UNVERIFIED' });
  });
});

describe('TEST-VER-107 PromotionEngine.gatherEvidence excludes non-APPROVED docs', () => {
  test('document.findMany is called with status=APPROVED only', async () => {
    const { engine, prisma } = build();
    prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'UNVERIFIED',
      worker_profile: { id: PROFILE_ID },
      employer_profile: null,
      account: { status: 'ACTIVE' },
    } as never);
    prisma.verificationMilestone.findMany.mockResolvedValueOnce([] as never);
    prisma.document.findMany.mockResolvedValueOnce([] as never);

    await engine.runPromotion(PROFILE_ID, {
      milestoneIds: [],
      staffMemberId: null,
    });

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          client_profile_id: PROFILE_ID,
          status: 'APPROVED',
        }),
      }),
    );
  });
});
