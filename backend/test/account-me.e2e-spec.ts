// TEST-PROF-081 — GET /account/me shape (PROF-051).

import { createTestApp, type TestHarness } from './util/test-app';
import {
  seedActiveEmployer,
  seedActiveWorker,
  seedPendingWorker,
} from './util/factories';
import { signAccessTokenFor } from './util/auth-helpers';

describe('TEST-PROF-081 GET /account/me (PROF-051)', () => {
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

  test('PROF-051 — ACTIVE worker response includes the shape `useAccountMe` consumes', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const res = await h
      .request()
      .get('/api/account/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.email).toBe(seed.email);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.email_verified_at).not.toBeNull();
    expect(res.body.client_profile).toBeDefined();
    expect(res.body.client_profile.worker_profile).toBeDefined();
    expect(res.body.client_profile.employer_profile).toBeNull();
    expect(res.body.staff_member).toBeNull();
  });

  test('PROF-051 — ACTIVE employer response surfaces `employer_profile`, no `worker_profile`', async () => {
    const seed = await seedActiveEmployer(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
    });
    const res = await h
      .request()
      .get('/api/account/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.client_profile.worker_profile).toBeNull();
    expect(res.body.client_profile.employer_profile).toBeDefined();
  });

  test('PROF-051 — PENDING_EMAIL_VERIFICATION account is allowed past AccountStateGuard (Auth contract §3) and shape stable', async () => {
    const seed = await seedPendingWorker(h.prisma);
    const token = signAccessTokenFor(h, {
      accountId: seed.id,
      email: seed.email,
      verificationState: 'PENDING_EMAIL_VERIFICATION',
    });
    const res = await h
      .request()
      .get('/api/account/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.status).toBe('PENDING_EMAIL_VERIFICATION');
    expect(res.body.email_verified_at).toBeNull();
    expect(res.body.client_profile.worker_profile).toBeDefined();
  });
});
