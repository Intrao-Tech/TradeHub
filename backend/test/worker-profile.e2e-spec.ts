// TEST-PROF-071 — worker-profile e2e (PROF-012, PROF-014, PROF-015).

import { createTestApp, type TestHarness } from './util/test-app';
import {
  seedActiveEmployer,
  seedActiveWorker,
} from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';

describe('TEST-PROF-071 PATCH /worker-profiles/me (PROF-012, PROF-015)', () => {
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

  test('PROF-012 — worker fields persist (years_experience, day_rate_min/max, is_available)', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });

    const res = await h
      .request()
      .patch('/api/worker-profiles/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        years_experience: 7,
        day_rate_min: 200,
        day_rate_max: 350,
        is_available: false,
      })
      .expect(200);
    expect(res.body.years_experience).toBe(7);
    expect(Number(res.body.day_rate_min)).toBe(200);
    expect(Number(res.body.day_rate_max)).toBe(350);
    expect(res.body.is_available).toBe(false);
  });

  test('PROF-015 — languages array of ISO 639-1 codes persists', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });

    const res = await h
      .request()
      .patch('/api/worker-profiles/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ languages: ['en', 'pl', 'ro'] })
      .expect(200);
    expect(res.body.languages).toEqual(['en', 'pl', 'ro']);
  });

  test('PROF-015 — invalid language codes rejected by DTO regex (`^[a-z]{2}$`)', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    await h
      .request()
      .patch('/api/worker-profiles/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ languages: ['English'] })
      .expect(400);
  });

  test('PROF-012 — employer cannot patch worker-profile route (cross-role rejected)', async () => {
    const seed = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    // The route patches `worker_profile` for the user's own client_profile.
    // An employer-only account has no worker_profile row, so the service's
    // findUnique-update path surfaces a 404, not a permissive write.
    await h
      .request()
      .patch('/api/worker-profiles/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ years_experience: 1 })
      .expect((res) => {
        if (res.status >= 200 && res.status < 300) {
          throw new Error(
            'Employer account should not be able to write worker fields',
          );
        }
      });
  });
});
