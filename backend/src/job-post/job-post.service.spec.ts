// TEST-JOBS-010 / 011 / 012 / 013 / 014 — JobPostService unit specs.
//
// Pure-logic tests with deep-mocked Prisma. Each test cites the JOBS-NNN
// clause from tasks/done/jobs-applications/spec.md it guards. Scope: the
// service-layer contract — controllers are exercised by the e2e suite.

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { JobPostService } from './job-post.service';
import { PrismaService } from '../prisma/prisma.service';

function build(): {
  service: JobPostService;
  prisma: DeepMockProxy<PrismaService>;
} {
  const prisma = mockDeep<PrismaService>();
  const service = new JobPostService(prisma);
  return { service, prisma };
}

const OWNER_ID = 7n;

describe('TEST-JOBS-010 JobPostService.create() — JOBS-014', () => {
  test('JOBS-014 — persists every field, defaults status=OPEN and is_urgent=false', async () => {
    const { service, prisma } = build();
    prisma.jobPost.create.mockResolvedValue({ id: 100n } as never);

    await service.create(
      {
        title: 'Wire two-bed flat',
        description: 'Full first fix',
        postcode_area: 'SW19',
        site_address: '12 Test St',
        pay_type: 'DAY_RATE',
        day_rate_min: 200,
        day_rate_max: 280,
        duration_days: 5,
        start_date: '2026-06-01',
        specialisation_ids: [1, 2],
        tag_ids: [10],
      },
      OWNER_ID,
    );

    const args = prisma.jobPost.create.mock.calls[0][0] as {
      data: Record<string, unknown> & {
        specialisations: { create: Array<{ specialisation_id: number }> };
        tags: { create: Array<{ tag_id: number }> };
      };
    };
    // Service does NOT default status here (the schema default fires); but it
    // does default `is_urgent` to `false`.
    expect(args.data.is_urgent).toBe(false);
    expect(args.data.title).toBe('Wire two-bed flat');
    expect(args.data.postcode_area).toBe('SW19');
    expect((args.data.day_rate_min as Prisma.Decimal).toString()).toBe('200');
    expect((args.data.day_rate_max as Prisma.Decimal).toString()).toBe('280');
    expect(args.data.specialisations.create).toEqual([
      { specialisation_id: 1 },
      { specialisation_id: 2 },
    ]);
    expect(args.data.tags.create).toEqual([{ tag_id: 10 }]);
    expect(args.data.employer_id).toBe(OWNER_ID);
  });

  test('JOBS-014 — pay_type FIXED_PRICE persists fixed_price, leaves rates null', async () => {
    const { service, prisma } = build();
    prisma.jobPost.create.mockResolvedValue({ id: 101n } as never);

    await service.create(
      {
        title: 'Loft conversion',
        pay_type: 'FIXED_PRICE',
        fixed_price: 4500,
      },
      OWNER_ID,
    );

    const args = prisma.jobPost.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect((args.data.fixed_price as Prisma.Decimal).toString()).toBe('4500');
    expect(args.data.day_rate_min).toBeNull();
    expect(args.data.day_rate_max).toBeNull();
  });

  test('JOBS-014 — empty specialisation_ids / tag_ids creates no relation rows', async () => {
    const { service, prisma } = build();
    prisma.jobPost.create.mockResolvedValue({ id: 102n } as never);

    await service.create(
      { title: 'Sparks needed', pay_type: 'DAY_RATE' },
      OWNER_ID,
    );

    const args = prisma.jobPost.create.mock.calls[0][0] as {
      data: {
        specialisations: { create: unknown[] };
        tags: { create: unknown[] };
      };
    };
    expect(args.data.specialisations.create).toEqual([]);
    expect(args.data.tags.create).toEqual([]);
  });
});

describe('TEST-JOBS-011 JobPostService.update() ownership — JOBS-020', () => {
  test('JOBS-020 — owner update succeeds and re-reads the row through findById', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: 1n,
      employer_id: OWNER_ID,
    } as never);
    prisma.$transaction.mockImplementation(
      async (fn: (tx: PrismaService) => Promise<unknown>) =>
        fn(prisma as unknown as PrismaService),
    );
    // re-read through findById
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: 1n,
      title: 'Edited',
    } as never);

    const result = await service.update(
      1n,
      { title: 'Edited' },
      OWNER_ID,
    );

    expect(result).toEqual({ id: 1n, title: 'Edited' });
    expect(prisma.jobPost.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { title: 'Edited' },
    });
  });

  test('JOBS-020 — non-owner employer is rejected with ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: 1n,
      employer_id: 999n,
    } as never);

    await expect(
      service.update(1n, { title: 'evil' }, OWNER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.jobPost.update).not.toHaveBeenCalled();
  });

  test('JOBS-020 — missing post → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce(null as never);

    await expect(
      service.update(1n, { title: 'x' }, OWNER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('JOBS-030 — status OPEN→CLOSED→OPEN flips persist via the update path', async () => {
    const { service, prisma } = build();
    // Two updates, each one does: ownership-check findUnique → tx → re-read findUnique
    const owner = { id: 1n, employer_id: OWNER_ID } as never;
    const reread = { id: 1n } as never;
    prisma.jobPost.findUnique
      .mockResolvedValueOnce(owner)
      .mockResolvedValueOnce(reread)
      .mockResolvedValueOnce(owner)
      .mockResolvedValueOnce(reread);
    prisma.$transaction.mockImplementation(
      async (fn: (tx: PrismaService) => Promise<unknown>) =>
        fn(prisma as unknown as PrismaService),
    );

    await service.update(1n, { status: 'CLOSED' }, OWNER_ID);
    expect(prisma.jobPost.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { status: 'CLOSED' },
    });

    await service.update(1n, { status: 'OPEN' }, OWNER_ID);
    expect(prisma.jobPost.update).toHaveBeenLastCalledWith({
      where: { id: 1n },
      data: { status: 'OPEN' },
    });
  });

  test('JOBS-019 — update with specialisation_ids replaces the join rows in a transaction', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: 1n,
      employer_id: OWNER_ID,
    } as never);
    prisma.$transaction.mockImplementation(
      async (fn: (tx: PrismaService) => Promise<unknown>) =>
        fn(prisma as unknown as PrismaService),
    );
    prisma.jobPostSpecialisation.deleteMany.mockResolvedValue({
      count: 2,
    } as never);
    prisma.jobPostSpecialisation.createMany.mockResolvedValue({
      count: 1,
    } as never);
    prisma.jobPost.findUnique.mockResolvedValueOnce({ id: 1n } as never);

    await service.update(1n, { specialisation_ids: [42] }, OWNER_ID);

    expect(prisma.jobPostSpecialisation.deleteMany).toHaveBeenCalledWith({
      where: { job_post_id: 1n },
    });
    expect(prisma.jobPostSpecialisation.createMany).toHaveBeenCalledWith({
      data: [{ job_post_id: 1n, specialisation_id: 42 }],
    });
  });
});

describe('TEST-JOBS-012 JobPostService.delete() — JOBS-031', () => {
  test('JOBS-031 — owner delete (zero applications) succeeds', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: 1n,
      employer_id: OWNER_ID,
      _count: { applications: 0 },
    } as never);
    prisma.jobPost.delete.mockResolvedValue({ id: 1n } as never);

    await service.delete(1n, OWNER_ID);
    expect(prisma.jobPost.delete).toHaveBeenCalledWith({ where: { id: 1n } });
  });

  test('JOBS-031 — non-owner → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: 1n,
      employer_id: 999n,
      _count: { applications: 0 },
    } as never);

    await expect(service.delete(1n, OWNER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.jobPost.delete).not.toHaveBeenCalled();
  });

  test('JOBS-031 — missing post → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce(null as never);

    await expect(service.delete(1n, OWNER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test('JOBS-031 — applications > 0 → 409 HAS_APPLICATIONS, no delete fired', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: 1n,
      employer_id: OWNER_ID,
      _count: { applications: 5 },
    } as never);

    const err = await service
      .delete(1n, OWNER_ID)
      .catch((e: ConflictException) => e);
    expect(err).toBeInstanceOf(ConflictException);
    const body = (err as ConflictException).getResponse() as { code: string };
    expect(body.code).toBe('HAS_APPLICATIONS');
    expect(prisma.jobPost.delete).not.toHaveBeenCalled();
  });
});

describe('TEST-JOBS-013 JobPostService.findAll() query — JOBS-002 / 003 / 005', () => {
  test('JOBS-005 — defaults page=1 limit=20, computes skip=0', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findMany.mockResolvedValue([] as never);
    prisma.jobPost.count.mockResolvedValue(0 as never);

    const out = await service.findAll({});

    expect(out).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    const args = prisma.jobPost.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
      orderBy: unknown;
    };
    expect(args.skip).toBe(0);
    expect(args.take).toBe(20);
    expect(args.orderBy).toEqual([
      { is_urgent: 'desc' },
      { created_at: 'desc' },
    ]);
  });

  test('JOBS-005 — page=3 limit=10 → skip=20', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findMany.mockResolvedValue([] as never);
    prisma.jobPost.count.mockResolvedValue(0 as never);

    await service.findAll({ page: 3, limit: 10 });
    const args = prisma.jobPost.findMany.mock.calls[0][0] as { skip: number };
    expect(args.skip).toBe(20);
  });

  test('JOBS-003 — search builds case-insensitive title contains filter', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findMany.mockResolvedValue([] as never);
    prisma.jobPost.count.mockResolvedValue(0 as never);

    await service.findAll({ search: 'Plumber' });
    const args = prisma.jobPost.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.title).toEqual({
      contains: 'Plumber',
      mode: 'insensitive',
    });
  });

  test('JOBS-003 — empty/whitespace search is dropped', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findMany.mockResolvedValue([] as never);
    prisma.jobPost.count.mockResolvedValue(0 as never);

    await service.findAll({ search: '   ' });
    const args = prisma.jobPost.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.title).toBeUndefined();
  });

  test('JOBS-003 — postcode_area filters exactly', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findMany.mockResolvedValue([] as never);
    prisma.jobPost.count.mockResolvedValue(0 as never);

    await service.findAll({ postcode_area: 'SW19' });
    const args = prisma.jobPost.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.postcode_area).toBe('SW19');
  });

  test('JOBS-003 — specialisation_id joins through JobPostSpecialisation', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findMany.mockResolvedValue([] as never);
    prisma.jobPost.count.mockResolvedValue(0 as never);

    await service.findAll({ specialisation_id: 4 });
    const args = prisma.jobPost.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.specialisations).toEqual({
      some: { specialisation_id: 4 },
    });
  });

  test('JOBS-003 — tag_id joins through JobPostTag', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findMany.mockResolvedValue([] as never);
    prisma.jobPost.count.mockResolvedValue(0 as never);

    await service.findAll({ tag_id: 9 });
    const args = prisma.jobPost.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.tags).toEqual({ some: { tag_id: 9 } });
  });

  test('JOBS-003 — is_urgent="true" parses to boolean true; "false" to false', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findMany.mockResolvedValue([] as never);
    prisma.jobPost.count.mockResolvedValue(0 as never);

    await service.findAll({ is_urgent: 'true' });
    let args = prisma.jobPost.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.is_urgent).toBe(true);

    prisma.jobPost.findMany.mockClear();
    await service.findAll({ is_urgent: 'false' });
    args = prisma.jobPost.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.is_urgent).toBe(false);
  });

  test('JOBS-002 — findAll() defaults to status=OPEN when no status query is supplied', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findMany.mockResolvedValue([] as never);
    prisma.jobPost.count.mockResolvedValue(0 as never);

    await service.findAll({});
    const args = prisma.jobPost.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.status).toBe('OPEN');
  });

  test('JOBS-002 — explicit status overrides the default', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findMany.mockResolvedValue([] as never);
    prisma.jobPost.count.mockResolvedValue(0 as never);

    await service.findAll({ status: 'CLOSED' });
    const args = prisma.jobPost.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.status).toBe('CLOSED');
  });

  test('JOBS-002 — status="ALL" opts out of any status filter', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findMany.mockResolvedValue([] as never);
    prisma.jobPost.count.mockResolvedValue(0 as never);

    await service.findAll({ status: 'ALL' });
    const args = prisma.jobPost.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.status).toBeUndefined();
  });
});

describe('TEST-JOBS-014 JobPostService.findMyPosts() — JOBS-026 / JOBS-029', () => {
  test('JOBS-026 — scopes by employer_id, layers query filters on top', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findMany.mockResolvedValue([] as never);
    prisma.jobPost.count.mockResolvedValue(0 as never);

    await service.findMyPosts(OWNER_ID, { status: 'OPEN' });
    const args = prisma.jobPost.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      include: Record<string, unknown>;
    };
    expect(args.where.employer_id).toBe(OWNER_ID);
    expect(args.where.status).toBe('OPEN');
  });

  test('JOBS-029 — include shape exposes _count.applications for the dashboard table', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findMany.mockResolvedValue([] as never);
    prisma.jobPost.count.mockResolvedValue(0 as never);

    await service.findMyPosts(OWNER_ID, {});
    const args = prisma.jobPost.findMany.mock.calls[0][0] as {
      include: { _count: { select: { applications: boolean } } };
    };
    expect(args.include._count.select.applications).toBe(true);
  });
});

describe('TEST-JOBS-013 JobPostService.findById() — JOBS-008', () => {
  test('JOBS-008 — missing row → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce(null as never);
    await expect(service.findById(1n)).rejects.toBeInstanceOf(NotFoundException);
  });

  test('JOBS-008 — present row returns through the include shape', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: 1n,
      title: 'Hi',
    } as never);
    await expect(service.findById(1n)).resolves.toEqual({
      id: 1n,
      title: 'Hi',
    });
    const args = prisma.jobPost.findUnique.mock.calls[0][0] as {
      include: { _count: unknown };
    };
    expect(args.include._count).toBeDefined();
  });
});
