// TEST-AUTH-042 — email verification e2e.
// Contract: AUTH-006, AUTH-015-003, Decisions Log 2026-04-26 StrictMode
// double-mount fix (server-side: error code is structured, idempotent on
// already-ACTIVE).

import { createTestApp, type TestHarness } from './util/test-app';
import { TEST_PASSWORD } from './util/factories';

describe('TEST-AUTH-042 verify-email/send + verify-email/confirm', () => {
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

  async function registerAndGetToken(email: string): Promise<string> {
    await h
      .request()
      .post('/api/auth/register')
      .send({
        email,
        password: TEST_PASSWORD,
        role: 'WORKER',
        first_name: 'V',
        surname: 'V',
      })
      .expect(201);
    const verification = h.mail.latest(email, 'verification');
    expect(verification).toBeDefined();
    const token = verification!.data.token as string;
    expect(token).toBeTruthy();
    return token;
  }

  test('AUTH-006 — verify-email/send always returns 200 (anti-enumeration), even for unknown email', async () => {
    const res = await h
      .request()
      .post('/api/auth/verify-email/send')
      .send({ email: 'noone@x.io' })
      .expect(200);
    expect(res.body).toEqual({ ok: true });
    // No mail captured for unknown address — silent no-op.
    expect(h.mail.forAddress('noone@x.io')).toHaveLength(0);
  });

  test('AUTH-006 + AUTH-015-003 — verify-email/confirm flips PENDING → ACTIVE, sends welcome mail, returns access tokens', async () => {
    const email = 'confirm@example.com';
    const token = await registerAndGetToken(email);

    const res = await h
      .request()
      .post('/api/auth/verify-email/confirm')
      .send({ token })
      .expect(200);

    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.account.verification_state).toBe('ACTIVE');

    const account = await h.prisma.account.findUnique({ where: { email } });
    expect(account!.status).toBe('ACTIVE');
    expect(account!.email_verified_at).toBeInstanceOf(Date);

    expect(h.mail.latest(email, 'welcome')).toBeDefined();
  });

  test('AUTH-006 — second confirm with the same token returns TOKEN_INVALID', async () => {
    const email = 'reuse@example.com';
    const token = await registerAndGetToken(email);

    await h
      .request()
      .post('/api/auth/verify-email/confirm')
      .send({ token })
      .expect(200);

    const res = await h
      .request()
      .post('/api/auth/verify-email/confirm')
      .send({ token })
      .expect(400);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  test('Decisions Log 2026-04-26 (StrictMode double-mount fix) — error body always carries structured `code` so the SPA can distinguish error states', async () => {
    // Hit the endpoint with an unknown token — the SPA was previously seeing
    // a stripped error body from the GlobalExceptionFilter and could not
    // distinguish "expired token" from "double-fired effect". This regression
    // guard asserts the structured code is present on the error body so the
    // SPA's useRef-guarded effect can branch correctly.
    //
    // Note: the DTO enforces MinLength(16) on `token` (see followups.md FU-3),
    // so we send a 32-char garbage string to bypass class-validator and reach
    // the service-level TOKEN_INVALID branch.
    const res = await h
      .request()
      .post('/api/auth/verify-email/confirm')
      .send({ token: 'bogus-token-padding-padding-1234' })
      .expect(400);
    expect(res.body.code).toBe('TOKEN_INVALID');
    expect(typeof res.body.message).toBe('string');
  });
});
