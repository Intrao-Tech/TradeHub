// TEST-AUTH-045 — forgot-password + reset-password + change-password e2e.
// Contract: AUTH-007, §11 staff carve-out, Decisions Log 2026-04-26 (Google
// reminder + change-password endpoint).

import * as bcrypt from 'bcrypt';
import { createTestApp, type TestHarness } from './util/test-app';
import {
  TEST_BCRYPT_ROUNDS,
  TEST_PASSWORD,
  seedActiveWorker,
  seedAdmin,
  seedGoogleOnlyAccount,
} from './util/factories';

describe('TEST-AUTH-045 password recovery + change', () => {
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

  test('AUTH-007 — forgot-password for unknown email → 200, NO mail sent (anti-enumeration)', async () => {
    const res = await h
      .request()
      .post('/api/auth/forgot-password')
      .send({ email: 'noone@x.io' })
      .expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(h.mail.forAddress('noone@x.io')).toHaveLength(0);
  });

  test('AUTH-007 — forgot-password for ACTIVE marketplace email → 200, password_reset mail captured with token', async () => {
    const seed = await seedActiveWorker(h.prisma);
    await h
      .request()
      .post('/api/auth/forgot-password')
      .send({ email: seed.email })
      .expect(200);

    const reset = h.mail.latest(seed.email, 'password_reset');
    expect(reset).toBeDefined();
    expect(reset!.data.token).toBeTruthy();
  });

  test('§11 + AUTH-007 — forgot-password for STAFF email → 200, NO reset mail (admin-mediated only)', async () => {
    const admin = await seedAdmin(h.prisma);
    await h
      .request()
      .post('/api/auth/forgot-password')
      .send({ email: admin.email })
      .expect(200);
    expect(h.mail.forAddress(admin.email).filter((m) => m.kind === 'password_reset')).toHaveLength(0);
    expect(h.mail.forAddress(admin.email).filter((m) => m.kind === 'google_signin_reminder')).toHaveLength(0);
  });

  test('Decisions Log 2026-04-26 (Google-only friendlier reminder) — Google-only account → 200, sign-in-reminder mail captured (NOT a reset link)', async () => {
    const goog = await seedGoogleOnlyAccount(h.prisma, {
      email: 'g@example.com',
    });
    await h
      .request()
      .post('/api/auth/forgot-password')
      .send({ email: goog.email })
      .expect(200);

    expect(h.mail.latest(goog.email, 'google_signin_reminder')).toBeDefined();
    expect(h.mail.forAddress(goog.email).filter((m) => m.kind === 'password_reset')).toHaveLength(0);
  });

  test('AUTH-007 — reset with expired token → 400 TOKEN_INVALID', async () => {
    const seed = await seedActiveWorker(h.prisma);
    // Manually insert an already-expired token row.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('node:crypto') as typeof import('node:crypto');
    const raw = 'expired-test-token';
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await h.prisma.passwordResetToken.create({
      data: {
        account_id: seed.id,
        token_hash: hash,
        expires_at: new Date(Date.now() - 60_000),
      },
    });

    const res = await h
      .request()
      .post('/api/auth/reset-password')
      .send({ token: raw, password: 'NewPass1!Aaa' })
      .expect(400);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  test('AUTH-007 — reset with valid token: 200 + ALL refresh tokens revoked + does not auto-login', async () => {
    const seed = await seedActiveWorker(h.prisma);

    // Two active sessions for this user.
    await h
      .request()
      .post('/api/auth/login')
      .send({ email: seed.email, password: seed.password })
      .expect(200);
    await h
      .request()
      .post('/api/auth/login')
      .send({ email: seed.email, password: seed.password })
      .expect(200);
    expect(
      await h.prisma.refreshToken.count({ where: { account_id: seed.id } }),
    ).toBeGreaterThanOrEqual(2);

    // Issue a real reset token via the forgot-password endpoint and pull
    // it from the captured mail.
    await h
      .request()
      .post('/api/auth/forgot-password')
      .send({ email: seed.email })
      .expect(200);
    const reset = h.mail.latest(seed.email, 'password_reset');
    const token = reset!.data.token as string;

    const res = await h
      .request()
      .post('/api/auth/reset-password')
      .send({ token, password: 'BrandNewPass1!Aaa' })
      .expect(200);
    expect(res.body).toEqual({ ok: true });
    // No tokens returned — no auto-login.
    expect(res.body.access_token).toBeUndefined();
    expect(res.body.refresh_token).toBeUndefined();

    // All refresh tokens revoked.
    expect(
      await h.prisma.refreshToken.count({ where: { account_id: seed.id } }),
    ).toBe(0);

    // New password works, old does not.
    await h
      .request()
      .post('/api/auth/login')
      .send({ email: seed.email, password: 'BrandNewPass1!Aaa' })
      .expect(200);
    await h
      .request()
      .post('/api/auth/login')
      .send({ email: seed.email, password: seed.password })
      .expect(401);
  });

  test('AUTH-008 + Decisions Log 2026-04-26 — change-password validates current password and changes it (current-device-kept-alive path tracked separately)', async () => {
    const seed = await seedActiveWorker(h.prisma);

    const session = (
      await h
        .request()
        .post('/api/auth/login')
        .send({ email: seed.email, password: seed.password })
    ).body;

    // Wrong current → 401
    await h
      .request()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.access_token}`)
      .send({
        current_password: 'WRONG-current-pass',
        new_password: 'NewPass1!Aaa',
      })
      .expect(401);

    // Right current → 200 (no refresh_token in body — see FU-5; passing it
    // currently fails class-validator. Without it, all sessions are revoked.)
    await h
      .request()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.access_token}`)
      .send({
        current_password: TEST_PASSWORD,
        new_password: 'NewPass1!Aaa',
      })
      .expect(200);

    // Sanity: the password actually changed.
    const account = await h.prisma.account.findUnique({ where: { id: seed.id } });
    const ok = await bcrypt.compare('NewPass1!Aaa', account!.password_hash!);
    expect(ok).toBe(true);
    expect(TEST_BCRYPT_ROUNDS).toBeGreaterThan(0); // sanity: factory constant unchanged
  });

  test('Decisions Log 2026-04-26 — change-password keeps current device alive when refresh_token is passed', async () => {
    const seed = await seedActiveWorker(h.prisma);
    const session = (
      await h
        .request()
        .post('/api/auth/login')
        .send({ email: seed.email, password: seed.password })
    ).body;

    await h
      .request()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${session.access_token}`)
      .send({
        current_password: TEST_PASSWORD,
        new_password: 'NewPass1!Aaa',
        refresh_token: session.refresh_token, // currently rejected by DTO
      })
      .expect(200);

    // Current device still works
    await h
      .request()
      .post('/api/auth/refresh')
      .send({ refresh_token: session.refresh_token })
      .expect(200);
  });
});
