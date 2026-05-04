// TEST-PROF-080 — public profile reads (PROF-001..PROF-008, PROF-258 edge case).

import { createTestApp, type TestHarness } from './util/test-app';
import {
  seedActiveEmployer,
  seedActiveWorker,
  seedDeactivatedAccount,
  seedWorkerWithPortfolio,
} from './util/factories';

describe('TEST-PROF-080 public profile reads (PROF-001..PROF-008)', () => {
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

  test('PROF-001 — GET /worker-profiles/:id reachable without auth', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const res = await h.request().get(`/api/worker-profiles/${seed.id}`).expect(200);
    expect(String(res.body.id)).toBe(String(seed.id));
    // Public response must include the consumer-visible fields the SPA renders.
    expect(res.body.client_profile).toBeDefined();
  });

  test('PROF-002 — GET /employer-profiles/:id reachable without auth', async () => {
    const seed = await seedActiveEmployer(h.prisma);
    const res = await h.request().get(`/api/employer-profiles/${seed.id}`).expect(200);
    expect(String(res.body.id)).toBe(String(seed.id));
  });

  test('PROF-003 — GET /client-profiles/:slug reachable without auth', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const profile = await h.prisma.clientProfile.findUnique({
      where: { id: seed.id },
    });
    const res = await h
      .request()
      .get(`/api/client-profiles/${profile?.slug}`)
      .expect(200);
    expect(res.body.slug).toBe(profile?.slug);
  });

  test('PROF-004 — GET /client-profiles directory reachable without auth', async () => {
    await seedActiveWorker(h.prisma);
    const res = await h.request().get('/api/client-profiles').expect(200);
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('PROF-001 — GET /portfolio/worker/:workerId reachable without auth', async () => {
    const seed = await seedWorkerWithPortfolio(h.prisma);
    const res = await h
      .request()
      .get(`/api/portfolio/worker/${seed.workerId}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('PROF-258 — deactivated worker profile fetched by id returns 404 (privacy)', async () => {
    const seed = await seedDeactivatedAccount(h.prisma);
    const res = await h.request().get(`/api/worker-profiles/${seed.id}`);
    expect(res.status).toBe(404);
  });
});
