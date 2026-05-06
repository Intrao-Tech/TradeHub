// TEST-COLLAB-010..014 — CollaborationService unit specs.
//
// Pure-logic tests with deep-mocked Prisma. Each test cites the COLLAB-NNN
// clause from `tasks/done/collaborations-polish/spec.md` it guards. Scope:
// the service-layer state-machine + access-control contract — controllers
// are exercised by the e2e suite.

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { CollaborationService } from './collaboration.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

function build(): {
  service: CollaborationService;
  prisma: DeepMockProxy<PrismaService>;
} {
  const prisma = mockDeep<PrismaService>();
  const service = new CollaborationService(prisma);
  return { service, prisma };
}

const WORKER_ID = 11n;
const EMPLOYER_ID = 22n;
const OUTSIDER_ID = 99n;

function userPayload(
  overrides: Partial<CurrentUserPayload> = {},
): CurrentUserPayload {
  return {
    accountId: overrides.accountId ?? WORKER_ID,
    email: 'tester@example.com',
    clientProfileId:
      'clientProfileId' in overrides
        ? (overrides.clientProfileId as bigint | null)
        : WORKER_ID,
    isWorker: overrides.isWorker ?? true,
    isEmployer: overrides.isEmployer ?? false,
    isStaff: overrides.isStaff ?? false,
    staffRole: overrides.staffRole ?? null,
    verificationState: overrides.verificationState ?? 'ACTIVE',
  };
}

function fakeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1n,
    worker_id: WORKER_ID,
    employer_id: EMPLOYER_ID,
    initiated_by: 'EMPLOYER',
    referral_id: null,
    job_post_id: null,
    status: 'PENDING',
    project_type: null,
    site_postcode: null,
    agreed_amount: null,
    started_at: null,
    ended_at: null,
    flagged: false,
    flag_reason: null,
    confirmed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-010 — create() role resolution (COLLAB-030, parent spec)
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-010 CollaborationService.create() — COLLAB-030 role resolution', () => {
  test('TEST-COLLAB-010 / COLLAB-030 — worker initiates with employer_id only → uses caller as worker', async () => {
    const { service, prisma } = build();
    prisma.collaboration.create.mockResolvedValue(fakeRow() as never);

    await service.create(
      { employer_id: Number(EMPLOYER_ID), agreed_amount: 1500.5 },
      'WORKER',
      WORKER_ID,
    );

    const args = prisma.collaboration.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.worker_id).toBe(WORKER_ID);
    expect(args.data.employer_id).toBe(BigInt(Number(EMPLOYER_ID)));
    expect(args.data.initiated_by).toBe('WORKER');
    expect((args.data.agreed_amount as Prisma.Decimal).toString()).toBe(
      '1500.5',
    );
  });

  test('TEST-COLLAB-010 / COLLAB-030 — employer initiates with worker_id only → mirror', async () => {
    const { service, prisma } = build();
    prisma.collaboration.create.mockResolvedValue(fakeRow() as never);

    await service.create(
      { worker_id: Number(WORKER_ID) },
      'EMPLOYER',
      EMPLOYER_ID,
    );

    const args = prisma.collaboration.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.worker_id).toBe(BigInt(Number(WORKER_ID)));
    expect(args.data.employer_id).toBe(EMPLOYER_ID);
    expect(args.data.initiated_by).toBe('EMPLOYER');
  });

  test('TEST-COLLAB-010 / COLLAB-030 — worker passes worker_id alongside employer_id → BadRequestException', async () => {
    const { service } = build();
    await expect(
      service.create(
        { worker_id: 5, employer_id: Number(EMPLOYER_ID) },
        'WORKER',
        WORKER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('TEST-COLLAB-010 / COLLAB-030 — employer passes employer_id alongside worker_id → BadRequestException', async () => {
    const { service } = build();
    await expect(
      service.create(
        { worker_id: Number(WORKER_ID), employer_id: 5 },
        'EMPLOYER',
        EMPLOYER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('TEST-COLLAB-010 / COLLAB-030 — worker omits employer_id → BadRequestException', async () => {
    const { service } = build();
    await expect(service.create({}, 'WORKER', WORKER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  test('TEST-COLLAB-010 / COLLAB-030 — employer omits worker_id → BadRequestException', async () => {
    const { service } = build();
    await expect(service.create({}, 'EMPLOYER', EMPLOYER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  test('TEST-COLLAB-010 / COLLAB-030 — worker_id === employer_id → BadRequestException', async () => {
    const { service } = build();
    await expect(
      // worker initiates, but the employer_id resolves to the same as the caller
      service.create(
        { employer_id: Number(WORKER_ID) },
        'WORKER',
        WORKER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('TEST-COLLAB-010 / COLLAB-030 — referral_id is cast to BigInt; agreed_amount round-trips as Decimal', async () => {
    const { service, prisma } = build();
    prisma.collaboration.create.mockResolvedValue(fakeRow() as never);

    await service.create(
      {
        employer_id: Number(EMPLOYER_ID),
        agreed_amount: 99.99,
        referral_id: 4242,
      },
      'WORKER',
      WORKER_ID,
    );

    const args = prisma.collaboration.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.referral_id).toBe(4242n);
    expect((args.data.agreed_amount as Prisma.Decimal).toString()).toBe(
      '99.99',
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-011 — getByIdForUser() access control
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-011 CollaborationService.getByIdForUser() — access control', () => {
  test('TEST-COLLAB-011 — worker party reads → returns row', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeRow() as never);
    await expect(service.getByIdForUser(1n, userPayload())).resolves.toBeDefined();
  });

  test('TEST-COLLAB-011 — employer party reads → returns row', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeRow() as never);
    await expect(
      service.getByIdForUser(
        1n,
        userPayload({ clientProfileId: EMPLOYER_ID, isWorker: false, isEmployer: true }),
      ),
    ).resolves.toBeDefined();
  });

  test('TEST-COLLAB-011 — non-party non-staff → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeRow() as never);
    await expect(
      service.getByIdForUser(
        1n,
        userPayload({ clientProfileId: OUTSIDER_ID }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('TEST-COLLAB-011 — staff reads regardless of party membership', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeRow() as never);
    await expect(
      service.getByIdForUser(
        1n,
        userPayload({ clientProfileId: null, isStaff: true, isWorker: false }),
      ),
    ).resolves.toBeDefined();
  });

  test('TEST-COLLAB-011 — non-staff with no clientProfileId → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeRow() as never);
    await expect(
      service.getByIdForUser(
        1n,
        userPayload({ clientProfileId: null, isWorker: false, isEmployer: false }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('TEST-COLLAB-011 — missing collaboration → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(null);
    await expect(service.getByIdForUser(1n, userPayload())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-012 — updateStatus() legality matrix (COLLAB-021)
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-012 CollaborationService.updateStatus() — COLLAB-021 legality matrix', () => {
  // The service hits `findUnique` twice on the happy path:
  //   1. to load the row + run the legality checks
  //   2. via `getById()` to return the include-shaped row after the update
  // Each test sets the first response (current state) and a stub for the
  // second.

  function setupRow(prisma: DeepMockProxy<PrismaService>, overrides = {}) {
    const row = fakeRow(overrides);
    prisma.collaboration.findUnique
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce(row as never);
    prisma.collaboration.update.mockResolvedValue(row as never);
    return row;
  }

  test('TEST-COLLAB-012 / COLLAB-021 — PENDING → CONFIRMED by responder sets confirmed_at', async () => {
    const { service, prisma } = build();
    setupRow(prisma, { initiated_by: 'WORKER' });
    // worker initiated → employer is responder
    await service.updateStatus(1n, 'CONFIRMED', EMPLOYER_ID);
    const update = prisma.collaboration.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(update.data.status).toBe('CONFIRMED');
    expect(update.data.confirmed_at).toBeInstanceOf(Date);
  });

  test('TEST-COLLAB-012 / COLLAB-021 — PENDING → CONFIRMED by initiator → ForbiddenException (privilege check)', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(
      fakeRow({ initiated_by: 'WORKER' }) as never,
    );
    await expect(
      service.updateStatus(1n, 'CONFIRMED', WORKER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('TEST-COLLAB-012 / COLLAB-021 — PENDING → REJECTED by responder', async () => {
    const { service, prisma } = build();
    setupRow(prisma, { initiated_by: 'WORKER' });
    await service.updateStatus(1n, 'REJECTED', EMPLOYER_ID);
    const update = prisma.collaboration.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(update.data.status).toBe('REJECTED');
  });

  test('TEST-COLLAB-012 / COLLAB-021 — PENDING → REJECTED by initiator → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(
      fakeRow({ initiated_by: 'WORKER' }) as never,
    );
    await expect(
      service.updateStatus(1n, 'REJECTED', WORKER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('TEST-COLLAB-012 / COLLAB-021 — CONFIRMED → IN_PROGRESS by either party sets started_at', async () => {
    const { service, prisma } = build();
    setupRow(prisma, { status: 'CONFIRMED' });
    // initiator can also start (either-party rule)
    await service.updateStatus(1n, 'IN_PROGRESS', WORKER_ID);
    const update = prisma.collaboration.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(update.data.status).toBe('IN_PROGRESS');
    expect(update.data.started_at).toBeInstanceOf(Date);
  });

  test('TEST-COLLAB-012 / COLLAB-021 — IN_PROGRESS → COMPLETED by either party sets ended_at', async () => {
    const { service, prisma } = build();
    setupRow(prisma, { status: 'IN_PROGRESS' });
    await service.updateStatus(1n, 'COMPLETED', EMPLOYER_ID);
    const update = prisma.collaboration.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(update.data.status).toBe('COMPLETED');
    expect(update.data.ended_at).toBeInstanceOf(Date);
  });

  test.each(['PENDING', 'CONFIRMED', 'IN_PROGRESS'])(
    'TEST-COLLAB-012 / COLLAB-021 — %s → DISPUTED by either party flags row',
    async (current) => {
      const { service, prisma } = build();
      setupRow(prisma, { status: current });
      await service.updateStatus(1n, 'DISPUTED', WORKER_ID);
      const update = prisma.collaboration.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(update.data.status).toBe('DISPUTED');
      expect(update.data.flagged).toBe(true);
    },
  );

  test('TEST-COLLAB-012 / COLLAB-021 — same-status transition → BadRequestException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(
      fakeRow({ status: 'CONFIRMED' }) as never,
    );
    await expect(
      service.updateStatus(1n, 'CONFIRMED', WORKER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('TEST-COLLAB-012 / COLLAB-021 — PENDING → IN_PROGRESS (skip) → BadRequestException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(
      fakeRow({ initiated_by: 'WORKER' }) as never,
    );
    await expect(
      service.updateStatus(1n, 'IN_PROGRESS', EMPLOYER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('TEST-COLLAB-012 / COLLAB-021 — COMPLETED → IN_PROGRESS (regression) → BadRequestException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(
      fakeRow({ status: 'COMPLETED' }) as never,
    );
    await expect(
      service.updateStatus(1n, 'IN_PROGRESS', WORKER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('TEST-COLLAB-012 / COLLAB-021 — REJECTED → CONFIRMED (revival) → BadRequestException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(
      fakeRow({ status: 'REJECTED', initiated_by: 'WORKER' }) as never,
    );
    await expect(
      service.updateStatus(1n, 'CONFIRMED', EMPLOYER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('TEST-COLLAB-012 / COLLAB-021 — non-party caller → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(fakeRow() as never);
    await expect(
      service.updateStatus(1n, 'CONFIRMED', OUTSIDER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('TEST-COLLAB-012 / COLLAB-021 — missing collaboration → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.updateStatus(1n, 'CONFIRMED', WORKER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-013 — flag()
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-013 CollaborationService.flag() — COLLAB-040 / COLLAB-051', () => {
  test('TEST-COLLAB-013 / COLLAB-042 — party flag persists reason verbatim', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique
      .mockResolvedValueOnce(fakeRow() as never)
      .mockResolvedValueOnce(fakeRow({ flagged: true, flag_reason: 'PAYMENT_LATE' }) as never);
    prisma.collaboration.update.mockResolvedValue(fakeRow() as never);

    await service.flag(1n, 'PAYMENT_LATE: cheque is two weeks late', userPayload());
    const update = prisma.collaboration.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(update.data.flagged).toBe(true);
    expect(update.data.flag_reason).toBe('PAYMENT_LATE: cheque is two weeks late');
  });

  test('TEST-COLLAB-013 / COLLAB-051 — staff can flag a non-party collaboration', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique
      .mockResolvedValueOnce(fakeRow() as never)
      .mockResolvedValueOnce(fakeRow() as never);
    prisma.collaboration.update.mockResolvedValue(fakeRow() as never);
    await service.flag(
      1n,
      'OTHER: investigating',
      userPayload({ clientProfileId: null, isStaff: true, isWorker: false }),
    );
    expect(prisma.collaboration.update).toHaveBeenCalled();
  });

  test('TEST-COLLAB-013 — non-party non-staff → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(fakeRow() as never);
    await expect(
      service.flag(
        1n,
        'WORK_QUALITY',
        userPayload({ clientProfileId: OUTSIDER_ID }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('TEST-COLLAB-013 — missing collaboration → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.flag(1n, 'PAYMENT_LATE', userPayload()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('TEST-COLLAB-013 — second flag overwrites flag_reason (no append) — locked behaviour', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique
      .mockResolvedValueOnce(fakeRow({ flagged: true, flag_reason: 'PAYMENT_LATE' }) as never)
      .mockResolvedValueOnce(fakeRow({ flagged: true, flag_reason: 'WORK_QUALITY' }) as never);
    prisma.collaboration.update.mockResolvedValue(fakeRow() as never);

    await service.flag(1n, 'WORK_QUALITY: subcontracted out', userPayload());
    const update = prisma.collaboration.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(update.data.flag_reason).toBe('WORK_QUALITY: subcontracted out');
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-COLLAB-014 — getByUser() filters and pagination
// ════════════════════════════════════════════════════════════════════

describe('TEST-COLLAB-014 CollaborationService.getByUser() — COLLAB-011 list', () => {
  test('TEST-COLLAB-014 — returns rows where caller is worker OR employer', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findMany.mockResolvedValue([] as never);
    prisma.collaboration.count.mockResolvedValue(0);

    await service.getByUser(WORKER_ID, {});
    const args = prisma.collaboration.findMany.mock.calls[0][0] as {
      where: {
        OR: Array<{ worker_id?: bigint; employer_id?: bigint }>;
      };
    };
    expect(args.where.OR).toEqual([
      { worker_id: WORKER_ID },
      { employer_id: WORKER_ID },
    ]);
  });

  test('TEST-COLLAB-014 — status filter narrows the where clause', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findMany.mockResolvedValue([] as never);
    prisma.collaboration.count.mockResolvedValue(0);

    await service.getByUser(WORKER_ID, { status: 'CONFIRMED' });
    const args = prisma.collaboration.findMany.mock.calls[0][0] as {
      where: { status?: string };
    };
    expect(args.where.status).toBe('CONFIRMED');
  });

  test('TEST-COLLAB-014 — defaults page=1 / limit=20 when omitted', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findMany.mockResolvedValue([] as never);
    prisma.collaboration.count.mockResolvedValue(0);

    const result = await service.getByUser(WORKER_ID, {});
    const args = prisma.collaboration.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(0);
    expect(args.take).toBe(20);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  test('TEST-COLLAB-014 — page/limit propagate to skip/take and round-trip on response', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findMany.mockResolvedValue([] as never);
    prisma.collaboration.count.mockResolvedValue(57);

    const result = await service.getByUser(WORKER_ID, { page: 3, limit: 5 });
    const args = prisma.collaboration.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(10);
    expect(args.take).toBe(5);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(5);
    expect(result.total).toBe(57);
  });
});
