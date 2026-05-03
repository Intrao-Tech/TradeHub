// TEST-AUTH-043 — login e2e.
// Contract: AUTH-004, AUTH-014-001, AUTH-014-002 routing flags, Decisions Log
// 2026-04-26 (GlobalExceptionFilter body merge for EMAIL_NOT_VERIFIED).

import { createTestApp, type TestHarness } from './util/test-app';
import {
  TEST_PASSWORD,
  seedActiveWorker,
  seedDeactivatedWorker,
  seedPendingWorker,
} from './util/factories';

describe('TEST-AUTH-043 POST /auth/login', () => {
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

  test('AUTH-014-001 — ACTIVE worker login: 200 with role flags + verification_state=ACTIVE', async () => {
    const seed = await seedActiveWorker(h.prisma);

    const res = await h
      .request()
      .post('/api/auth/login')
      .send({ email: seed.email, password: seed.password })
      .expect(200);

    expect(res.body.account).toMatchObject({
      email: seed.email,
      is_worker: true,
      is_employer: false,
      is_staff: false,
      verification_state: 'ACTIVE',
    });
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
  });

  test('Decisions Log 2026-04-26 (body merge) — PENDING login returns 403 with code:EMAIL_NOT_VERIFIED + tokens still in body', async () => {
    const seed = await seedPendingWorker(h.prisma);

    const res = await h
      .request()
      .post('/api/auth/login')
      .send({ email: seed.email, password: seed.password })
      .expect(403);

    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(res.body.email).toBe(seed.email);
    // Tokens are present so the SPA can call /verify-email/send.
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
  });

  test('AUTH-002 — DEACTIVATED login → 403 ACCOUNT_DEACTIVATED, no tokens issued', async () => {
    const seed = await seedDeactivatedWorker(h.prisma);

    const res = await h
      .request()
      .post('/api/auth/login')
      .send({ email: seed.email, password: seed.password })
      .expect(403);

    expect(res.body.code).toBe('ACCOUNT_DEACTIVATED');
    expect(res.body.access_token).toBeUndefined();
    expect(res.body.refresh_token).toBeUndefined();
  });

  test('AUTH-004 — bad password returns the same INVALID_CREDENTIALS shape as unknown email (no enumeration oracle)', async () => {
    const seed = await seedActiveWorker(h.prisma);

    const wrong = await h
      .request()
      .post('/api/auth/login')
      .send({ email: seed.email, password: 'wrong-password!A1' })
      .expect(401);
    const unknown = await h
      .request()
      .post('/api/auth/login')
      .send({ email: 'no-such@x.io', password: TEST_PASSWORD })
      .expect(401);

    // Same code, same message — bodies are identical except for the
    // timestamp the filter stamps in.
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  test('AUTH-014-001 — successful login bumps account.last_login_at', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const before = await h.prisma.account.findUnique({ where: { id: seed.id } });
    expect(before!.last_login_at).toBeNull();

    await h
      .request()
      .post('/api/auth/login')
      .send({ email: seed.email, password: seed.password })
      .expect(200);

    const after = await h.prisma.account.findUnique({ where: { id: seed.id } });
    expect(after!.last_login_at).toBeInstanceOf(Date);
  });
});
