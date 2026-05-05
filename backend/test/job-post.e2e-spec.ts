// TEST-JOBS-070..073, 087 — job-post e2e (JOBS-002..JOBS-031, JOBS-008..JOBS-013).
//
// Boots the full Nest app against a Postgres Testcontainer. Each test seeds
// the rows it needs through `seedActiveEmployer / seedJobPost` and drives
// HTTP via Supertest. Cites the JOBS-NNN clause it guards.

import {
  seedActiveEmployer,
  seedActiveWorker,
  seedJobPost,
  seedPendingEmployer,
  seedSpecialisation,
  seedTag,
} from './util/factories';
import { signAccessTokenFor, bearer } from './util/auth-helpers';
import { createTestApp, type TestHarness } from './util/test-app';

describe('TEST-JOBS-070 / 071 job-post CRUD + ownership', () => {
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

  test('JOBS-014 / JOBS-018 / JOBS-030 / JOBS-031 — owner CRUD lifecycle', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const spec = await seedSpecialisation(h.prisma, 'Plumbing');
    const tag = await seedTag(h.prisma, 'Loft Conversion');

    // Create
    const created = await h
      .request()
      .post('/api/job-posts')
      .set(...bearer(token))
      .send({
        title: 'Wire two-bed flat',
        description: 'First fix',
        pay_type: 'DAY_RATE',
        day_rate_min: 200,
        day_rate_max: 280,
        postcode_area: 'SW19',
        specialisation_ids: [spec.id],
        tag_ids: [tag.id],
      })
      .expect(201);

    const jobId = created.body.id;
    expect(created.body.title).toBe('Wire two-bed flat');
    expect(created.body.specialisations).toHaveLength(1);
    expect(created.body.specialisations[0].specialisation.id).toBe(spec.id);

    // Edit
    await h
      .request()
      .patch(`/api/job-posts/${jobId}`)
      .set(...bearer(token))
      .send({ title: 'Wire two-bed flat (updated)' })
      .expect(200);

    const reread = await h.request().get(`/api/job-posts/${jobId}`).expect(200);
    expect(reread.body.title).toBe('Wire two-bed flat (updated)');

    // Close → hidden from default list (frontend appends ?status=OPEN)
    await h
      .request()
      .patch(`/api/job-posts/${jobId}`)
      .set(...bearer(token))
      .send({ status: 'CLOSED' })
      .expect(200);

    const openOnly = await h
      .request()
      .get('/api/job-posts?status=OPEN')
      .expect(200);
    expect(
      openOnly.body.items.find((j: { id: string }) => j.id === jobId),
    ).toBeUndefined();

    // Reopen → visible again
    await h
      .request()
      .patch(`/api/job-posts/${jobId}`)
      .set(...bearer(token))
      .send({ status: 'OPEN' })
      .expect(200);

    // Delete (zero applications) → 404 on subsequent GET
    await h
      .request()
      .delete(`/api/job-posts/${jobId}`)
      .set(...bearer(token))
      .expect(200);
    await h.request().get(`/api/job-posts/${jobId}`).expect(404);
  });

  test("JOBS-020 — Employer A cannot edit Employer B's post → 403", async () => {
    const ownerA = await seedActiveEmployer(h.prisma);
    const ownerB = await seedActiveEmployer(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: ownerA.id });
    const tokenB = signAccessTokenFor(h, {
      accountId: ownerB.id,
      email: ownerB.email,
    });
    await h
      .request()
      .patch(`/api/job-posts/${post.id}`)
      .set(...bearer(tokenB))
      .send({ title: 'evil' })
      .expect(403);
    await h
      .request()
      .delete(`/api/job-posts/${post.id}`)
      .set(...bearer(tokenB))
      .expect(403);
  });

  test('JOBS-031 — owner DELETE on a post with applications → 409 HAS_APPLICATIONS', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    await h.prisma.jobApplication.create({
      data: {
        job_post_id: post.id,
        worker_id: worker.id,
        initiated_by: 'WORKER',
      },
    });
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });
    const res = await h
      .request()
      .delete(`/api/job-posts/${post.id}`)
      .set(...bearer(token))
      .expect(409);
    expect(res.body.code).toBe('HAS_APPLICATIONS');
    // post still exists
    await h.request().get(`/api/job-posts/${post.id}`).expect(200);
  });

  test('JOBS-014 — worker token on POST /job-posts → 403 (RolesGuard)', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });
    await h
      .request()
      .post('/api/job-posts')
      .set(...bearer(token))
      .send({ title: 'Nope', pay_type: 'DAY_RATE' })
      .expect(403);
  });
});

describe('TEST-JOBS-072 AccountStateGuard on /job-posts (JOBS-017)', () => {
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

  test('JOBS-017 — PENDING_EMAIL_VERIFICATION employer → 403 EMAIL_NOT_VERIFIED', async () => {
    const employer = await seedPendingEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });
    const res = await h
      .request()
      .post('/api/job-posts')
      .set(...bearer(token))
      .send({ title: 'Need sparks', pay_type: 'DAY_RATE' })
      .expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('TEST-JOBS-073 query filters end-to-end (JOBS-002 / 003 / 005)', () => {
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

  test('JOBS-002 / 003 / 005 — filters narrow correctly; pagination is stable', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const plumbing = await seedSpecialisation(h.prisma, 'Plumbing');
    const electrical = await seedSpecialisation(h.prisma, 'Electrical');
    const urgentTag = await seedTag(h.prisma, 'Urgent');

    await seedJobPost(h.prisma, {
      employerId: employer.id,
      title: 'Plumber wanted',
      postcodeArea: 'SW19',
      specialisationIds: [plumbing.id],
      isUrgent: true,
      tagIds: [urgentTag.id],
    });
    await seedJobPost(h.prisma, {
      employerId: employer.id,
      title: 'Sparks needed',
      postcodeArea: 'EC2A',
      specialisationIds: [electrical.id],
    });
    await seedJobPost(h.prisma, {
      employerId: employer.id,
      title: 'Plumber for kitchen',
      postcodeArea: 'NW1',
      specialisationIds: [plumbing.id],
      status: 'CLOSED',
    });
    await seedJobPost(h.prisma, {
      employerId: employer.id,
      title: 'Generic builder',
      postcodeArea: 'SW19',
    });
    await seedJobPost(h.prisma, {
      employerId: employer.id,
      title: 'Carpenter',
      postcodeArea: 'EC2A',
    });

    // search filter (case-insensitive); status=ALL to opt out of the
    // default-OPEN filter (JOBS-002) so the CLOSED "Plumber for kitchen"
    // row appears too.
    const search = await h
      .request()
      .get('/api/job-posts?search=PLUMBER&status=ALL')
      .expect(200);
    const titles = search.body.items.map((j: { title: string }) => j.title);
    expect(titles).toEqual(
      expect.arrayContaining(['Plumber wanted', 'Plumber for kitchen']),
    );

    // postcode_area exact (default OPEN — both SW19 rows are OPEN)
    const sw19 = await h
      .request()
      .get('/api/job-posts?postcode_area=SW19')
      .expect(200);
    expect(sw19.body.items).toHaveLength(2);

    // specialisation_id join — default-OPEN strips the CLOSED plumbing row.
    const plumbersOnly = await h
      .request()
      .get(`/api/job-posts?specialisation_id=${plumbing.id}`)
      .expect(200);
    expect(plumbersOnly.body.items).toHaveLength(1);

    // tag_id join + urgent flag
    const urgent = await h
      .request()
      .get(`/api/job-posts?is_urgent=true`)
      .expect(200);
    expect(urgent.body.items).toHaveLength(1);
    expect(urgent.body.items[0].title).toBe('Plumber wanted');

    // pagination is stable
    const page1 = await h
      .request()
      .get('/api/job-posts?page=1&limit=2')
      .expect(200);
    const page2 = await h
      .request()
      .get('/api/job-posts?page=2&limit=2')
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page2.body.items).toHaveLength(2);
    const pageIds = new Set([
      ...page1.body.items.map((j: { id: string }) => j.id),
      ...page2.body.items.map((j: { id: string }) => j.id),
    ]);
    expect(pageIds.size).toBe(4);
  });
});

describe('TEST-JOBS-087 anonymous browse', () => {
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

  test('JOBS-008 — GET /job-posts and /job-posts/:id with no auth → 200 for OPEN; 200 for CLOSED (with status); 404 for missing', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const open = await seedJobPost(h.prisma, { employerId: employer.id });
    const closed = await seedJobPost(h.prisma, {
      employerId: employer.id,
      status: 'CLOSED',
    });

    const list = await h
      .request()
      .get('/api/job-posts?status=OPEN')
      .expect(200);
    const listIds = list.body.items.map((j: { id: unknown }) => String(j.id));
    expect(listIds).toContain(open.id.toString());
    expect(listIds).not.toContain(closed.id.toString());

    const detailOpen = await h
      .request()
      .get(`/api/job-posts/${open.id}`)
      .expect(200);
    expect(detailOpen.body.status).toBe('OPEN');

    const detailClosed = await h
      .request()
      .get(`/api/job-posts/${closed.id}`)
      .expect(200);
    expect(detailClosed.body.status).toBe('CLOSED');

    await h.request().get('/api/job-posts/9999999').expect(404);
  });
});
