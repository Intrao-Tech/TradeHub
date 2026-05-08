// TEST-REVIEW-010..020 — ReviewService unit specs.
//
// Pure-logic tests with deep-mocked Prisma. Each test cites the REVIEW-NNN
// clause from `tasks/in-progress/reviews/spec.md` it guards. Scope: the
// service-layer authorisation + visibility + recalculation contract —
// controllers / guards are exercised by `backend/test/review.e2e-spec.ts`.

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { ReviewService } from './review.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

function build(): {
  service: ReviewService;
  prisma: DeepMockProxy<PrismaService>;
} {
  const prisma = mockDeep<PrismaService>();
  const service = new ReviewService(prisma);
  return { service, prisma };
}

const COLLAB_ID = 100n;
const WORKER_ID = 11n;
const EMPLOYER_ID = 22n;
const OUTSIDER_ID = 99n;
const REVIEW_ID = 500n;

function fakeCollab(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: COLLAB_ID,
    worker_id: WORKER_ID,
    employer_id: EMPLOYER_ID,
    initiated_by: 'EMPLOYER',
    referral_id: null,
    job_post_id: null,
    status: 'COMPLETED',
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

function fakeReview(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REVIEW_ID,
    collaboration_id: COLLAB_ID,
    reviewer_role: 'WORKER',
    overall_rating: 5,
    quality_rating: null,
    reliability_rating: null,
    communication_rating: null,
    payment_rating: null,
    safety_rating: null,
    comment: null,
    is_published: false,
    published_at: null,
    created_at: new Date(),
    ...overrides,
  };
}

function userPayload(
  overrides: Partial<CurrentUserPayload> = {},
): CurrentUserPayload {
  return {
    accountId: overrides.accountId ?? WORKER_ID,
    email: overrides.email ?? 'tester@example.com',
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

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-010 — create() role derivation (REVIEW-013)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-010 ReviewService.create() — REVIEW-013 role derivation', () => {
  test('TEST-REVIEW-010 / REVIEW-013 — caller matches worker_id → reviewer_role: WORKER', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeCollab() as never);
    prisma.review.findFirst.mockResolvedValue(null);
    prisma.review.create.mockResolvedValue(
      fakeReview({ reviewer_role: 'WORKER' }) as never,
    );

    await service.create(COLLAB_ID, WORKER_ID, { overall_rating: 5 });

    const args = prisma.review.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.reviewer_role).toBe('WORKER');
  });

  test('TEST-REVIEW-010 / REVIEW-013 — caller matches employer_id → reviewer_role: EMPLOYER', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeCollab() as never);
    prisma.review.findFirst.mockResolvedValue(null);
    prisma.review.create.mockResolvedValue(
      fakeReview({ reviewer_role: 'EMPLOYER' }) as never,
    );

    await service.create(COLLAB_ID, EMPLOYER_ID, { overall_rating: 4 });

    const args = prisma.review.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.reviewer_role).toBe('EMPLOYER');
  });

  test('TEST-REVIEW-010 / REVIEW-013 — caller matches neither → ForbiddenException("Not a participant")', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeCollab() as never);

    await expect(
      service.create(COLLAB_ID, OUTSIDER_ID, { overall_rating: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  test('TEST-REVIEW-010 / REVIEW-013 — anti-test: client body cannot override server-derived reviewer_role', () => {
    // CreateReviewDto does not declare a `reviewer_role` field. A future PR
    // adding the field must not silently re-route worker submissions to the
    // employer side. This is a compile-time assertion via type access; the
    // expression below is the canary.
    type DtoKeys = keyof import('./dto/create-review.dto').CreateReviewDto;
    type AssertNoReviewerRole = Extract<DtoKeys, 'reviewer_role'> extends never
      ? true
      : false;
    const ok: AssertNoReviewerRole = true;
    expect(ok).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-011 — create() COMPLETED-only gate (REVIEW-013)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-011 ReviewService.create() — REVIEW-013 status gate', () => {
  const STATES_REJECT = [
    'PENDING',
    'CONFIRMED',
    'IN_PROGRESS',
    'REJECTED',
    'DISPUTED',
  ] as const;

  for (const status of STATES_REJECT) {
    test(`TEST-REVIEW-011 / REVIEW-013 — status=${status} → BadRequest "Reviews can only be created for completed collaborations"`, async () => {
      const { service, prisma } = build();
      prisma.collaboration.findUnique.mockResolvedValue(
        fakeCollab({ status }) as never,
      );
      const promise = service.create(COLLAB_ID, WORKER_ID, {
        overall_rating: 5,
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      await expect(promise).rejects.toThrow(
        'Reviews can only be created for completed collaborations',
      );
    });
  }

  test('TEST-REVIEW-011 / REVIEW-013 — status=COMPLETED → review created', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeCollab() as never);
    prisma.review.findFirst.mockResolvedValue(null);
    prisma.review.create.mockResolvedValue(fakeReview() as never);

    await expect(
      service.create(COLLAB_ID, WORKER_ID, { overall_rating: 5 }),
    ).resolves.toBeDefined();
    expect(prisma.review.create).toHaveBeenCalled();
  });

  test('TEST-REVIEW-011 / REVIEW-013 — missing collaboration → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(null);
    await expect(
      service.create(COLLAB_ID, WORKER_ID, { overall_rating: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-012 — create() unique-per-role (schema.prisma:543)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-012 ReviewService.create() — unique-per-collab-per-role', () => {
  test('TEST-REVIEW-012 — existing WORKER review, worker submits → BadRequest "A WORKER review already exists"', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeCollab() as never);
    prisma.review.findFirst.mockResolvedValue(
      fakeReview({ reviewer_role: 'WORKER' }) as never,
    );

    const promise = service.create(COLLAB_ID, WORKER_ID, { overall_rating: 5 });
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toThrow(
      'A WORKER review already exists for this collaboration',
    );
  });

  test('TEST-REVIEW-012 — existing EMPLOYER review, employer submits → mirror error', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeCollab() as never);
    prisma.review.findFirst.mockResolvedValue(
      fakeReview({ reviewer_role: 'EMPLOYER' }) as never,
    );

    const promise = service.create(COLLAB_ID, EMPLOYER_ID, {
      overall_rating: 5,
    });
    await expect(promise).rejects.toThrow(
      'A EMPLOYER review already exists for this collaboration',
    );
  });

  test('TEST-REVIEW-012 — existing WORKER review, employer submits → 201 (independent sides)', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeCollab() as never);
    // findFirst is scoped to the caller's derived role — service queries
    // `{ collaboration_id, reviewer_role: 'EMPLOYER' }` for the employer.
    prisma.review.findFirst.mockResolvedValue(null);
    prisma.review.create.mockResolvedValue(
      fakeReview({ reviewer_role: 'EMPLOYER' }) as never,
    );

    await service.create(COLLAB_ID, EMPLOYER_ID, { overall_rating: 5 });

    const findArgs = prisma.review.findFirst.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(findArgs.where.reviewer_role).toBe('EMPLOYER');
    expect(prisma.review.create).toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-013 — create() rating + comment field passthrough (REVIEW-012)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-013 ReviewService.create() — REVIEW-012 DTO field passthrough', () => {
  test('TEST-REVIEW-013 / REVIEW-012 — all six rating fields round-trip into the persisted row', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeCollab() as never);
    prisma.review.findFirst.mockResolvedValue(null);
    prisma.review.create.mockResolvedValue(fakeReview() as never);

    await service.create(COLLAB_ID, WORKER_ID, {
      overall_rating: 4,
      quality_rating: 5,
      reliability_rating: 3,
      communication_rating: 4,
      payment_rating: 5,
      safety_rating: 2,
      comment: 'great job',
    });

    const args = prisma.review.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.overall_rating).toBe(4);
    expect(args.data.quality_rating).toBe(5);
    expect(args.data.reliability_rating).toBe(3);
    expect(args.data.communication_rating).toBe(4);
    expect(args.data.payment_rating).toBe(5);
    expect(args.data.safety_rating).toBe(2);
    expect(args.data.comment).toBe('great job');
  });

  test('TEST-REVIEW-013 / REVIEW-012 — optional sub-ratings default to null when omitted from DTO', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeCollab() as never);
    prisma.review.findFirst.mockResolvedValue(null);
    prisma.review.create.mockResolvedValue(fakeReview() as never);

    await service.create(COLLAB_ID, WORKER_ID, { overall_rating: 5 });

    const args = prisma.review.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.quality_rating).toBeNull();
    expect(args.data.reliability_rating).toBeNull();
    expect(args.data.communication_rating).toBeNull();
    expect(args.data.payment_rating).toBeNull();
    expect(args.data.safety_rating).toBeNull();
    expect(args.data.comment).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-014 — getById() four-branch visibility (REVIEW-032)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-014 ReviewService.getById() — REVIEW-032 visibility branches', () => {
  test('TEST-REVIEW-014 / REVIEW-032 — published, anonymous caller → returns row', async () => {
    const { service, prisma } = build();
    prisma.review.findUnique.mockResolvedValue(
      fakeReview({
        is_published: true,
        collaboration: fakeCollab(),
      }) as never,
    );
    await expect(service.getById(REVIEW_ID, undefined)).resolves.toBeDefined();
  });

  test('TEST-REVIEW-014 / REVIEW-032 — published, logged-in non-participant → returns row', async () => {
    const { service, prisma } = build();
    prisma.review.findUnique.mockResolvedValue(
      fakeReview({
        is_published: true,
        collaboration: fakeCollab(),
      }) as never,
    );
    await expect(
      service.getById(
        REVIEW_ID,
        userPayload({ clientProfileId: OUTSIDER_ID }),
      ),
    ).resolves.toBeDefined();
  });

  test('TEST-REVIEW-014 / REVIEW-032 — draft, reviewer (WORKER side) → returns row', async () => {
    const { service, prisma } = build();
    prisma.review.findUnique.mockResolvedValue(
      fakeReview({
        is_published: false,
        reviewer_role: 'WORKER',
        collaboration: fakeCollab(),
      }) as never,
    );
    await expect(
      service.getById(REVIEW_ID, userPayload({ clientProfileId: WORKER_ID })),
    ).resolves.toBeDefined();
  });

  test('TEST-REVIEW-014 / REVIEW-032 — draft, reviewer (EMPLOYER side) → returns row', async () => {
    const { service, prisma } = build();
    prisma.review.findUnique.mockResolvedValue(
      fakeReview({
        is_published: false,
        reviewer_role: 'EMPLOYER',
        collaboration: fakeCollab(),
      }) as never,
    );
    await expect(
      service.getById(REVIEW_ID, userPayload({ clientProfileId: EMPLOYER_ID })),
    ).resolves.toBeDefined();
  });

  test('TEST-REVIEW-014 / REVIEW-032 — draft, staff caller → returns row', async () => {
    const { service, prisma } = build();
    prisma.review.findUnique.mockResolvedValue(
      fakeReview({
        is_published: false,
        collaboration: fakeCollab(),
      }) as never,
    );
    await expect(
      service.getById(
        REVIEW_ID,
        userPayload({ isStaff: true, clientProfileId: null }),
      ),
    ).resolves.toBeDefined();
  });

  test('TEST-REVIEW-014 / REVIEW-032 — draft, anonymous caller → ForbiddenException("This review is not published")', async () => {
    const { service, prisma } = build();
    prisma.review.findUnique.mockResolvedValue(
      fakeReview({
        is_published: false,
        collaboration: fakeCollab(),
      }) as never,
    );
    const promise = service.getById(REVIEW_ID, undefined);
    await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(promise).rejects.toThrow('This review is not published');
  });

  test('TEST-REVIEW-014 / REVIEW-032 — draft, logged-in non-participant non-staff → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.review.findUnique.mockResolvedValue(
      fakeReview({
        is_published: false,
        reviewer_role: 'WORKER',
        collaboration: fakeCollab(),
      }) as never,
    );
    await expect(
      service.getById(
        REVIEW_ID,
        userPayload({ clientProfileId: OUTSIDER_ID }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('TEST-REVIEW-014 / REVIEW-032 — draft, counterparty (reviewee) → ForbiddenException', async () => {
    // The WORKER-side review is *about* the employer; the employer (the
    // reviewee) is not the reviewer and must not see the draft.
    const { service, prisma } = build();
    prisma.review.findUnique.mockResolvedValue(
      fakeReview({
        is_published: false,
        reviewer_role: 'WORKER',
        collaboration: fakeCollab(),
      }) as never,
    );
    await expect(
      service.getById(REVIEW_ID, userPayload({ clientProfileId: EMPLOYER_ID })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('TEST-REVIEW-014 / REVIEW-032 — missing review → NotFoundException("Review not found")', async () => {
    const { service, prisma } = build();
    prisma.review.findUnique.mockResolvedValue(null);
    await expect(
      service.getById(REVIEW_ID, userPayload()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-015 — getBySubject() filter / pagination (REVIEW-020)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-015 ReviewService.getBySubject() — REVIEW-020 filter', () => {
  test('TEST-REVIEW-015 / REVIEW-020 — worker subject queries published EMPLOYER reviews on collabs.worker_id', async () => {
    const { service, prisma } = build();
    prisma.review.findMany.mockResolvedValue([] as never);
    prisma.review.count.mockResolvedValue(0);

    await service.getBySubject(WORKER_ID, { page: 1, limit: 10 }, 'WORKER');

    const findArgs = prisma.review.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: Record<string, unknown>;
      skip: number;
      take: number;
      include: Record<string, unknown>;
    };
    expect(findArgs.where.is_published).toBe(true);
    expect(findArgs.where.reviewer_role).toBe('EMPLOYER');
    expect(findArgs.where.collaboration).toEqual({ worker_id: WORKER_ID });
    expect(findArgs.orderBy).toEqual({ published_at: 'desc' });
    expect(findArgs.include).toEqual({ collaboration: true });
  });

  test('TEST-REVIEW-015 / REVIEW-020 — employer subject queries published WORKER reviews on collabs.employer_id', async () => {
    const { service, prisma } = build();
    prisma.review.findMany.mockResolvedValue([] as never);
    prisma.review.count.mockResolvedValue(0);

    await service.getBySubject(
      EMPLOYER_ID,
      { page: 1, limit: 10 },
      'EMPLOYER',
    );

    const findArgs = prisma.review.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(findArgs.where.reviewer_role).toBe('WORKER');
    expect(findArgs.where.collaboration).toEqual({ employer_id: EMPLOYER_ID });
  });

  test('TEST-REVIEW-015 / REVIEW-020 — pagination skip = (page-1)*limit', async () => {
    const { service, prisma } = build();
    prisma.review.findMany.mockResolvedValue([] as never);
    prisma.review.count.mockResolvedValue(0);

    await service.getBySubject(WORKER_ID, { page: 2, limit: 10 }, 'WORKER');

    const findArgs = prisma.review.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
    };
    expect(findArgs.skip).toBe(10);
    expect(findArgs.take).toBe(10);
  });

  test('TEST-REVIEW-015 / REVIEW-020 — total uses the same where clause as findMany', async () => {
    const { service, prisma } = build();
    prisma.review.findMany.mockResolvedValue([] as never);
    prisma.review.count.mockResolvedValue(7);

    const result = await service.getBySubject(
      WORKER_ID,
      { page: 1, limit: 10 },
      'WORKER',
    );
    expect(result.total).toBe(7);
    expect(result.totalPages).toBe(1);

    const countArgs = prisma.review.count.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(countArgs.where).toEqual({
      is_published: true,
      reviewer_role: 'EMPLOYER',
      collaboration: { worker_id: WORKER_ID },
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-016 — publish() happy path + idempotent (REVIEW-042)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-016 ReviewService.publish() — REVIEW-042', () => {
  test('TEST-REVIEW-016 / REVIEW-042 — draft → 200 with is_published true and published_at set', async () => {
    const { service, prisma } = build();
    prisma.review.findUnique.mockResolvedValue(
      fakeReview({ is_published: false, reviewer_role: 'WORKER' }) as never,
    );
    const updated = fakeReview({
      is_published: true,
      published_at: new Date(),
      reviewer_role: 'WORKER',
    });
    prisma.review.update.mockResolvedValue(updated as never);
    prisma.collaboration.findUniqueOrThrow.mockResolvedValue(
      fakeCollab() as never,
    );
    prisma.review.aggregate.mockResolvedValue({
      _avg: { overall_rating: 5 },
    } as never);
    prisma.review.count.mockResolvedValue(1);
    prisma.employerProfile.update.mockResolvedValue({} as never);

    const result = await service.publish(REVIEW_ID);
    expect(result.is_published).toBe(true);
    expect(result.published_at).not.toBeNull();
    const updateArgs = prisma.review.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateArgs.data.is_published).toBe(true);
    expect(updateArgs.data.published_at).toBeInstanceOf(Date);
  });

  test('TEST-REVIEW-016 / REVIEW-042 — already-published is idempotent (no re-stamp, no recalc)', async () => {
    const { service, prisma } = build();
    const original = fakeReview({
      is_published: true,
      published_at: new Date('2026-01-01'),
    });
    prisma.review.findUnique.mockResolvedValue(original as never);

    const result = await service.publish(REVIEW_ID);
    expect(result).toBe(original);
    expect(prisma.review.update).not.toHaveBeenCalled();
    expect(prisma.workerProfile.update).not.toHaveBeenCalled();
    expect(prisma.employerProfile.update).not.toHaveBeenCalled();
  });

  test('TEST-REVIEW-016 / REVIEW-042 — missing review → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.review.findUnique.mockResolvedValue(null);
    await expect(service.publish(REVIEW_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-017 — recalculateRatings() EMPLOYER side (review.service.ts:171-205)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-017 ReviewService.recalculateRatings() — EMPLOYER side updates WorkerProfile', () => {
  function setupPublish(opts: {
    avg: number | null;
    count: number;
  }) {
    const { service, prisma } = build();
    prisma.review.findUnique.mockResolvedValue(
      fakeReview({ is_published: false, reviewer_role: 'EMPLOYER' }) as never,
    );
    prisma.review.update.mockResolvedValue(
      fakeReview({
        is_published: true,
        published_at: new Date(),
        reviewer_role: 'EMPLOYER',
      }) as never,
    );
    prisma.collaboration.findUniqueOrThrow.mockResolvedValue(
      fakeCollab() as never,
    );
    prisma.review.aggregate.mockResolvedValue({
      _avg: { overall_rating: opts.avg },
    } as never);
    prisma.review.count.mockResolvedValue(opts.count);
    prisma.workerProfile.update.mockResolvedValue({} as never);
    return { service, prisma };
  }

  test('TEST-REVIEW-017 — single 5★ EMPLOYER review → WorkerProfile.rating_avg=5, rating_count=1', async () => {
    const { service, prisma } = setupPublish({ avg: 5, count: 1 });
    await service.publish(REVIEW_ID);

    const args = prisma.workerProfile.update.mock.calls[0][0] as {
      where: { id: bigint };
      data: { rating_avg: Prisma.Decimal; rating_count: number };
    };
    expect(args.where.id).toBe(WORKER_ID);
    expect(args.data.rating_avg.toString()).toBe('5');
    expect(args.data.rating_count).toBe(1);
  });

  test('TEST-REVIEW-017 — two reviews [5,3] → rating_avg=4, rating_count=2', async () => {
    const { service, prisma } = setupPublish({ avg: 4, count: 2 });
    await service.publish(REVIEW_ID);

    const args = prisma.workerProfile.update.mock.calls[0][0] as {
      data: { rating_avg: Prisma.Decimal; rating_count: number };
    };
    expect(args.data.rating_avg.toString()).toBe('4');
    expect(args.data.rating_count).toBe(2);
  });

  test('TEST-REVIEW-017 — query is filtered to is_published + reviewer_role:EMPLOYER + collaboration.worker_id (drafts and worker-side reviews excluded)', async () => {
    const { service, prisma } = setupPublish({ avg: 4, count: 2 });
    await service.publish(REVIEW_ID);

    const aggArgs = prisma.review.aggregate.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(aggArgs.where).toEqual({
      is_published: true,
      reviewer_role: 'EMPLOYER',
      collaboration: { worker_id: WORKER_ID },
    });
  });

  test('TEST-REVIEW-017 — zero published reviews (avg=null) → rating_avg=0, rating_count=0 (?? 0 fallback)', async () => {
    const { service, prisma } = setupPublish({ avg: null, count: 0 });
    await service.publish(REVIEW_ID);

    const args = prisma.workerProfile.update.mock.calls[0][0] as {
      data: { rating_avg: Prisma.Decimal; rating_count: number };
    };
    expect(args.data.rating_avg.toString()).toBe('0');
    expect(args.data.rating_count).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-018 — recalculateRatings() WORKER side (review.service.ts:206-233)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-018 ReviewService.recalculateRatings() — WORKER side updates EmployerProfile', () => {
  function setupPublish(opts: { avg: number | null; count: number }) {
    const { service, prisma } = build();
    prisma.review.findUnique.mockResolvedValue(
      fakeReview({ is_published: false, reviewer_role: 'WORKER' }) as never,
    );
    prisma.review.update.mockResolvedValue(
      fakeReview({
        is_published: true,
        published_at: new Date(),
        reviewer_role: 'WORKER',
      }) as never,
    );
    prisma.collaboration.findUniqueOrThrow.mockResolvedValue(
      fakeCollab() as never,
    );
    prisma.review.aggregate.mockResolvedValue({
      _avg: { overall_rating: opts.avg },
    } as never);
    prisma.review.count.mockResolvedValue(opts.count);
    prisma.employerProfile.update.mockResolvedValue({} as never);
    return { service, prisma };
  }

  test('TEST-REVIEW-018 — single 4★ WORKER review → EmployerProfile.rating_avg=4, rating_count=1', async () => {
    const { service, prisma } = setupPublish({ avg: 4, count: 1 });
    await service.publish(REVIEW_ID);

    const args = prisma.employerProfile.update.mock.calls[0][0] as {
      where: { id: bigint };
      data: { rating_avg: Prisma.Decimal; rating_count: number };
    };
    expect(args.where.id).toBe(EMPLOYER_ID);
    expect(args.data.rating_avg.toString()).toBe('4');
    expect(args.data.rating_count).toBe(1);
  });

  test('TEST-REVIEW-018 — query filtered to is_published + reviewer_role:WORKER + collaboration.employer_id', async () => {
    const { service, prisma } = setupPublish({ avg: 4, count: 1 });
    await service.publish(REVIEW_ID);

    const aggArgs = prisma.review.aggregate.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(aggArgs.where).toEqual({
      is_published: true,
      reviewer_role: 'WORKER',
      collaboration: { employer_id: EMPLOYER_ID },
    });
  });

  test('TEST-REVIEW-018 — avg null → rating_avg=0', async () => {
    const { service, prisma } = setupPublish({ avg: null, count: 0 });
    await service.publish(REVIEW_ID);
    const args = prisma.employerProfile.update.mock.calls[0][0] as {
      data: { rating_avg: Prisma.Decimal; rating_count: number };
    };
    expect(args.data.rating_avg.toString()).toBe('0');
    expect(args.data.rating_count).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-019 — getUnpublished() (REVIEW-046)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-019 ReviewService.getUnpublished() — REVIEW-046', () => {
  test('TEST-REVIEW-019 / REVIEW-046 — where filter is is_published:false', async () => {
    const { service, prisma } = build();
    prisma.review.findMany.mockResolvedValue([] as never);
    prisma.review.count.mockResolvedValue(0);

    await service.getUnpublished({ page: 1, limit: 20 });

    const findArgs = prisma.review.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: Record<string, unknown>;
      include: Record<string, unknown>;
      skip: number;
      take: number;
    };
    expect(findArgs.where).toEqual({ is_published: false });
    expect(findArgs.orderBy).toEqual({ created_at: 'desc' });
    expect(findArgs.include).toEqual({ collaboration: true });
    expect(findArgs.skip).toBe(0);
    expect(findArgs.take).toBe(20);

    const countArgs = prisma.review.count.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(countArgs.where).toEqual({ is_published: false });
  });

  test('TEST-REVIEW-019 / REVIEW-046 — pagination passes skip/take and returns paginated envelope', async () => {
    const { service, prisma } = build();
    prisma.review.findMany.mockResolvedValue([] as never);
    prisma.review.count.mockResolvedValue(45);

    const result = await service.getUnpublished({ page: 3, limit: 20 });
    expect(result).toEqual({
      items: [],
      total: 45,
      page: 3,
      limit: 20,
      totalPages: 3,
    });
    const findArgs = prisma.review.findMany.mock.calls[0][0] as { skip: number };
    expect(findArgs.skip).toBe(40);
  });

  test('TEST-REVIEW-019 / REVIEW-046 — empty result → totalPages 0', async () => {
    const { service, prisma } = build();
    prisma.review.findMany.mockResolvedValue([] as never);
    prisma.review.count.mockResolvedValue(0);

    await expect(service.getUnpublished({ page: 1, limit: 20 })).resolves.toEqual(
      { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-020 — assertCollaborationParticipant()
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-020 ReviewService.assertCollaborationParticipant()', () => {
  test('TEST-REVIEW-020 — staff caller short-circuits (no DB fetch)', async () => {
    const { service, prisma } = build();
    await expect(
      service.assertCollaborationParticipant(
        COLLAB_ID,
        userPayload({ isStaff: true, clientProfileId: null }),
      ),
    ).resolves.toBeUndefined();
    expect(prisma.collaboration.findUnique).not.toHaveBeenCalled();
  });

  test('TEST-REVIEW-020 — non-staff without clientProfileId → ForbiddenException("No client profile")', async () => {
    const { service } = build();
    const promise = service.assertCollaborationParticipant(
      COLLAB_ID,
      userPayload({ clientProfileId: null }),
    );
    await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(promise).rejects.toThrow('No client profile');
  });

  test('TEST-REVIEW-020 — caller matches worker_id → no throw', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeCollab() as never);
    await expect(
      service.assertCollaborationParticipant(
        COLLAB_ID,
        userPayload({ clientProfileId: WORKER_ID }),
      ),
    ).resolves.toBeUndefined();
  });

  test('TEST-REVIEW-020 — caller matches employer_id → no throw', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeCollab() as never);
    await expect(
      service.assertCollaborationParticipant(
        COLLAB_ID,
        userPayload({ clientProfileId: EMPLOYER_ID }),
      ),
    ).resolves.toBeUndefined();
  });

  test('TEST-REVIEW-020 — caller matches neither → ForbiddenException("Not a participant in this collaboration")', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(fakeCollab() as never);
    const promise = service.assertCollaborationParticipant(
      COLLAB_ID,
      userPayload({ clientProfileId: OUTSIDER_ID }),
    );
    await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(promise).rejects.toThrow(
      'Not a participant in this collaboration',
    );
  });

  test('TEST-REVIEW-020 — missing collaboration → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValue(null);
    await expect(
      service.assertCollaborationParticipant(
        COLLAB_ID,
        userPayload({ clientProfileId: WORKER_ID }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
