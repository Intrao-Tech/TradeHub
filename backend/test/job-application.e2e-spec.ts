// TEST-JOBS-080..086 — job-application e2e (JOBS-012, JOBS-013, JOBS-037, JOBS-039,
// E2E-1, E2E-3). Drives the application state machine end-to-end against a
// Postgres Testcontainer.

import {
  seedActiveEmployer,
  seedActiveWorker,
  seedJobApplication,
  seedJobPost,
  seedPendingWorker,
  seedPendingEmployer,
} from './util/factories';
import { signAccessTokenFor, bearer } from './util/auth-helpers';
import { createTestApp, type TestHarness } from './util/test-app';

describe('TEST-JOBS-080 / 086 apply lifecycle (E2E-1, E2E-3, JOBS-029, BE-JOBS-1)', () => {
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

  test('JOBS-012 / JOBS-037 — worker apply → employer reviewed → shortlisted → accepted → convert', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });

    const workerToken = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const employerToken = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });

    // Apply
    const apply = await h
      .request()
      .post(`/api/job-applications/jobs/${post.id}/apply`)
      .set(...bearer(workerToken))
      .send({ cover_message: 'I can start Monday', proposed_rate: 240 })
      .expect(201);
    expect(apply.body.status).toBe('PENDING');
    expect(apply.body.initiated_by).toBe('WORKER');
    const appId = apply.body.id;

    // Visible on /me
    const mine = await h
      .request()
      .get('/api/job-applications/me')
      .set(...bearer(workerToken))
      .expect(200);
    expect(mine.body.items).toHaveLength(1);

    // Visible on the post applicants list
    const list = await h
      .request()
      .get(`/api/job-applications/jobs/${post.id}`)
      .set(...bearer(employerToken))
      .expect(200);
    expect(list.body.items).toHaveLength(1);

    // Employer transitions
    for (const status of ['REVIEWED', 'SHORTLISTED', 'ACCEPTED'] as const) {
      const r = await h
        .request()
        .patch(`/api/job-applications/${appId}/status`)
        .set(...bearer(employerToken))
        .send({ status })
        .expect(200);
      expect(r.body.status).toBe(status);
      if (status === 'ACCEPTED') {
        expect(r.body.responded_at).not.toBeNull();
      }
    }

    // Convert to collaboration
    const collab = await h
      .request()
      .post(`/api/job-applications/${appId}/to-collaboration`)
      .set(...bearer(employerToken))
      .expect(201);
    expect(collab.body.id).toBeDefined();
  });

  test('JOBS-029 / BE-JOBS-1 — GET /job-posts/me exposes _count.applications', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    await seedJobApplication(h.prisma, {
      jobPostId: post.id,
      workerId: worker.id,
    });
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const res = await h
      .request()
      .get('/api/job-posts/me')
      .set(...bearer(token))
      .expect(200);
    expect(res.body.items[0]._count.applications).toBe(1);
  });
});

describe('TEST-JOBS-081 re-apply policy (JOBS-OQ-3)', () => {
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

  test('JOBS-OQ-3 — apply → withdraw → re-apply blocked with 409 ALREADY_APPLIED', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    const first = await h
      .request()
      .post(`/api/job-applications/jobs/${post.id}/apply`)
      .set(...bearer(token))
      .send({})
      .expect(201);

    // Worker withdraws
    await h
      .request()
      .patch(`/api/job-applications/${first.body.id}/status`)
      .set(...bearer(token))
      .send({ status: 'WITHDRAWN' })
      .expect(200);

    // Re-apply is blocked
    const conflict = await h
      .request()
      .post(`/api/job-applications/jobs/${post.id}/apply`)
      .set(...bearer(token))
      .send({})
      .expect(409);
    expect(conflict.body.code).toBe('ALREADY_APPLIED');
  });
});

describe('TEST-JOBS-082 status authorisation (JOBS-037, JOBS-044)', () => {
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

  test('JOBS-044 — worker WITHDRAW on own application succeeds', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const app = await seedJobApplication(h.prisma, {
      jobPostId: post.id,
      workerId: worker.id,
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    await h
      .request()
      .patch(`/api/job-applications/${app.id}/status`)
      .set(...bearer(token))
      .send({ status: 'WITHDRAWN' })
      .expect(200);
  });

  test('JOBS-037 — worker tries ACCEPTED / REJECTED / SHORTLISTED / REVIEWED on own → 403', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const app = await seedJobApplication(h.prisma, {
      jobPostId: post.id,
      workerId: worker.id,
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    for (const status of ['ACCEPTED', 'REJECTED', 'SHORTLISTED', 'REVIEWED']) {
      await h
        .request()
        .patch(`/api/job-applications/${app.id}/status`)
        .set(...bearer(token))
        .send({ status })
        .expect(403);
    }
  });

  test("JOBS-037 — employer A cannot mutate employer B's applications → 403", async () => {
    const employerA = await seedActiveEmployer(h.prisma);
    const employerB = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employerA.id });
    const app = await seedJobApplication(h.prisma, {
      jobPostId: post.id,
      workerId: worker.id,
    });
    const tokenB = signAccessTokenFor(h, {
      accountId: employerB.id,
      email: employerB.email,
    });
    await h
      .request()
      .patch(`/api/job-applications/${app.id}/status`)
      .set(...bearer(tokenB))
      .send({ status: 'REVIEWED' })
      .expect(403);
  });

  test('JOBS-037 — employer tries to WITHDRAW (worker-only verb) → 403', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const app = await seedJobApplication(h.prisma, {
      jobPostId: post.id,
      workerId: worker.id,
    });
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    await h
      .request()
      .patch(`/api/job-applications/${app.id}/status`)
      .set(...bearer(token))
      .send({ status: 'WITHDRAWN' })
      .expect(403);
  });
});

describe('TEST-JOBS-083 AccountStateGuard on application paths (JOBS-017)', () => {
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

  test('JOBS-017 — PENDING_EMAIL_VERIFICATION worker on apply → 403 EMAIL_NOT_VERIFIED', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedPendingWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });
    const res = await h
      .request()
      .post(`/api/job-applications/jobs/${post.id}/apply`)
      .set(...bearer(token))
      .send({})
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('JOBS-017 — PENDING_EMAIL_VERIFICATION employer on invite → 403 EMAIL_NOT_VERIFIED', async () => {
    const employer = await seedPendingEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });
    const res = await h
      .request()
      .post(`/api/job-applications/jobs/${post.id}/invite`)
      .set(...bearer(token))
      .send({ worker_id: Number(worker.id) })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('TEST-JOBS-084 invite-creates-conversation (JOBS-039)', () => {
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

  test('JOBS-039 — invite produces a conversation with both participants and a JOB_INVITATION message', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    await h
      .request()
      .post(`/api/job-applications/jobs/${post.id}/invite`)
      .set(...bearer(token))
      .send({
        worker_id: Number(worker.id),
        message: 'Interested in this brief?',
      })
      .expect(201);

    // Chat is collaboration-scoped now — the conversation shares the
    // collaboration PK and its parties are the collab's worker + employer.
    const convos = await h.prisma.conversation.findMany({
      include: { collaboration: true, messages: true },
    });
    expect(convos).toHaveLength(1);
    const collab = convos[0].collaboration;
    expect([collab.worker_id, collab.employer_id]).toEqual(
      expect.arrayContaining([employer.id, worker.id]),
    );
    // The conversation opens with a SYSTEM welcome message; the invite adds
    // a JOB_INVITATION message after it.
    const inviteMsg = convos[0].messages.find(
      (m) => m.message_type === 'JOB_INVITATION',
    );
    expect(inviteMsg).toBeDefined();
    expect(inviteMsg?.content).toBe('Interested in this brief?');
  });
});

describe('TEST-JOBS-085 apply-on-closed-post (JOBS-013, BE-JOBS-3)', () => {
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

  test('BE-JOBS-3 — apply on CLOSED post → 400 JOB_CLOSED', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, {
      employerId: employer.id,
      status: 'CLOSED',
    });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    const res = await h
      .request()
      .post(`/api/job-applications/jobs/${post.id}/apply`)
      .set(...bearer(token))
      .send({})
      .expect(400);
    expect(res.body.code).toBe('JOB_CLOSED');
  });
});
