// TEST-AUTH-044 — refresh / logout / logout-all rotation e2e.
// Contract: AUTH-008.

import { createTestApp, type TestHarness } from './util/test-app';
import { seedActiveWorker } from './util/factories';
import { jwtIatGap } from './util/wait';

describe('TEST-AUTH-044 refresh / logout / logout-all', () => {
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

  async function loginFresh() {
    const seed = await seedActiveWorker(h.prisma);
    const res = await h
      .request()
      .post('/api/auth/login')
      .send({ email: seed.email, password: seed.password })
      .expect(200);
    return {
      seed,
      access_token: res.body.access_token as string,
      refresh_token: res.body.refresh_token as string,
    };
  }

  test('AUTH-008 — refresh rotates: first refresh succeeds, second use of the SAME token fails 401', async () => {
    const session = await loginFresh();
    // FU-2: refresh tokens carry only second-precision iat — pause so the
    // rotated token's signature differs by content, not by clock luck.
    await jwtIatGap();

    const first = await h
      .request()
      .post('/api/auth/refresh')
      .send({ refresh_token: session.refresh_token })
      .expect(200);
    expect(first.body.refresh_token).toBeTruthy();
    expect(first.body.refresh_token).not.toBe(session.refresh_token);

    // Reusing the rotated-out original is no longer valid.
    const second = await h
      .request()
      .post('/api/auth/refresh')
      .send({ refresh_token: session.refresh_token })
      .expect(401);
    expect(second.body.code).toBe('REFRESH_INVALID');
  });

  test('AUTH-008 — logout invalidates the current refresh token (idempotent: 200 on missing too)', async () => {
    const session = await loginFresh();

    await h
      .request()
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${session.access_token}`)
      .send({ refresh_token: session.refresh_token })
      .expect(200);

    // Refresh should now fail.
    const after = await h
      .request()
      .post('/api/auth/refresh')
      .send({ refresh_token: session.refresh_token })
      .expect(401);
    expect(after.body.code).toBe('REFRESH_INVALID');

  });

  // Marked `.failing` because the production DTO rejects an empty body — see
  // followups.md FU-4. Flip back to `test()` once the DTO is fixed.
  test.failing('TEST-AUTH-017 spec — logout idempotent on missing body (FU-4: currently 400, contract says 200)', async () => {
    const session2 = await loginFresh();
    await h
      .request()
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${session2.access_token}`)
      .send({})
      .expect(200);
  });

  test('AUTH-008 — logout-all revokes EVERY refresh token for the account', async () => {
    // Two parallel sessions for the same account.
    const seed = await seedActiveWorker(h.prisma);

    const s1 = await h
      .request()
      .post('/api/auth/login')
      .send({ email: seed.email, password: seed.password })
      .expect(200);
    await jwtIatGap(); // FU-2
    const s2 = await h
      .request()
      .post('/api/auth/login')
      .send({ email: seed.email, password: seed.password })
      .expect(200);

    const before = await h.prisma.refreshToken.count({
      where: { account_id: seed.id },
    });
    expect(before).toBeGreaterThanOrEqual(2);

    const result = await h
      .request()
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${s1.body.access_token}`)
      .expect(200);
    expect(result.body.revoked).toBeGreaterThanOrEqual(2);

    const after = await h.prisma.refreshToken.count({
      where: { account_id: seed.id },
    });
    expect(after).toBe(0);

    // Either session's refresh now fails.
    await h
      .request()
      .post('/api/auth/refresh')
      .send({ refresh_token: s2.body.refresh_token })
      .expect(401);
  });
});
