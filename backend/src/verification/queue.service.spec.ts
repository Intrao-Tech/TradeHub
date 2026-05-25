// TEST-VER-160..164 — QueueService unit specs.
//
// Visibility scoping, status filter parsing, sort/pagination, response
// shape, getOne with history. Prisma deep-mocked.

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { QueueService } from './queue.service';
import { PrismaService } from '../prisma/prisma.service';

const SELF_STAFF = 7n;
const DOC_ID = 200n;

function build(): {
  service: QueueService;
  prisma: DeepMockProxy<PrismaService>;
} {
  const prisma = mockDeep<PrismaService>();
  const service = new QueueService(prisma);
  // Default: empty list / count.
  prisma.document.findMany.mockResolvedValue([] as never);
  prisma.document.count.mockResolvedValue(0 as never);
  return { service, prisma };
}

function captureWhere(
  prisma: DeepMockProxy<PrismaService>,
): Record<string, unknown> {
  const calls = prisma.document.findMany.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return (calls[calls.length - 1][0] as { where: Record<string, unknown> })
    .where;
}

describe('TEST-VER-160 QueueService.list() default scoping — VER-130', () => {
  test('moderator with no assignment → assigned_to = self', async () => {
    const { service, prisma } = build();
    await service.list({ staffMemberId: SELF_STAFF, isAdmin: false }, {});
    expect(captureWhere(prisma)).toMatchObject({
      assigned_to: SELF_STAFF,
    });
  });

  test('admin with no assignment → no assigned_to filter', async () => {
    const { service, prisma } = build();
    await service.list({ staffMemberId: SELF_STAFF, isAdmin: true }, {});
    const where = captureWhere(prisma);
    expect(where).not.toHaveProperty('assigned_to');
  });

  test('moderator passing assignment=all → 403 FORBIDDEN', async () => {
    const { service } = build();
    const err = await service
      .list(
        { staffMemberId: SELF_STAFF, isAdmin: false },
        { assignment: 'all' },
      )
      .catch((e: ForbiddenException) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(
      ((err as ForbiddenException).getResponse() as { code: string }).code,
    ).toBe('FORBIDDEN');
  });

  test('assignment=unassigned → assigned_to: null', async () => {
    const { service, prisma } = build();
    await service.list(
      { staffMemberId: SELF_STAFF, isAdmin: true },
      { assignment: 'unassigned' },
    );
    expect(captureWhere(prisma)).toMatchObject({ assigned_to: null });
  });
});

describe('TEST-VER-161 QueueService.list() status filter — VER-131', () => {
  test('default status → PENDING + IN_REVIEW', async () => {
    const { service, prisma } = build();
    await service.list({ staffMemberId: SELF_STAFF, isAdmin: true }, {});
    const where = captureWhere(prisma);
    expect(where.status).toEqual({ in: ['PENDING', 'IN_REVIEW'] });
  });

  test('status=APPROVED → only APPROVED', async () => {
    const { service, prisma } = build();
    await service.list(
      { staffMemberId: SELF_STAFF, isAdmin: true },
      { status: 'APPROVED' },
    );
    expect(captureWhere(prisma).status).toEqual({ in: ['APPROVED'] });
  });

  test('status=PENDING,IN_REVIEW,APPROVED → those three', async () => {
    const { service, prisma } = build();
    await service.list(
      { staffMemberId: SELF_STAFF, isAdmin: true },
      { status: 'PENDING,IN_REVIEW,APPROVED' },
    );
    expect(captureWhere(prisma).status).toEqual({
      in: ['PENDING', 'IN_REVIEW', 'APPROVED'],
    });
  });

  test('status=FOO (invalid) → no status filter', async () => {
    const { service, prisma } = build();
    await service.list(
      { staffMemberId: SELF_STAFF, isAdmin: true },
      { status: 'FOO' },
    );
    expect(captureWhere(prisma)).not.toHaveProperty('status');
  });
});

describe('TEST-VER-162 QueueService.list() sort + pagination — VER-070', () => {
  test('default orderBy created_at asc (oldest-first fairness)', async () => {
    const { service, prisma } = build();
    await service.list({ staffMemberId: SELF_STAFF, isAdmin: true }, {});
    const args = prisma.document.findMany.mock.calls[0][0] as {
      orderBy: { created_at: string };
      skip: number;
      take: number;
    };
    expect(args.orderBy).toEqual({ created_at: 'asc' });
    expect(args.skip).toBe(0);
    expect(args.take).toBe(20);
  });

  test('page=2 limit=10 → skip=10 take=10', async () => {
    const { service, prisma } = build();
    await service.list(
      { staffMemberId: SELF_STAFF, isAdmin: true },
      { page: 2, limit: 10 },
    );
    const args = prisma.document.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
  });

  test('total reflects unscoped count call (no skip/take applied)', async () => {
    const { service, prisma } = build();
    prisma.document.count.mockResolvedValueOnce(42 as never);
    const result = await service.list(
      { staffMemberId: SELF_STAFF, isAdmin: true },
      { page: 2, limit: 10 },
    );
    expect(result.total).toBe(42);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });
});

describe('TEST-VER-163 QueueService.list() response shape', () => {
  test('items[].uploader.role reflects sub-profile presence', async () => {
    const { service, prisma } = build();
    prisma.document.findMany.mockResolvedValueOnce([
      {
        id: 1n,
        doc_type: 'CSCS_CARD',
        file_url: '/x.pdf',
        status: 'PENDING',
        rejection_reason: null,
        metadata: null,
        created_at: new Date(),
        reviewed_at: null,
        reviewed_by: null,
        client_profile: {
          id: 100n,
          display_name: 'Worker',
          worker_profile: { id: 100n },
          employer_profile: null,
        },
        assignee: null,
      },
      {
        id: 2n,
        doc_type: 'INSURANCE',
        file_url: '/y.pdf',
        status: 'PENDING',
        rejection_reason: null,
        metadata: null,
        created_at: new Date(),
        reviewed_at: null,
        reviewed_by: null,
        client_profile: {
          id: 200n,
          display_name: 'Employer',
          worker_profile: null,
          employer_profile: { id: 200n },
        },
        assignee: { id: 7n, display_name: 'Mod' },
      },
      {
        id: 3n,
        doc_type: 'OTHER',
        file_url: '/z.pdf',
        status: 'PENDING',
        rejection_reason: null,
        metadata: null,
        created_at: new Date(),
        reviewed_at: null,
        reviewed_by: null,
        client_profile: {
          id: 300n,
          display_name: 'Mystery',
          worker_profile: null,
          employer_profile: null,
        },
        assignee: null,
      },
    ] as never);
    prisma.document.count.mockResolvedValueOnce(3 as never);

    const result = await service.list(
      { staffMemberId: SELF_STAFF, isAdmin: true },
      {},
    );
    expect(result.items[0].uploader.role).toBe('WORKER');
    expect(result.items[1].uploader.role).toBe('EMPLOYER');
    expect(result.items[2].uploader.role).toBe('UNKNOWN');
    expect(result.items[0].assignee).toBeNull();
    expect(result.items[1].assignee).toEqual({ id: '7', display_name: 'Mod' });
    expect(result.items[0].document.id).toBe('1');
    expect(typeof result.items[0].document.id).toBe('string');
  });
});

describe('TEST-VER-164 QueueService.getOne() — VER-074', () => {
  test('doc not found → 404 DOCUMENT_NOT_FOUND', async () => {
    const { service, prisma } = build();
    prisma.document.findUnique.mockResolvedValueOnce(null as never);
    const err = await service.getOne(DOC_ID).catch((e: NotFoundException) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect(
      ((err as NotFoundException).getResponse() as { code: string }).code,
    ).toBe('DOCUMENT_NOT_FOUND');
  });

  test('returns uploader.verification_level + history excluding self', async () => {
    const { service, prisma } = build();
    prisma.document.findUnique.mockResolvedValueOnce({
      id: DOC_ID,
      client_profile_id: 100n,
      doc_type: 'CSCS_CARD',
      file_url: '/x.pdf',
      status: 'PENDING',
      rejection_reason: null,
      metadata: null,
      assigned_to: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: new Date(),
      client_profile: {
        id: 100n,
        display_name: 'Worker',
        verification_level: 'BASIC',
        worker_profile: { id: 100n },
        employer_profile: null,
      },
      assignee: null,
      reviewer: null,
    } as never);
    prisma.document.findMany.mockResolvedValueOnce([
      {
        id: 50n,
        status: 'REJECTED',
        rejection_reason: 'old reason',
        created_at: new Date(),
        reviewed_at: new Date(),
      },
    ] as never);

    const result = await service.getOne(DOC_ID);
    expect(result.uploader.verification_level).toBe('BASIC');
    expect(result.history).toHaveLength(1);
    expect(result.history[0]).toEqual({
      id: '50',
      status: 'REJECTED',
      rejection_reason: 'old reason',
      created_at: expect.any(Date),
      reviewed_at: expect.any(Date),
    });
    // History row must NOT carry metadata or file_url (per spec).
    expect(result.history[0]).not.toHaveProperty('metadata');
    expect(result.history[0]).not.toHaveProperty('file_url');

    // Ensure the history query excludes self:
    const args = prisma.document.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: { created_at: string };
    };
    expect(args.where).toMatchObject({
      client_profile_id: 100n,
      doc_type: 'CSCS_CARD',
      id: { not: DOC_ID },
    });
    expect(args.orderBy).toEqual({ created_at: 'asc' });
  });
});
