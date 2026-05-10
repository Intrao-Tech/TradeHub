// TEST-REVIEW-070..077 — Reviews e2e suite.
//
// Drives the Reviews HTTP surface end-to-end against the Postgres
// Testcontainer harness from `tests-auth-flow`. Each test cites the
// REVIEW-NNN clause from `tasks/in-progress/reviews/spec.md` (and the
// TEST-REVIEW-NNN id from this folder's spec.md) it locks down. No
// production code is changed by this suite — bugs are filed in
// `tasks/in-progress/reviews/followups.md` and the affected assertions
// are `.skip`'d with a comment.

import {
  seedActiveEmployer,
  seedActiveWorker,
  seedAdmin,
  seedCollaboration,
  seedPendingWorker,
  seedReview,
} from './util/factories';
import { bearer, signAccessTokenFor } from './util/auth-helpers';
import { createTestApp, type TestHarness } from './util/test-app';

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-070 — POST /reviews/collaboration/:id (REVIEW-013)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-070 POST /reviews/collaboration/:id (REVIEW-013)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
  });

  test('TEST-REVIEW-070 / REVIEW-013 — worker submits → 201, reviewer_role=WORKER, is_published=false', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    const res = await h
      .request()
      .post(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(token))
      .send({ overall_rating: 5, comment: 'great' })
      .expect(201);

    expect(res.body.reviewer_role).toBe('WORKER');
    expect(res.body.is_published).toBe(false);
    expect(res.body.published_at).toBeNull();
    expect(res.body.overall_rating).toBe(5);
    expect(res.body.comment).toBe('great');
  });

  test('TEST-REVIEW-070 / REVIEW-013 — employer submits → 201, reviewer_role=EMPLOYER', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });

    const res = await h
      .request()
      .post(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(token))
      .send({ overall_rating: 4 })
      .expect(201);
    expect(res.body.reviewer_role).toBe('EMPLOYER');
  });

  test('TEST-REVIEW-070 — anonymous → 401', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    await h
      .request()
      .post(`/api/reviews/collaboration/${collab.id}`)
      .send({ overall_rating: 5 })
      .expect(401);
  });

  test('TEST-REVIEW-070 / REVIEW-015 — pending email verification → 403 EMAIL_NOT_VERIFIED (RequiresVerifiedEmail)', async () => {
    const worker = await seedPendingWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });

    const res = await h
      .request()
      .post(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(token))
      .send({ overall_rating: 5 })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('TEST-REVIEW-070 — duplicate submit → 400 "A WORKER review already exists"', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    await h
      .request()
      .post(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(token))
      .send({ overall_rating: 5 })
      .expect(201);

    const res = await h
      .request()
      .post(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(token))
      .send({ overall_rating: 4 })
      .expect(400);
    expect(res.body.message).toContain('A WORKER review already exists');
  });

  test('TEST-REVIEW-070 — submit on PENDING collab → 400 "Reviews can only be created for completed"', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'PENDING',
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    const res = await h
      .request()
      .post(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(token))
      .send({ overall_rating: 5 })
      .expect(400);
    expect(res.body.message).toContain(
      'Reviews can only be created for completed',
    );
  });

  test('TEST-REVIEW-070 — non-participant → 403 "Not a participant"', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const outsider = await seedActiveWorker(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    const token = signAccessTokenFor(h, {
      accountId: outsider.id,
      email: outsider.email,
    });

    const res = await h
      .request()
      .post(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(token))
      .send({ overall_rating: 5 })
      .expect(403);
    expect(res.body.message).toContain('Not a participant');
  });

  test('TEST-REVIEW-070 / REVIEW-013 — anti-test: body reviewer_role is rejected (forbidNonWhitelisted) — server-derived value cannot be overridden', async () => {
    // The global ValidationPipe runs with `whitelist: true,
    // forbidNonWhitelisted: true` (`backend/src/main.ts:49-51`). Any client
    // attempting to pass `reviewer_role` is rejected with 400 — a stronger
    // guarantee than silent stripping. Either way the privilege-escalation
    // path is closed: the body cannot be honoured.
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    await h
      .request()
      .post(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(token))
      .send({ overall_rating: 5, reviewer_role: 'EMPLOYER' })
      .expect(400);

    // The clean submit (no extra field) still derives WORKER from the JWT.
    const res = await h
      .request()
      .post(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(token))
      .send({ overall_rating: 5 })
      .expect(201);
    expect(res.body.reviewer_role).toBe('WORKER');
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-071 — GET /reviews/collaboration/:id
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-071 GET /reviews/collaboration/:id', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
  });

  async function setupBothReviews() {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'WORKER',
      overallRating: 5,
      isPublished: false,
    });
    await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'EMPLOYER',
      overallRating: 4,
      isPublished: true,
    });
    return { worker, employer, collab };
  }

  test('TEST-REVIEW-071 — worker JWT → both rows', async () => {
    const { worker, collab } = await setupBothReviews();
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const res = await h
      .request()
      .get(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(token))
      .expect(200);
    expect(res.body).toHaveLength(2);
  });

  test('TEST-REVIEW-071 — employer JWT → both rows', async () => {
    const { employer, collab } = await setupBothReviews();
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const res = await h
      .request()
      .get(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(token))
      .expect(200);
    expect(res.body).toHaveLength(2);
  });

  test('TEST-REVIEW-071 — non-participant → 403', async () => {
    const { collab } = await setupBothReviews();
    const outsider = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: outsider.id,
      email: outsider.email,
    });
    await h
      .request()
      .get(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(token))
      .expect(403);
  });

  test('TEST-REVIEW-071 — staff JWT → both rows', async () => {
    const { collab } = await setupBothReviews();
    const admin = await seedAdmin(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: admin.id,
      email: admin.email,
    });
    const res = await h
      .request()
      .get(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(token))
      .expect(200);
    expect(res.body).toHaveLength(2);
  });

  test('TEST-REVIEW-071 — anonymous → 401', async () => {
    const { collab } = await setupBothReviews();
    await h
      .request()
      .get(`/api/reviews/collaboration/${collab.id}`)
      .expect(401);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-072 — GET /reviews/worker/:id (REVIEW-020)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-072 GET /reviews/worker/:id (REVIEW-020)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
  });

  test('TEST-REVIEW-072 / REVIEW-020 — anonymous → 200 with published EMPLOYER reviews only', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'EMPLOYER',
      overallRating: 5,
      isPublished: true,
    });
    // worker-side review on the same collab: not about the worker, excluded.
    await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'WORKER',
      overallRating: 4,
      isPublished: true,
    });

    const res = await h
      .request()
      .get(`/api/reviews/worker/${worker.id}`)
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].reviewer_role).toBe('EMPLOYER');
    expect(res.body.items[0].overall_rating).toBe(5);
    expect(res.body.total).toBe(1);
  });

  test('TEST-REVIEW-072 / REVIEW-020 — drafts excluded even for the worker themselves', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'EMPLOYER',
      isPublished: false,
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const res = await h
      .request()
      .get(`/api/reviews/worker/${worker.id}`)
      .set(...bearer(token))
      .expect(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  test('TEST-REVIEW-072 / REVIEW-020 — pagination: page 2 limit 5 returns items 6-10 newest-first', async () => {
    const worker = await seedActiveWorker(h.prisma);
    for (let i = 0; i < 12; i += 1) {
      const employer = await seedActiveEmployer(h.prisma);
      const collab = await seedCollaboration(h.prisma, {
        workerId: worker.id,
        employerId: employer.id,
        status: 'COMPLETED',
      });
      await seedReview(h.prisma, {
        collaborationId: collab.id,
        reviewerRole: 'EMPLOYER',
        overallRating: 5,
        isPublished: true,
        publishedAt: new Date(Date.now() - i * 1000),
      });
    }

    const res = await h
      .request()
      .get(`/api/reviews/worker/${worker.id}?page=2&limit=5`)
      .expect(200);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.total).toBe(12);
    expect(res.body.page).toBe(2);
    expect(res.body.totalPages).toBe(3);
    // newest first ordering by published_at desc — earlier indexes have a
    // newer published_at, so items 6-10 are at indexes 5..9.
    const dates = res.body.items.map((r: { published_at: string }) =>
      new Date(r.published_at).getTime(),
    );
    for (let i = 1; i < dates.length; i += 1) {
      expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-073 — GET /reviews/employer/:id (REVIEW-020 mirror)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-073 GET /reviews/employer/:id (REVIEW-020)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
  });

  test('TEST-REVIEW-073 / REVIEW-020 — anonymous → published WORKER reviews only', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'WORKER',
      overallRating: 4,
      isPublished: true,
    });
    await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'EMPLOYER',
      isPublished: true,
    });

    const res = await h
      .request()
      .get(`/api/reviews/employer/${employer.id}`)
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].reviewer_role).toBe('WORKER');
    expect(res.body.items[0].overall_rating).toBe(4);
  });

  test('TEST-REVIEW-073 / REVIEW-020 — drafts excluded', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'WORKER',
      isPublished: false,
    });
    const res = await h
      .request()
      .get(`/api/reviews/employer/${employer.id}`)
      .expect(200);
    expect(res.body.items).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-074 — GET /reviews/:id four-branch visibility (REVIEW-032)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-074 GET /reviews/:id (REVIEW-032)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
  });

  test('TEST-REVIEW-074 / REVIEW-032 — published, anonymous → 200', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    const review = await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'EMPLOYER',
      isPublished: true,
    });
    await h.request().get(`/api/reviews/${review.id}`).expect(200);
  });

  test('TEST-REVIEW-074 / REVIEW-032 — draft, anonymous → 403', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    const review = await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'EMPLOYER',
      isPublished: false,
    });
    await h.request().get(`/api/reviews/${review.id}`).expect(403);
  });

  test('TEST-REVIEW-074 / REVIEW-032 — draft, reviewer JWT → 200', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    const review = await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'EMPLOYER',
      isPublished: false,
    });
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    await h
      .request()
      .get(`/api/reviews/${review.id}`)
      .set(...bearer(token))
      .expect(200);
  });

  test('TEST-REVIEW-074 / REVIEW-032 — draft, counterparty (reviewee) JWT → 403', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    const review = await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'EMPLOYER',
      isPublished: false,
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    await h
      .request()
      .get(`/api/reviews/${review.id}`)
      .set(...bearer(token))
      .expect(403);
  });

  test('TEST-REVIEW-074 / REVIEW-032 — draft, staff JWT → 200', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const admin = await seedAdmin(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    const review = await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'EMPLOYER',
      isPublished: false,
    });
    const token = signAccessTokenFor(h, {
      accountId: admin.id,
      email: admin.email,
    });
    await h
      .request()
      .get(`/api/reviews/${review.id}`)
      .set(...bearer(token))
      .expect(200);
  });

  test('TEST-REVIEW-074 / REVIEW-032 — missing → 404', async () => {
    await h.request().get(`/api/reviews/9999999`).expect(404);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-075 — PATCH /reviews/:id/publish (REVIEW-042)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-075 PATCH /reviews/:id/publish (REVIEW-042)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
  });

  async function seedDraft(role: 'WORKER' | 'EMPLOYER' = 'EMPLOYER') {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    const review = await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: role,
      overallRating: 5,
      isPublished: false,
    });
    return { worker, employer, collab, review };
  }

  test('TEST-REVIEW-075 / REVIEW-042 — staff JWT → 200, published', async () => {
    const { review } = await seedDraft();
    const admin = await seedAdmin(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: admin.id,
      email: admin.email,
    });
    const res = await h
      .request()
      .patch(`/api/reviews/${review.id}/publish`)
      .set(...bearer(token))
      .expect(200);
    expect(res.body.is_published).toBe(true);
    expect(res.body.published_at).not.toBeNull();
  });

  test('TEST-REVIEW-075 / REVIEW-042 — non-staff JWT → 403', async () => {
    const { review, worker } = await seedDraft();
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    await h
      .request()
      .patch(`/api/reviews/${review.id}/publish`)
      .set(...bearer(token))
      .expect(403);
  });

  test('TEST-REVIEW-075 / REVIEW-042 — anonymous → 401', async () => {
    const { review } = await seedDraft();
    await h.request().patch(`/api/reviews/${review.id}/publish`).expect(401);
  });

  test('TEST-REVIEW-075 / REVIEW-042 — recalc fires: WorkerProfile.rating_avg/_count update after publishing an EMPLOYER review', async () => {
    const { review, worker } = await seedDraft('EMPLOYER');
    const admin = await seedAdmin(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: admin.id,
      email: admin.email,
    });
    await h
      .request()
      .patch(`/api/reviews/${review.id}/publish`)
      .set(...bearer(token))
      .expect(200);

    const profile = await h.prisma.workerProfile.findUniqueOrThrow({
      where: { id: worker.id },
    });
    expect(Number(profile.rating_avg)).toBe(5);
    expect(profile.rating_count).toBe(1);
  });

  test('TEST-REVIEW-075 / REVIEW-042 — recalc fires: EmployerProfile.rating_avg/_count update after publishing a WORKER review', async () => {
    const { review, employer } = await seedDraft('WORKER');
    const admin = await seedAdmin(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: admin.id,
      email: admin.email,
    });
    await h
      .request()
      .patch(`/api/reviews/${review.id}/publish`)
      .set(...bearer(token))
      .expect(200);

    const profile = await h.prisma.employerProfile.findUniqueOrThrow({
      where: { id: employer.id },
    });
    expect(Number(profile.rating_avg)).toBe(5);
    expect(profile.rating_count).toBe(1);
  });

  test('TEST-REVIEW-075 / REVIEW-042 — re-publish (already published) → 200, published_at unchanged', async () => {
    const { review } = await seedDraft('EMPLOYER');
    const admin = await seedAdmin(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: admin.id,
      email: admin.email,
    });
    const first = await h
      .request()
      .patch(`/api/reviews/${review.id}/publish`)
      .set(...bearer(token))
      .expect(200);
    const stamped = first.body.published_at;
    expect(stamped).not.toBeNull();

    // Wait > clock granularity to make sure a re-stamp would be detectable.
    await new Promise((r) => setTimeout(r, 25));
    const second = await h
      .request()
      .patch(`/api/reviews/${review.id}/publish`)
      .set(...bearer(token))
      .expect(200);
    expect(second.body.published_at).toBe(stamped);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-076 — GET /reviews/unpublished (REVIEW-046)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-076 GET /reviews/unpublished (REVIEW-046)', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
  });

  test('TEST-REVIEW-076 / REVIEW-046 — staff JWT → 200, only is_published:false rows', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'WORKER',
      isPublished: false,
    });
    await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'EMPLOYER',
      isPublished: true,
    });

    const admin = await seedAdmin(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: admin.id,
      email: admin.email,
    });
    const res = await h
      .request()
      .get('/api/reviews/unpublished')
      .set(...bearer(token))
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].is_published).toBe(false);
    expect(res.body.total).toBe(1);
  });

  test('TEST-REVIEW-076 / REVIEW-046 — anonymous → 401', async () => {
    await h.request().get('/api/reviews/unpublished').expect(401);
  });

  test('TEST-REVIEW-076 / REVIEW-046 — privilege wall: non-staff worker (even when reviewer of one of the drafts) → 403', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'COMPLETED',
    });
    await seedReview(h.prisma, {
      collaborationId: collab.id,
      reviewerRole: 'WORKER',
      isPublished: false,
    });

    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    await h
      .request()
      .get('/api/reviews/unpublished')
      .set(...bearer(token))
      .expect(403);
  });

  test('TEST-REVIEW-076 / REVIEW-046 — pagination newest-first by created_at', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const reviewIds: bigint[] = [];
    for (let i = 0; i < 4; i += 1) {
      const employer = await seedActiveEmployer(h.prisma);
      const collab = await seedCollaboration(h.prisma, {
        workerId: worker.id,
        employerId: employer.id,
        status: 'COMPLETED',
      });
      const r = await seedReview(h.prisma, {
        collaborationId: collab.id,
        reviewerRole: 'EMPLOYER',
        isPublished: false,
        createdAt: new Date(2026, 0, i + 1),
      });
      reviewIds.push(r.id);
    }
    const admin = await seedAdmin(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: admin.id,
      email: admin.email,
    });
    const res = await h
      .request()
      .get('/api/reviews/unpublished?page=1&limit=2')
      .set(...bearer(token))
      .expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(4);
    expect(res.body.totalPages).toBe(2);
    // newest first
    const dates = res.body.items.map((r: { created_at: string }) =>
      new Date(r.created_at).getTime(),
    );
    expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
  });

  test('TEST-REVIEW-076 / REVIEW-046 — empty result → paginated envelope with total:0, totalPages:0', async () => {
    const admin = await seedAdmin(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: admin.id,
      email: admin.email,
    });
    const res = await h
      .request()
      .get('/api/reviews/unpublished')
      .set(...bearer(token))
      .expect(200);
    expect(res.body).toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-077 — Cross-feature handoff: COMPLETED → review allowed
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-077 Cross-feature: COLLAB-021 COMPLETED handoff', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
  });

  test('TEST-REVIEW-077 — collab transitions to COMPLETED → POST /reviews/collaboration/:id then works', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'IN_PROGRESS',
    });

    const workerToken = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    // Pre-completion: review submission is rejected.
    await h
      .request()
      .post(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(workerToken))
      .send({ overall_rating: 5 })
      .expect(400);

    // Worker marks complete (COLLAB-021).
    await h
      .request()
      .patch(`/api/collaborations/${collab.id}/status`)
      .set(...bearer(workerToken))
      .send({ status: 'COMPLETED' })
      .expect(200);

    // Now the review submission succeeds.
    const res = await h
      .request()
      .post(`/api/reviews/collaboration/${collab.id}`)
      .set(...bearer(workerToken))
      .send({ overall_rating: 5 })
      .expect(201);
    expect(res.body.reviewer_role).toBe('WORKER');
  });
});
