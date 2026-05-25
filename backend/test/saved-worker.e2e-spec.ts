// E2E coverage for the Saved Workers feature.
//
// Boots the full Nest app against a Postgres Testcontainer. Mirrors
// saved-job.e2e-spec.ts for the reverse direction: employers bookmark
// workers. Verifies:
//   - employer can save / unsave a worker (idempotent)
//   - GET /saved-workers lists only the caller's saved workers
//   - non-employers (worker / anonymous) are rejected with 403 / 401
//   - GET /worker-profiles and GET /worker-profiles/:id surface `is_saved`
//     for the authenticated employer
//   - saving a missing worker → 404
//
// Note on id types: BigIntSerializationInterceptor converts BigInt → Number
// on the wire, so seeded.id (bigint) is compared as Number(seeded.id).

import {
  seedActiveEmployer,
  seedActiveWorker,
} from './util/factories';
import { signAccessTokenFor, bearer } from './util/auth-helpers';
import { createTestApp, type TestHarness } from './util/test-app';

describe('Saved Workers e2e', () => {
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

  test('employer saves a worker → appears in /saved-workers', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });

    await h
      .request()
      .post(`/api/saved-workers/${worker.id}`)
      .set(...bearer(token))
      .expect(200);

    const list = await h
      .request()
      .get('/api/saved-workers')
      .set(...bearer(token))
      .expect(200);

    expect(list.body.total).toBe(1);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].worker_profile.id).toBe(Number(worker.id));
  });

  test('saving the same worker twice is idempotent (200 both times, single row)', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });

    await h
      .request()
      .post(`/api/saved-workers/${worker.id}`)
      .set(...bearer(token))
      .expect(200);
    await h
      .request()
      .post(`/api/saved-workers/${worker.id}`)
      .set(...bearer(token))
      .expect(200);

    const list = await h
      .request()
      .get('/api/saved-workers')
      .set(...bearer(token))
      .expect(200);
    expect(list.body.total).toBe(1);
  });

  test('employer unsaves a worker → disappears from /saved-workers', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });

    await h
      .request()
      .post(`/api/saved-workers/${worker.id}`)
      .set(...bearer(token))
      .expect(200);
    await h
      .request()
      .delete(`/api/saved-workers/${worker.id}`)
      .set(...bearer(token))
      .expect(204);

    const list = await h
      .request()
      .get('/api/saved-workers')
      .set(...bearer(token))
      .expect(200);
    expect(list.body.total).toBe(0);
  });

  test('unsaving a never-saved worker is idempotent (204)', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });

    await h
      .request()
      .delete(`/api/saved-workers/${worker.id}`)
      .set(...bearer(token))
      .expect(204);
  });

  test('saving a missing worker → 404', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });

    await h
      .request()
      .post('/api/saved-workers/999999')
      .set(...bearer(token))
      .expect(404);
  });

  test('worker trying to save → 403 (employers only)', async () => {
    const worker = await seedActiveWorker(h.prisma);
    const otherWorker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: worker.id,
      email: worker.email,
    });

    await h
      .request()
      .post(`/api/saved-workers/${otherWorker.id}`)
      .set(...bearer(token))
      .expect(403);
  });

  test('anonymous request → 401 on save / list', async () => {
    const worker = await seedActiveWorker(h.prisma);

    await h.request().post(`/api/saved-workers/${worker.id}`).expect(401);
    await h.request().get('/api/saved-workers').expect(401);
  });

  test('GET /worker-profiles surfaces is_saved=true for the worker the employer saved', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const savedW = await seedActiveWorker(h.prisma);
    const otherW = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });

    await h
      .request()
      .post(`/api/saved-workers/${savedW.id}`)
      .set(...bearer(token))
      .expect(200);

    const list = await h
      .request()
      .get('/api/worker-profiles')
      .set(...bearer(token))
      .expect(200);

    const savedFromList = list.body.data.find(
      (it: { id: number }) => it.id === Number(savedW.id),
    );
    const otherFromList = list.body.data.find(
      (it: { id: number }) => it.id === Number(otherW.id),
    );
    expect(savedFromList).toBeDefined();
    expect(otherFromList).toBeDefined();
    expect(savedFromList.is_saved).toBe(true);
    expect(otherFromList.is_saved).toBe(false);
  });

  test('GET /worker-profiles/:id surfaces is_saved for the authed employer', async () => {
    const employer = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: employer.id,
      email: employer.email,
    });

    const beforeSave = await h
      .request()
      .get(`/api/worker-profiles/${worker.id}`)
      .set(...bearer(token))
      .expect(200);
    expect(beforeSave.body.is_saved).toBe(false);

    await h
      .request()
      .post(`/api/saved-workers/${worker.id}`)
      .set(...bearer(token))
      .expect(200);

    const afterSave = await h
      .request()
      .get(`/api/worker-profiles/${worker.id}`)
      .set(...bearer(token))
      .expect(200);
    expect(afterSave.body.is_saved).toBe(true);
  });

  test('GET /worker-profiles as anonymous → is_saved=false on every row', async () => {
    await seedActiveWorker(h.prisma);

    const list = await h.request().get('/api/worker-profiles').expect(200);
    for (const item of list.body.data as Array<{ is_saved: boolean }>) {
      expect(item.is_saved).toBe(false);
    }
  });

  test('saved list isolates per employer (employerA cannot see employerB saves)', async () => {
    const employerA = await seedActiveEmployer(h.prisma);
    const employerB = await seedActiveEmployer(h.prisma);
    const worker = await seedActiveWorker(h.prisma);
    const tokenA = signAccessTokenFor(h, {
      accountId: employerA.id,
      email: employerA.email,
    });
    const tokenB = signAccessTokenFor(h, {
      accountId: employerB.id,
      email: employerB.email,
    });

    await h
      .request()
      .post(`/api/saved-workers/${worker.id}`)
      .set(...bearer(tokenA))
      .expect(200);

    const listA = await h
      .request()
      .get('/api/saved-workers')
      .set(...bearer(tokenA))
      .expect(200);
    expect(listA.body.total).toBe(1);

    const listB = await h
      .request()
      .get('/api/saved-workers')
      .set(...bearer(tokenB))
      .expect(200);
    expect(listB.body.total).toBe(0);
  });
});
