// TEST-VER-140..154 — VerificationService unit specs.
//
// Stripe Identity orchestration (140..148), reads (150..154). Stripe is
// type-mocked; mail/audit/promotion engine are jest mocks. Prisma deep-
// mocked. No DI, no Nest module — pure constructor + method calls.

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { VerificationService } from './verification.service';
import { PromotionEngine } from './promotion-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';

const PROFILE_ID = 42n;

type Mocks = {
  prisma: DeepMockProxy<PrismaService>;
  stripe: {
    identity: {
      verificationSessions: {
        create: jest.Mock;
        retrieve: jest.Mock;
      };
    };
  };
  audit: { log: jest.Mock };
  engine: { runPromotion: jest.Mock };
  mail: {
    sendVerificationVerified: jest.Mock;
    sendVerificationFailed: jest.Mock;
  };
};

function build(opts: { stripeConfigured?: boolean } = {}): {
  service: VerificationService;
  mocks: Mocks;
} {
  const prisma = mockDeep<PrismaService>();
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const engine = { runPromotion: jest.fn().mockResolvedValue(null) };
  const mail = {
    sendVerificationVerified: jest.fn().mockResolvedValue(undefined),
    sendVerificationFailed: jest.fn().mockResolvedValue(undefined),
  };
  const stripe = {
    identity: {
      verificationSessions: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    },
  };
  const config = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'FRONTEND_URL') return 'http://localhost:3000';
      return undefined;
    }),
  } as unknown as ConfigService;

  const service = new VerificationService(
    prisma,
    config,
    audit as unknown as AuditService,
    opts.stripeConfigured === false ? null : (stripe as unknown as Stripe),
    engine as unknown as PromotionEngine,
    mail as unknown as MailService,
  );

  return { service, mocks: { prisma, stripe, audit, engine, mail } };
}

// ─── Stripe Identity ───────────────────────────────────────────────

describe('TEST-VER-140 startIdentitySession not configured — VER-021', () => {
  test('Stripe null → 503 STRIPE_NOT_CONFIGURED', async () => {
    const { service } = build({ stripeConfigured: false });
    const err = await service
      .startIdentitySession(PROFILE_ID)
      .catch((e: ServiceUnavailableException) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(((err as ServiceUnavailableException).getResponse() as { code: string }).code).toBe(
      'STRIPE_NOT_CONFIGURED',
    );
  });
});

describe('TEST-VER-141 startIdentitySession already-verified — VER-022', () => {
  test.each(['BASIC', 'CERTIFIED', 'PREMIUM'])(
    '%s user → 409 ALREADY_VERIFIED',
    async (level) => {
      const { service, mocks } = build();
      mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
        id: PROFILE_ID,
        verification_level: level,
        account: { status: 'ACTIVE' },
      } as never);

      const err = await service
        .startIdentitySession(PROFILE_ID)
        .catch((e: ConflictException) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(((err as ConflictException).getResponse() as { code: string }).code).toBe(
        'ALREADY_VERIFIED',
      );
    },
  );

  test('profile not found → 404', async () => {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce(null as never);
    const err = await service
      .startIdentitySession(PROFILE_ID)
      .catch((e: NotFoundException) => e);
    expect(err).toBeInstanceOf(NotFoundException);
  });
});

describe('TEST-VER-142 startIdentitySession happy path — VER-023', () => {
  test('creates Stripe session with documented options + writes audit', async () => {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'UNVERIFIED',
      account: { status: 'ACTIVE' },
    } as never);
    mocks.stripe.identity.verificationSessions.create.mockResolvedValueOnce({
      id: 'vs_test_123',
      url: 'https://verify.stripe.com/test',
      status: 'requires_input',
    });

    const result = await service.startIdentitySession(PROFILE_ID);

    expect(result).toEqual({
      verification_url: 'https://verify.stripe.com/test',
      session_id: 'vs_test_123',
      status: 'requires_input',
    });
    expect(mocks.stripe.identity.verificationSessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'document',
        metadata: expect.objectContaining({
          account_id: PROFILE_ID.toString(),
          client_profile_id: PROFILE_ID.toString(),
        }),
        options: expect.objectContaining({
          document: expect.objectContaining({
            allowed_types: ['driving_license', 'passport', 'id_card'],
            require_matching_selfie: true,
          }),
        }),
      }),
    );
    expect(mocks.audit.log).toHaveBeenCalledWith(
      PROFILE_ID,
      'verification.identity.started',
      'client_profile',
      PROFILE_ID,
      { session_id: 'vs_test_123' },
      undefined,
    );
  });
});

describe('TEST-VER-143 webhook verified happy path — VER-024', () => {
  test('writes IDENTITY_VERIFIED milestone, audit, fires mail, runs promotion', async () => {
    const { service, mocks } = build();
    mocks.prisma.verificationMilestone.findFirst.mockResolvedValueOnce(null as never);
    mocks.prisma.verificationMilestone.create.mockResolvedValueOnce({
      id: 999n,
    } as never);
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      display_name: 'Mike Builder',
      account: { email: 'mike@example.com' },
    } as never);

    await service.handleWebhookEvent({
      type: 'identity.verification_session.verified',
      data: {
        object: {
          id: 'vs_test_123',
          metadata: { account_id: PROFILE_ID.toString() },
        },
      },
    } as unknown as Stripe.Event);

    expect(mocks.prisma.verificationMilestone.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        client_profile_id: PROFILE_ID,
        milestone_type: 'IDENTITY_VERIFIED',
        evidence_ref: 'vs_test_123',
      }),
    });
    expect(mocks.audit.log).toHaveBeenCalledWith(
      PROFILE_ID,
      'verification.identity.verified',
      'client_profile',
      PROFILE_ID,
      { session_id: 'vs_test_123' },
    );
    expect(mocks.engine.runPromotion).toHaveBeenCalledWith(PROFILE_ID, {
      milestoneIds: [999n],
      staffMemberId: null,
    });
    expect(mocks.mail.sendVerificationVerified).toHaveBeenCalledWith(
      'mike@example.com',
      'Mike Builder',
    );
  });
});

describe('TEST-VER-144 webhook verified idempotency — VER-025', () => {
  test('replaying same session.id finds existing milestone, exits early', async () => {
    const { service, mocks } = build();
    mocks.prisma.verificationMilestone.findFirst.mockResolvedValueOnce({
      id: 999n,
      milestone_type: 'IDENTITY_VERIFIED',
      evidence_ref: 'vs_test_123',
    } as never);
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      display_name: 'Mike',
      account: { email: 'mike@example.com' },
    } as never);

    await service.handleWebhookEvent({
      type: 'identity.verification_session.verified',
      data: {
        object: {
          id: 'vs_test_123',
          metadata: { account_id: PROFILE_ID.toString() },
        },
      },
    } as unknown as Stripe.Event);

    expect(mocks.prisma.verificationMilestone.create).not.toHaveBeenCalled();
    expect(mocks.audit.log).not.toHaveBeenCalled();
    expect(mocks.engine.runPromotion).not.toHaveBeenCalled();
    expect(mocks.mail.sendVerificationVerified).not.toHaveBeenCalled();
  });
});

describe('TEST-VER-145 webhook requires_input — VER-024', () => {
  test('writes audit failed + fires sendVerificationFailed; no milestone, no promotion', async () => {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      display_name: 'Mike',
      account: { email: 'mike@example.com' },
    } as never);

    await service.handleWebhookEvent({
      type: 'identity.verification_session.requires_input',
      data: {
        object: {
          id: 'vs_failed_1',
          metadata: { account_id: PROFILE_ID.toString() },
          last_error: { code: 'document_unverified_other' },
        },
      },
    } as unknown as Stripe.Event);

    expect(mocks.audit.log).toHaveBeenCalledWith(
      PROFILE_ID,
      'verification.identity.failed',
      'client_profile',
      PROFILE_ID,
      { session_id: 'vs_failed_1', reason: 'document_unverified_other' },
    );
    expect(mocks.mail.sendVerificationFailed).toHaveBeenCalledWith(
      'mike@example.com',
      'Mike',
      'document_unverified_other',
    );
    expect(mocks.prisma.verificationMilestone.create).not.toHaveBeenCalled();
    expect(mocks.engine.runPromotion).not.toHaveBeenCalled();
  });

  test('reason falls back to "unknown" when last_error missing', async () => {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      display_name: 'Mike',
      account: { email: 'mike@example.com' },
    } as never);
    await service.handleWebhookEvent({
      type: 'identity.verification_session.requires_input',
      data: {
        object: {
          id: 'vs_x',
          metadata: { account_id: PROFILE_ID.toString() },
        },
      },
    } as unknown as Stripe.Event);
    expect(mocks.audit.log).toHaveBeenCalledWith(
      PROFILE_ID,
      'verification.identity.failed',
      'client_profile',
      PROFILE_ID,
      expect.objectContaining({ reason: 'unknown' }),
    );
  });
});

describe('TEST-VER-146 webhook missing metadata.account_id', () => {
  test('logs warning, returns silently, writes nothing', async () => {
    const { service, mocks } = build();
    await service.handleWebhookEvent({
      type: 'identity.verification_session.verified',
      data: { object: { id: 'vs_x', metadata: {} } },
    } as unknown as Stripe.Event);
    expect(mocks.prisma.verificationMilestone.create).not.toHaveBeenCalled();
    expect(mocks.audit.log).not.toHaveBeenCalled();
  });

  test('events outside our allow-list are ignored', async () => {
    const { service, mocks } = build();
    await service.handleWebhookEvent({
      type: 'identity.verification_session.processing',
      data: { object: { id: 'vs_x', metadata: {} } },
    } as unknown as Stripe.Event);
    expect(mocks.prisma.verificationMilestone.create).not.toHaveBeenCalled();
  });
});

describe('TEST-VER-147 webhook mail fire-and-forget', () => {
  test('mail rejection is swallowed (handler still completes)', async () => {
    const { service, mocks } = build();
    // Attach a `.catch` onto the rejection so Node doesn't surface it as
    // an unhandled rejection in test output. The production code uses
    // `void this.mail.sendVerificationVerified(...)` which has the same
    // effect — the test asserts the handler's await chain doesn't include
    // the mail promise, not that production wires its own error handler.
    const rejection = Promise.reject(new Error('SMTP down'));
    rejection.catch(() => undefined);
    mocks.mail.sendVerificationVerified.mockReturnValueOnce(rejection);
    mocks.prisma.verificationMilestone.findFirst.mockResolvedValueOnce(null as never);
    mocks.prisma.verificationMilestone.create.mockResolvedValueOnce({
      id: 1n,
    } as never);
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      display_name: 'Mike',
      account: { email: 'mike@example.com' },
    } as never);

    await expect(
      service.handleWebhookEvent({
        type: 'identity.verification_session.verified',
        data: {
          object: {
            id: 'vs_x',
            metadata: { account_id: PROFILE_ID.toString() },
          },
        },
      } as unknown as Stripe.Event),
    ).resolves.toBeUndefined();
  });
});

describe('TEST-VER-148 getIdentityStatus — VER-027', () => {
  test('user never started a session → returns nulls without calling Stripe', async () => {
    const { service, mocks } = build();
    mocks.prisma.auditLog.findFirst.mockResolvedValueOnce(null as never);
    const result = await service.getIdentityStatus(PROFILE_ID);
    expect(result).toEqual({ session_id: null, status: null });
    expect(mocks.stripe.identity.verificationSessions.retrieve).not.toHaveBeenCalled();
  });

  test('Stripe missing → returns nulls without calling Stripe', async () => {
    const { service, mocks } = build({ stripeConfigured: false });
    const result = await service.getIdentityStatus(PROFILE_ID);
    expect(result).toEqual({ session_id: null, status: null });
    expect(mocks.prisma.auditLog.findFirst).not.toHaveBeenCalled();
  });

  test('audit row exists → fetches Stripe session and returns live status', async () => {
    const { service, mocks } = build();
    mocks.prisma.auditLog.findFirst.mockResolvedValueOnce({
      metadata: { session_id: 'vs_test_123' },
    } as never);
    mocks.stripe.identity.verificationSessions.retrieve.mockResolvedValueOnce({
      id: 'vs_test_123',
      status: 'processing',
    });

    const result = await service.getIdentityStatus(PROFILE_ID);
    expect(result).toEqual({ session_id: 'vs_test_123', status: 'processing' });
    expect(
      mocks.stripe.identity.verificationSessions.retrieve,
    ).toHaveBeenCalledWith('vs_test_123');
  });
});

// ─── Reads ────────────────────────────────────────────────────────

describe('TEST-VER-150 getMe — VER-053', () => {
  test('profile not found → 404 PROFILE_NOT_FOUND', async () => {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce(null as never);
    mocks.prisma.verificationMilestone.findMany.mockResolvedValueOnce([] as never);
    mocks.prisma.document.findMany.mockResolvedValueOnce([] as never);

    const err = await service.getMe(PROFILE_ID).catch((e: NotFoundException) => e);
    expect(err).toBeInstanceOf(NotFoundException);
  });

  test('returns grouped documents shape + level + next_action', async () => {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'UNVERIFIED',
      worker_profile: { id: PROFILE_ID },
      employer_profile: null,
    } as never);
    mocks.prisma.verificationMilestone.findMany.mockResolvedValueOnce([] as never);
    mocks.prisma.document.findMany.mockResolvedValueOnce([
      { id: 1n, doc_type: 'CSCS_CARD', status: 'PENDING' },
      { id: 2n, doc_type: 'CSCS_CARD', status: 'IN_REVIEW' },
      { id: 3n, doc_type: 'CSCS_CARD', status: 'APPROVED' },
      { id: 4n, doc_type: 'CSCS_CARD', status: 'REJECTED' },
    ] as never);

    const result = await service.getMe(PROFILE_ID);
    expect(result.verification_level).toBe('UNVERIFIED');
    expect(result.documents.pending).toHaveLength(1);
    expect(result.documents.in_review).toHaveLength(1);
    expect(result.documents.approved).toHaveLength(1);
    expect(result.documents.rejected).toHaveLength(1);
    expect(result.next_action).toEqual({
      rung: 'BASIC',
      label: 'Verify your identity',
    });
  });

  test('CERTIFIED → next_action is null', async () => {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'CERTIFIED',
      worker_profile: { id: PROFILE_ID },
      employer_profile: null,
    } as never);
    mocks.prisma.verificationMilestone.findMany.mockResolvedValueOnce([] as never);
    mocks.prisma.document.findMany.mockResolvedValueOnce([] as never);

    const result = await service.getMe(PROFILE_ID);
    expect(result.next_action).toBeNull();
  });
});

describe('TEST-VER-151 getPublicLevel — VER-060', () => {
  function deactivatedProfile() {
    return {
      id: PROFILE_ID,
      verification_level: 'BASIC',
      account: { status: 'DEACTIVATED', updated_at: new Date() },
      worker_profile: { rating_avg: '0', rating_count: 0 },
      employer_profile: null,
    };
  }

  test('deactivated account → 404 NOT_FOUND', async () => {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce(
      deactivatedProfile() as never,
    );
    const err = await service
      .getPublicLevel(PROFILE_ID)
      .catch((e: NotFoundException) => e);
    expect(err).toBeInstanceOf(NotFoundException);
  });

  test('flags map 1:1 to milestones; certification_doc_types deduplicated', async () => {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'CERTIFIED',
      account: { status: 'ACTIVE', updated_at: new Date() },
      worker_profile: { rating_avg: '4.5', rating_count: 8 },
      employer_profile: null,
    } as never);
    mocks.prisma.verificationMilestone.findMany.mockResolvedValueOnce([
      { milestone_type: 'IDENTITY_VERIFIED', evidence_ref: null },
      { milestone_type: 'CERTIFICATION_APPROVED', evidence_ref: '101' },
      { milestone_type: 'CERTIFICATION_APPROVED', evidence_ref: '102' },
    ] as never);
    mocks.prisma.document.findMany.mockResolvedValueOnce([
      { doc_type: 'CSCS_CARD' },
      { doc_type: 'CSCS_CARD' },
    ] as never);

    const result = await service.getPublicLevel(PROFILE_ID);
    expect(result.flags.identity_verified).toBe(true);
    expect(result.flags.insurance_approved).toBe(false);
    expect(result.flags.certification_doc_types).toEqual(['CSCS_CARD']);
    expect(result.reviews.count).toBe(8);
    expect(result.reviews.average).toBe('4.5');
  });

  test('falls back to employer_profile reviews when worker_profile is null', async () => {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'BASIC',
      account: { status: 'ACTIVE', updated_at: new Date() },
      worker_profile: null,
      employer_profile: { rating_avg: '4.0', rating_count: 3 },
    } as never);
    mocks.prisma.verificationMilestone.findMany.mockResolvedValueOnce([] as never);

    const result = await service.getPublicLevel(PROFILE_ID);
    expect(result.reviews).toEqual({ count: 3, average: '4.0' });
  });
});

describe('TEST-VER-152 getPublicLevel does not leak internals', () => {
  test('response carries no doc IDs, milestone IDs, staff IDs, or metadata', async () => {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'BASIC',
      account: { status: 'ACTIVE', updated_at: new Date() },
      worker_profile: { rating_avg: '0', rating_count: 0 },
      employer_profile: null,
    } as never);
    mocks.prisma.verificationMilestone.findMany.mockResolvedValueOnce([
      { milestone_type: 'IDENTITY_VERIFIED', evidence_ref: 'vs_secret' },
    ] as never);
    mocks.prisma.document.findMany.mockResolvedValueOnce([] as never);

    const result = await service.getPublicLevel(PROFILE_ID);
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('vs_secret');
    expect(serialised).not.toContain('staff_member_id');
    expect(serialised).not.toContain('"metadata"');
    expect(serialised).not.toMatch(/"id":/);
  });
});

describe('TEST-VER-153 getLadder ownership — VER-061', () => {
  test('non-staff non-owner → 403 FORBIDDEN', async () => {
    const { service } = build();
    const err = await service
      .getLadder(PROFILE_ID, { clientProfileId: 999n, isStaff: false })
      .catch((e: ForbiddenException) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(((err as ForbiddenException).getResponse() as { code: string }).code).toBe(
      'FORBIDDEN',
    );
  });

  test('owner → succeeds', async () => {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'UNVERIFIED',
      worker_profile: { id: PROFILE_ID },
      employer_profile: null,
    } as never);
    mocks.prisma.verificationMilestone.findMany.mockResolvedValueOnce([] as never);
    mocks.prisma.document.findMany.mockResolvedValueOnce([] as never);

    const result = await service.getLadder(PROFILE_ID, {
      clientProfileId: PROFILE_ID,
      isStaff: false,
    });
    expect(result.current_level).toBe('UNVERIFIED');
    expect(result.rungs).toHaveLength(4);
  });

  test('staff → succeeds for any profile', async () => {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: 'BASIC',
      worker_profile: { id: PROFILE_ID },
      employer_profile: null,
    } as never);
    mocks.prisma.verificationMilestone.findMany.mockResolvedValueOnce([
      { milestone_type: 'IDENTITY_VERIFIED', achieved_at: new Date() },
    ] as never);
    mocks.prisma.document.findMany.mockResolvedValueOnce([] as never);

    const result = await service.getLadder(PROFILE_ID, {
      clientProfileId: 999n,
      isStaff: true,
    });
    expect(result.current_level).toBe('BASIC');
  });
});

describe('TEST-VER-154 computeLadder truth table — VER-061', () => {
  async function ladder(args: {
    level: 'UNVERIFIED' | 'BASIC' | 'CERTIFIED' | 'PREMIUM';
    isWorker: boolean;
    milestones: Array<{ milestone_type: string; achieved_at: Date }>;
    documents: Array<{ doc_type: string; status: string }>;
  }) {
    const { service, mocks } = build();
    mocks.prisma.clientProfile.findUnique.mockResolvedValueOnce({
      id: PROFILE_ID,
      verification_level: args.level,
      worker_profile: args.isWorker ? { id: PROFILE_ID } : null,
      employer_profile: args.isWorker ? null : { id: PROFILE_ID },
    } as never);
    mocks.prisma.verificationMilestone.findMany.mockResolvedValueOnce(
      args.milestones as never,
    );
    mocks.prisma.document.findMany.mockResolvedValueOnce(
      args.documents as never,
    );
    return service.getLadder(PROFILE_ID, {
      clientProfileId: PROFILE_ID,
      isStaff: false,
    });
  }

  test('UNVERIFIED rung is always DONE', async () => {
    const result = await ladder({
      level: 'UNVERIFIED',
      isWorker: true,
      milestones: [],
      documents: [],
    });
    expect(result.rungs[0]).toMatchObject({ level: 'UNVERIFIED', state: 'DONE' });
  });

  test('BASIC rung DONE when identity present', async () => {
    const result = await ladder({
      level: 'BASIC',
      isWorker: true,
      milestones: [{ milestone_type: 'IDENTITY_VERIFIED', achieved_at: new Date() }],
      documents: [],
    });
    expect(result.rungs[1]).toMatchObject({ level: 'BASIC', state: 'DONE' });
  });

  test('BASIC rung NOT_STARTED with copy when no identity', async () => {
    const result = await ladder({
      level: 'UNVERIFIED',
      isWorker: true,
      milestones: [],
      documents: [],
    });
    expect(result.rungs[1]).toMatchObject({
      level: 'BASIC',
      state: 'NOT_STARTED',
      estimated_time: 'Usually takes 2–5 minutes',
    });
  });

  test('CERTIFIED rung worker — pending cert → IN_PROGRESS', async () => {
    const result = await ladder({
      level: 'BASIC',
      isWorker: true,
      milestones: [{ milestone_type: 'IDENTITY_VERIFIED', achieved_at: new Date() }],
      documents: [{ doc_type: 'CSCS_CARD', status: 'PENDING' }],
    });
    expect(result.rungs[2]).toMatchObject({
      level: 'CERTIFIED',
      state: 'IN_PROGRESS',
    });
  });

  test('CERTIFIED rung worker — approved cert → DONE', async () => {
    const result = await ladder({
      level: 'CERTIFIED',
      isWorker: true,
      milestones: [{ milestone_type: 'IDENTITY_VERIFIED', achieved_at: new Date() }],
      documents: [{ doc_type: 'CSCS_CARD', status: 'APPROVED' }],
    });
    expect(result.rungs[2]).toMatchObject({ state: 'DONE' });
  });

  test('CERTIFIED rung worker — NOT_STARTED carries next_doc_types', async () => {
    const result = await ladder({
      level: 'BASIC',
      isWorker: true,
      milestones: [{ milestone_type: 'IDENTITY_VERIFIED', achieved_at: new Date() }],
      documents: [],
    });
    expect(result.rungs[2]).toMatchObject({
      state: 'NOT_STARTED',
      next_doc_types: ['CSCS_CARD', 'GAS_SAFE_CERT', 'NICEIC_CERT', 'FIRAS_CERT'],
    });
  });

  test('CERTIFIED rung employer — needs INSURANCE + COMPANY_LETTERHEAD approved', async () => {
    const result = await ladder({
      level: 'CERTIFIED',
      isWorker: false,
      milestones: [{ milestone_type: 'IDENTITY_VERIFIED', achieved_at: new Date() }],
      documents: [
        { doc_type: 'INSURANCE', status: 'APPROVED' },
        { doc_type: 'COMPANY_LETTERHEAD', status: 'APPROVED' },
      ],
    });
    expect(result.rungs[2]).toMatchObject({ state: 'DONE' });
  });

  test('PREMIUM rung is always COMING_SOON', async () => {
    const result = await ladder({
      level: 'CERTIFIED',
      isWorker: true,
      milestones: [{ milestone_type: 'IDENTITY_VERIFIED', achieved_at: new Date() }],
      documents: [{ doc_type: 'CSCS_CARD', status: 'APPROVED' }],
    });
    expect(result.rungs[3]).toMatchObject({
      level: 'PREMIUM',
      state: 'COMING_SOON',
    });
  });
});
