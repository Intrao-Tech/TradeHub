// TEST-AUTH-047 — StaffHostMiddleware e2e.
// Contract: AUTH-016-002 (Origin OR Host gate, 404 otherwise).

import {
  createTestApp,
  DEFAULT_MARKETPLACE_ORIGIN,
  DEFAULT_STAFF_HOST,
  DEFAULT_STAFF_ORIGIN,
  type TestHarness,
} from './util/test-app';
import { seedAdmin } from './util/factories';

describe('TEST-AUTH-047 staff-host gate (AUTH-016-002)', () => {
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

  test('AUTH-016-002 — request from MARKETPLACE Origin to /auth/staff/login → 404', async () => {
    const admin = await seedAdmin(h.prisma);
    await h
      .request()
      .post('/api/auth/staff/login')
      .set('Origin', DEFAULT_MARKETPLACE_ORIGIN)
      .send({ email: admin.email, password: admin.password })
      .expect(404);
  });

  test('AUTH-016-002 — request from STAFF Origin to /auth/staff/login → 200 (with valid creds)', async () => {
    const admin = await seedAdmin(h.prisma);
    const res = await h
      .request()
      .post('/api/auth/staff/login')
      .set('Origin', DEFAULT_STAFF_ORIGIN)
      .send({ email: admin.email, password: admin.password })
      .expect(200);
    expect(res.body.account.is_staff).toBe(true);
  });

  test('AUTH-016-002 — request with matching Host header (curl path) → 200', async () => {
    const admin = await seedAdmin(h.prisma);
    const res = await h
      .request()
      .post('/api/auth/staff/login')
      .set('Host', DEFAULT_STAFF_HOST)
      // No Origin header — proves the Host fallback path works.
      .send({ email: admin.email, password: admin.password })
      .expect(200);
    expect(res.body.account.is_staff).toBe(true);
  });
});
