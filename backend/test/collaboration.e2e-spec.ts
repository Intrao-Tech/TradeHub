// TEST-COLLAB-070..078 — Collaboration e2e suite.
//
// Drives the lifecycle and authorisation matrix end-to-end against the
// Postgres Testcontainer harness from `tests-auth-flow`. Each test cites
// the COLLAB-NNN clause from `tasks/done/collaborations-polish/spec.md`
// it locks down. No production code is changed by this suite — bugs are
// filed in `tasks/done/collaborations-polish/followups.md` and the
// affected assertions are `.skip`'d with a comment.

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

describe('TEST-COLLAB-070 happy-path lifecycle (COLLAB-021, parent E2E-1)', () => {
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

  test('TEST-COLLAB-070 / COLLAB-021 — create → confirm → start → complete', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const employerToken = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const workerToken = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    // Employer initiates
    const created = await h
      .request()
      .post('/api/collaborations')
      .set(...bearer(employerToken))
      .send({ worker_id: Number(worker.id), agreed_amount: 1500 })
      .expect(201);
    expect(created.body.status).toBe('PENDING');
    expect(created.body.initiated_by).toBe('EMPLOYER');
    const collabId = created.body.id;

    // Worker (responder) confirms
    const confirmed = await h
      .request()
      .patch(`/api/collaborations/${collabId}/status`)
      .set(...bearer(workerToken))
      .send({ status: 'CONFIRMED' })
      .expect(200);
    expect(confirmed.body.status).toBe('CONFIRMED');
    expect(confirmed.body.confirmed_at).not.toBeNull();

    // Either party starts
    const started = await h
      .request()
      .patch(`/api/collaborations/${collabId}/status`)
      .set(...bearer(employerToken))
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    expect(started.body.status).toBe('IN_PROGRESS');
    expect(started.body.started_at).not.toBeNull();

    // Either party completes
    const completed = await h
      .request()
      .patch(`/api/collaborations/${collabId}/status`)
      .set(...bearer(workerToken))
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(completed.body.status).toBe('COMPLETED');
    expect(completed.body.ended_at).not.toBeNull();

    // Detail returns the full timeline
    const detail = await h
      .request()
      .get(`/api/collaborations/${collabId}`)
      .set(...bearer(workerToken))
      .expect(200);
    expect(detail.body.status).toBe('COMPLETED');
    expect(detail.body.confirmed_at).not.toBeNull();
    expect(detail.body.started_at).not.toBeNull();
    expect(detail.body.ended_at).not.toBeNull();
    expect(detail.body.worker.client_profile).toBeDefined();
    expect(detail.body.employer.client_profile).toBeDefined();
  });
});

describe('TEST-COLLAB-071 reject path (COLLAB-021)', () => {
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

  test('TEST-COLLAB-071 / COLLAB-021 — worker initiates, employer rejects, no further transitions', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const workerToken = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const employerToken = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });

    const created = await h
      .request()
      .post('/api/collaborations')
      .set(...bearer(workerToken))
      .send({ employer_id: Number(employer.id) })
      .expect(201);
    expect(created.body.status).toBe('PENDING');
    expect(created.body.initiated_by).toBe('WORKER');
    const collabId = created.body.id;

    await h
      .request()
      .patch(`/api/collaborations/${collabId}/status`)
      .set(...bearer(employerToken))
      .send({ status: 'REJECTED' })
      .expect(200);

    // Subsequent transitions are rejected
    await h
      .request()
      .patch(`/api/collaborations/${collabId}/status`)
      .set(...bearer(employerToken))
      .send({ status: 'CONFIRMED' })
      .expect(400);

    await h
      .request()
      .patch(`/api/collaborations/${collabId}/status`)
      .set(...bearer(workerToken))
      .send({ status: 'IN_PROGRESS' })
      .expect(400);
  });
});

describe('TEST-COLLAB-072 dispute paths (COLLAB-021)', () => {
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

  test.each(['PENDING', 'CONFIRMED', 'IN_PROGRESS'] as const)(
    'TEST-COLLAB-072 / COLLAB-021 — %s → DISPUTED by either party flags row',
    async (current) => {
      const worker = await seedActiveWorker(h.prisma);
      const employer = await seedActiveEmployer(h.prisma);
      const collab = await seedCollaboration(h.prisma, {
        workerId: worker.id,
        employerId: employer.id,
        status: current,
        initiatedBy: 'EMPLOYER',
      });
      const workerToken = signAccessTokenFor(h, {
        accountId: worker.id,
        email: worker.email,
      });
      const res = await h
        .request()
        .patch(`/api/collaborations/${collab.id}/status`)
        .set(...bearer(workerToken))
        .send({ status: 'DISPUTED' })
        .expect(200);
      expect(res.body.status).toBe('DISPUTED');
      expect(res.body.flagged).toBe(true);
    },
  );
});

describe('TEST-COLLAB-073 authorisation matrix (COLLAB-021, COLLAB-051)', () => {
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

  test('TEST-COLLAB-073 / COLLAB-021 — initiator cannot confirm own PENDING collab → 403', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      initiatedBy: 'WORKER',
    });
    const workerToken = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    await h
      .request()
      .patch(`/api/collaborations/${collab.id}/status`)
      .set(...bearer(workerToken))
      .send({ status: 'CONFIRMED' })
      .expect(403);
  });

  test('TEST-COLLAB-073 / COLLAB-021 — responder confirms employer-initiated PENDING → 200', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      initiatedBy: 'EMPLOYER',
    });
    const workerToken = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    await h
      .request()
      .patch(`/api/collaborations/${collab.id}/status`)
      .set(...bearer(workerToken))
      .send({ status: 'CONFIRMED' })
      .expect(200);
  });

  test('TEST-COLLAB-073 / COLLAB-051 — non-party employer cannot transition another collab → 403', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employerA = await seedActiveEmployer(h.prisma);
    const employerB = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employerA.id,
      initiatedBy: 'EMPLOYER',
    });
    const tokenB = signAccessTokenFor(h, {
      accountId: employerB.id,
      email: employerB.email,
    });
    await h
      .request()
      .patch(`/api/collaborations/${collab.id}/status`)
      .set(...bearer(tokenB))
      .send({ status: 'CONFIRMED' })
      .expect(403);
  });

  // TEST-COLLAB-073 / COLLAB-021 — verification gate on PATCH status.
  // Was `.skip`'d until [COLLAB-073-001] closed (controller now binds
  // AccountStateGuard + RequiresVerifiedEmail to PATCH /:id/status, line 110).
  test('TEST-COLLAB-073 / COLLAB-021 — PENDING_EMAIL_VERIFICATION worker on PATCH → 403 EMAIL_NOT_VERIFIED', async () => {
    const worker = await seedPendingWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      initiatedBy: 'EMPLOYER',
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });
    const res = await h
      .request()
      .patch(`/api/collaborations/${collab.id}/status`)
      .set(...bearer(token))
      .send({ status: 'CONFIRMED' })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
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

describe('TEST-COLLAB-075 flag endpoint (COLLAB-040..043, COLLAB-051)', () => {
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

  test('TEST-COLLAB-075 / COLLAB-042 — party flags own collab → 200 + flag persisted', async () => {
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
      .post(`/api/collaborations/${collab.id}/flag`)
      .set(...bearer(token))
      .send({ reason: 'PAYMENT_LATE: cheque is two weeks late' })
      .expect(201);
    expect(res.body.flagged).toBe(true);
    expect(res.body.flag_reason).toBe('PAYMENT_LATE: cheque is two weeks late');
  });

  test('TEST-COLLAB-075 / COLLAB-051 — staff flags non-party collab → 200', async () => {
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
      .post(`/api/collaborations/${collab.id}/flag`)
      .set(...bearer(token))
      .send({ reason: 'OTHER: investigating' })
      .expect(201);
  });

  test('TEST-COLLAB-075 — non-party non-staff → 403', async () => {
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
      .post(`/api/collaborations/${collab.id}/flag`)
      .set(...bearer(token))
      .send({ reason: 'WORK_QUALITY' })
      .expect(403);
  });

  // Sibling assertion for the [COLLAB-073-001] fix — flag endpoint now
  // binds AccountStateGuard / RequiresVerifiedEmail.
  test('TEST-COLLAB-075 / COLLAB-001 — PENDING_EMAIL_VERIFICATION party on POST /flag → 403 EMAIL_NOT_VERIFIED', async () => {
    const worker = await seedPendingWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    const collab = await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });
    const res = await h
      .request()
      .post(`/api/collaborations/${collab.id}/flag`)
      .set(...bearer(token))
      .send({ reason: 'PAYMENT_LATE' })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('TEST-COLLAB-076 GET /collaborations/me filters and pagination (COLLAB-011)', () => {
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

  test('TEST-COLLAB-076 / COLLAB-011 — status filter narrows', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'PENDING',
    });
    await seedCollaboration(h.prisma, {
      workerId: worker.id,
      employerId: employer.id,
      status: 'CONFIRMED',
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const res = await h
      .request()
      .get('/api/collaborations/me?status=CONFIRMED')
      .set(...bearer(token))
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].status).toBe('CONFIRMED');
  });

  test('TEST-COLLAB-076 / COLLAB-011 — pagination round-trips and total is stable', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const employer = await seedActiveEmployer(h.prisma);
    for (let i = 0; i < 3; i += 1) {
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
    expect(Array.isArray(res.body.reviews)).toBe(true);
    expect('escrow_transaction' in res.body).toBe(true);
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

  test('TEST-COLLAB-078 — accept → convert-to-collaboration → row visible on GET /collaborations/me for both parties', async () => {
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
