// TEST-COLLAB-070..078 — Collaboration e2e suite.
//
// Post-2026-05 / CR-003: a Collaboration is a relationship-only binding
// (worker ↔ employer). The lifecycle state machine moved entirely onto
// Contract (DRAFT/PROPOSED/ACTIVE/ENDED) — there is no `PATCH /:id/status`
// and no collaboration `status`/`flagged` columns. Contract-lifecycle e2e
// coverage lives in `cr.contract.e2e-spec.ts`; this suite locks the
// collaboration surface that remains: create, list, read, access control.

import {
  seedActiveEmployer,
  seedActiveWorker,
  seedAdmin,
  seedCollaboration,
  seedJobApplication,
  seedJobPost,
  seedPendingEmployer,
  seedPendingWorker,
} from './util/factories';
import { bearer, signAccessTokenFor } from './util/auth-helpers';
import { createTestApp, type TestHarness } from './util/test-app';

describe('TEST-COLLAB-070 happy-path create (COLLAB-021)', () => {
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

  test('TEST-COLLAB-070 — employer POST /collaborations creates the worker↔employer relationship', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const res = await h
      .request()
      .post('/api/collaborations')
      .set(...bearer(token))
      .send({ worker_id: Number(worker.id) })
      .expect(201);
    expect(String(res.body.worker_id)).toBe(String(worker.id));
    expect(String(res.body.employer_id)).toBe(String(employer.id));
    // The relationship's chat conversation is spun up eagerly.
    expect(res.body.conversation).toBeDefined();
  });

  test('TEST-COLLAB-070 — re-inviting the same worker is idempotent (find-or-create)', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const first = await h
      .request()
      .post('/api/collaborations')
      .set(...bearer(token))
      .send({ worker_id: Number(worker.id) })
      .expect(201);
    const second = await h
      .request()
      .post('/api/collaborations')
      .set(...bearer(token))
      .send({ worker_id: Number(worker.id) })
      .expect(201);
    expect(String(second.body.id)).toBe(String(first.body.id));
  });
});

describe('TEST-COLLAB-074 AccountStateGuard on POST /collaborations (COLLAB-001 sealed Auth dep)', () => {
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

  test('TEST-COLLAB-074 — PENDING worker on POST /collaborations → 403 EMAIL_NOT_VERIFIED', async () => {
    const worker = await seedPendingWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });
    const res = await h
      .request()
      .post('/api/collaborations')
      .set(...bearer(token))
      .send({ employer_id: Number(employer.id) })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('TEST-COLLAB-074 — PENDING employer on POST /collaborations → 403 EMAIL_NOT_VERIFIED', async () => {
    const employer = await seedPendingEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });
    const res = await h
      .request()
      .post('/api/collaborations')
      .set(...bearer(token))
      .send({ worker_id: Number(worker.id) })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('TEST-COLLAB-076 GET /collaborations/me scoping + pagination (COLLAB-011)', () => {
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

  test('TEST-COLLAB-076 / COLLAB-011 — returns only rows where caller is party', async () => {
    const workerA = await seedActiveWorker(h.prisma);
    const workerB = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    await seedCollaboration(h.prisma, {
      workerId: workerA.id,
      employerId: employer.id,
    });
    await seedCollaboration(h.prisma, {
      workerId: workerB.id,
      employerId: employer.id,
    });
    const token = signAccessTokenFor(h, {
      accountId: workerA.id,
      email: workerA.email,
    });
    const res = await h
      .request()
      .get('/api/collaborations/me')
      .set(...bearer(token))
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(String(res.body.items[0].worker_id)).toBe(String(workerA.id));
  });

  test('TEST-COLLAB-076 / COLLAB-011 — pagination round-trips and total is stable', async () => {
    const worker = await seedActiveWorker(h.prisma);
    // Three distinct employers → three relationships for this worker.
    for (let i = 0; i < 3; i += 1) {
      const employer = await seedActiveEmployer(h.prisma);
      await seedCollaboration(h.prisma, {
        workerId: worker.id,
        employerId: employer.id,
      });
    }
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const page1 = await h
      .request()
      .get('/api/collaborations/me?page=1&limit=2')
      .set(...bearer(token))
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.total).toBe(3);
    expect(page1.body.page).toBe(1);
    expect(page1.body.limit).toBe(2);

    const page2 = await h
      .request()
      .get('/api/collaborations/me?page=2&limit=2')
      .set(...bearer(token))
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.total).toBe(3);
  });
});

describe('TEST-COLLAB-077 GET /collaborations/:id access control (COLLAB-002, COLLAB-051)', () => {
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

  test('TEST-COLLAB-077 / COLLAB-020 — party reads → 200 with relations expanded', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const res = await h
      .request()
      .get(`/api/collaborations/${collab.id}`)
      .set(...bearer(token))
      .expect(200);
    expect(res.body.worker.client_profile).toBeDefined();
    expect(res.body.employer.client_profile).toBeDefined();
    // Lifecycle lives on contracts now — expanded as an array.
    expect(Array.isArray(res.body.contracts)).toBe(true);
  });

  test('TEST-COLLAB-077 — non-party non-staff → 403', async () => {
    const workerA = await seedActiveWorker(h.prisma);
    const workerB = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: workerA.id,
      employerId: employer.id,
    });
    const token = signAccessTokenFor(h, {
      accountId: workerB.id,
      email: workerB.email,
    });
    await h
      .request()
      .get(`/api/collaborations/${collab.id}`)
      .set(...bearer(token))
      .expect(403);
  });

  test('TEST-COLLAB-077 / COLLAB-051 — staff reads non-party collab → 200', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const admin = await seedAdmin(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
    });
    const token = signAccessTokenFor(h, {
      accountId: admin.id,
      email: admin.email,
    });
    await h
      .request()
      .get(`/api/collaborations/${collab.id}`)
      .set(...bearer(token))
      .expect(200);
  });

  test('TEST-COLLAB-077 — missing id → 404', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    await h
      .request()
      .get('/api/collaborations/9999999')
      .set(...bearer(token))
      .expect(404);
  });
});

describe('TEST-COLLAB-078 cross-feature seam Jobs → Collaborations (COLLAB-001 sealed Jobs dep)', () => {
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

  test('TEST-COLLAB-078 — accept → to-collaboration → row visible on GET /collaborations/me for both parties', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const application = await seedJobApplication(h.prisma, {
      jobPostId: post.id,
      workerId: worker.id,
      status: 'ACCEPTED',
    });
    const employerToken = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const workerToken = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    const conv = await h
      .request()
      .post(`/api/job-applications/${application.id}/to-collaboration`)
      .set(...bearer(employerToken))
      .expect(201);
    expect(conv.body.id).toBeDefined();

    const employerList = await h
      .request()
      .get('/api/collaborations/me')
      .set(...bearer(employerToken))
      .expect(200);
    expect(
      employerList.body.items.some(
        (row: { id: string | number }) =>
          String(row.id) === String(conv.body.id),
      ),
    ).toBe(true);

    const workerList = await h
      .request()
      .get('/api/collaborations/me')
      .set(...bearer(workerToken))
      .expect(200);
    expect(
      workerList.body.items.some(
        (row: { id: string | number }) =>
          String(row.id) === String(conv.body.id),
      ),
    ).toBe(true);
  });
});
