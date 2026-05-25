// E2E coverage for the Saved Jobs feature.
//
// Boots the full Nest app against a Postgres Testcontainer. Verifies:
//   - worker can save / unsave a job (idempotent)
//   - GET /saved-jobs lists only the caller's saved posts
//   - non-workers (employer / anonymous) are rejected with 403 / 401
//   - GET /job-posts and GET /job-posts/:id surface `is_saved` for the
//     authenticated worker
//   - saving a missing job → 404
//
// Note on id types: BigIntSerializationInterceptor converts BigInt → Number
// on the wire, so seeded.id (bigint) is compared as Number(seeded.id).

import {
  seedActiveEmployer,
  seedActiveWorker,
  seedJobPost,
} from './util/factories';
import { signAccessTokenFor, bearer } from './util/auth-helpers';
import { createTestApp, type TestHarness } from './util/test-app';

describe('Saved Jobs e2e', () => {
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

  test('worker saves a job → appears in /saved-jobs', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    await h
      .request()
      .post(`/api/saved-jobs/${post.id}`)
      .set(...bearer(token))
      .expect(200);

    const list = await h
      .request()
      .get('/api/saved-jobs')
      .set(...bearer(token))
      .expect(200);

    expect(list.body.total).toBe(1);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].job_post.id).toBe(Number(post.id));
  });

  test('saving the same job twice is idempotent (200 both times, single row)', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    await h
      .request()
      .post(`/api/saved-jobs/${post.id}`)
      .set(...bearer(token))
      .expect(200);
    await h
      .request()
      .post(`/api/saved-jobs/${post.id}`)
      .set(...bearer(token))
      .expect(200);

    const list = await h
      .request()
      .get('/api/saved-jobs')
      .set(...bearer(token))
      .expect(200);
    expect(list.body.total).toBe(1);
  });

  test('worker unsaves a job → disappears from /saved-jobs', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    await h
      .request()
      .post(`/api/saved-jobs/${post.id}`)
      .set(...bearer(token))
      .expect(200);
    await h
      .request()
      .delete(`/api/saved-jobs/${post.id}`)
      .set(...bearer(token))
      .expect(204);

    const list = await h
      .request()
      .get('/api/saved-jobs')
      .set(...bearer(token))
      .expect(200);
    expect(list.body.total).toBe(0);
  });

  test('unsaving a never-saved job is idempotent (204)', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    await h
      .request()
      .delete(`/api/saved-jobs/${post.id}`)
      .set(...bearer(token))
      .expect(204);
  });

  test('saving a missing job → 404', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    await h
      .request()
      .post('/api/saved-jobs/999999')
      .set(...bearer(token))
      .expect(404);
  });

  test('employer trying to save → 403 (workers only)', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });

    await h
      .request()
      .post(`/api/saved-jobs/${post.id}`)
      .set(...bearer(token))
      .expect(403);
  });

  test('anonymous request → 401 on save / list', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });

    await h.request().post(`/api/saved-jobs/${post.id}`).expect(401);
    await h.request().get('/api/saved-jobs').expect(401);
  });

  test('GET /job-posts surfaces is_saved=true for the worker who saved it', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const savedPost = await seedJobPost(h.prisma, { employerId: employer.id });
    const otherPost = await seedJobPost(h.prisma, { employerId: employer.id });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    await h
      .request()
      .post(`/api/saved-jobs/${savedPost.id}`)
      .set(...bearer(token))
      .expect(200);

    const list = await h
      .request()
      .get('/api/job-posts')
      .set(...bearer(token))
      .expect(200);

    const savedFromList = list.body.items.find(
      (it: { id: number }) => it.id === Number(savedPost.id),
    );
    const otherFromList = list.body.items.find(
      (it: { id: number }) => it.id === Number(otherPost.id),
    );
    expect(savedFromList).toBeDefined();
    expect(otherFromList).toBeDefined();
    expect(savedFromList.is_saved).toBe(true);
    expect(otherFromList.is_saved).toBe(false);
  });

  test('GET /job-posts/:id surfaces is_saved for the authed worker', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    const beforeSave = await h
      .request()
      .get(`/api/job-posts/${post.id}`)
      .set(...bearer(token))
      .expect(200);
    expect(beforeSave.body.is_saved).toBe(false);

    await h
      .request()
      .post(`/api/saved-jobs/${post.id}`)
      .set(...bearer(token))
      .expect(200);

    const afterSave = await h
      .request()
      .get(`/api/job-posts/${post.id}`)
      .set(...bearer(token))
      .expect(200);
    expect(afterSave.body.is_saved).toBe(true);
  });

  test('GET /job-posts as anonymous → is_saved=false on every row', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    await seedJobPost(h.prisma, { employerId: employer.id });

    const list = await h.request().get('/api/job-posts').expect(200);
    for (const item of list.body.items as Array<{ is_saved: boolean }>) {
      expect(item.is_saved).toBe(false);
    }
  });

  test('saved list isolates per worker (workerA cannot see workerB saves)', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const workerA = await seedActiveWorker(h.prisma);
    const workerB = await seedActiveWorker(h.prisma);
    const post = await seedJobPost(h.prisma, { employerId: employer.id });
    const tokenA = signAccessTokenFor(h, {
      accountId: workerA.id,
      email: workerA.email,
    });
    const tokenB = signAccessTokenFor(h, {
      accountId: workerB.id,
      email: workerB.email,
    });

    await h
      .request()
      .post(`/api/saved-jobs/${post.id}`)
      .set(...bearer(tokenA))
      .expect(200);

    const listA = await h
      .request()
      .get('/api/saved-jobs')
      .set(...bearer(tokenA))
      .expect(200);
    expect(listA.body.total).toBe(1);

    const listB = await h
      .request()
      .get('/api/saved-jobs')
      .set(...bearer(tokenB))
      .expect(200);
    expect(listB.body.total).toBe(0);
  });
});
