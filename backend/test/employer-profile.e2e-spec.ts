// TEST-PROF-072 — employer-profile e2e (PROF-013).

import { createTestApp, type TestHarness } from './util/test-app';
import {
  seedActiveEmployer,
  seedActiveWorker,
} from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';

describe('TEST-PROF-072 PATCH /employer-profiles/me (PROF-013)', () => {
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

  test('PROF-013 — employer fields persist (company_name, company_number, team_size)', async () => {
    const seed = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });

    const res = await h
      .request()
      .patch('/api/employer-profiles/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_name: 'Acme Build Ltd',
        company_number: '12345678',
        team_size: 12,
      })
      .expect(200);

    expect(res.body.company_name).toBe('Acme Build Ltd');
    expect(res.body.company_number).toBe('12345678');
    expect(res.body.team_size).toBe(12);
  });

  test('PROF-013 — worker cannot patch employer-profile route (cross-role rejected)', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    await h
      .request()
      .patch('/api/employer-profiles/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ company_name: 'Should not work' })
      .expect((res) => {
        if (res.status >= 200 && res.status < 300) {
          throw new Error('Worker account wrote into an employer field');
        }
      });
  });
});
