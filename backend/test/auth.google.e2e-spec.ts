// TEST-AUTH-049 — Google OAuth callback e2e using the StubGoogleAuthGuard.
// Contract: AUTH-015-002, AUTH-015-006 (revised), Decisions Log 2026-04-26
// (intent flag, NO_GOOGLE_ACCOUNT, auto-link verified email, state signing).

import { createTestApp, type TestHarness } from './util/test-app';
import { enqueueGoogleProfile } from './util/stub-google.strategy';
import { TEST_PASSWORD, seedActiveWorker } from './util/factories';

async function buildState(
  h: TestHarness,
  intent: 'login' | 'register',
  role: 'WORKER' | 'EMPLOYER' = 'WORKER',
): Promise<string> {
  const res = await h
    .request()
    .get(
      `/api/auth/google/start?role=${role}&return_to=/profile&intent=${intent}`,
    )
    .expect(200);
  const url = new URL(res.body.redirect_url);
  return url.searchParams.get('state')!;
}

function parseRedirect(location: string): {
  url: URL;
  params: URLSearchParams;
} {
  const url = new URL(location);
  return { url, params: url.searchParams };
}

describe('TEST-AUTH-049 Google OAuth callback', () => {
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

  test('AUTH-015-002 — email_verified=true + new email + intent=register → ACTIVE account, NO verify mail', async () => {
    const state = await buildState(h, 'register', 'WORKER');
    enqueueGoogleProfile({
      googleId: 'gid_v_new',
      email: 'verified-new@example.com',
      emailVerified: true,
      displayName: 'Verified New',
    });

    const res = await h
      .request()
      .get(`/api/auth/google/callback?state=${encodeURIComponent(state)}`)
      .expect(302);

    const account = await h.prisma.account.findUnique({
      where: { email: 'verified-new@example.com' },
    });
    expect(account!.status).toBe('ACTIVE');
    expect(account!.email_verified_at).toBeInstanceOf(Date);
    expect(
      h.mail.latest('verified-new@example.com', 'verification'),
    ).toBeUndefined();
    expect(h.mail.latest('verified-new@example.com', 'welcome')).toBeDefined();

    // Redirect URL should carry tokens for the SPA to pick up.
    const { params } = parseRedirect(res.headers.location);
    expect(params.get('access_token')).toBeTruthy();
    expect(params.get('refresh_token')).toBeTruthy();
    expect(params.get('state')).toBe('ACTIVE');
  });

  test('AUTH-015-002 — email_verified=false + new email → PENDING account + verification mail sent', async () => {
    const state = await buildState(h, 'register', 'WORKER');
    enqueueGoogleProfile({
      googleId: 'gid_unverified',
      email: 'unverified@example.com',
      emailVerified: false,
      displayName: 'Unverified',
    });

    await h
      .request()
      .get(`/api/auth/google/callback?state=${encodeURIComponent(state)}`)
      .expect(302);

    const account = await h.prisma.account.findUnique({
      where: { email: 'unverified@example.com' },
    });
    expect(account!.status).toBe('PENDING_EMAIL_VERIFICATION');
    expect(account!.email_verified_at).toBeNull();
    expect(
      h.mail.latest('unverified@example.com', 'verification'),
    ).toBeDefined();
  });

  test('AUTH-015-006 (revised) — existing email + email_verified=true → AUTO-LINK + flip PENDING → ACTIVE on link', async () => {
    // Manually create a PENDING account with a password and no google_id.

    const bcrypt = require('bcrypt') as typeof import('bcrypt');
    const account = await h.prisma.account.create({
      data: {
        email: 'pending-link@example.com',
        password_hash: await bcrypt.hash(TEST_PASSWORD, 4),
        status: 'PENDING_EMAIL_VERIFICATION',
        client_profile: {
          create: {
            display_name: 'Pending Link',
            slug: 'pending-link-x',
            worker_profile: { create: {} },
          },
        },
      },
    });

    const state = await buildState(h, 'login', 'WORKER');
    enqueueGoogleProfile({
      googleId: 'gid_link',
      email: 'pending-link@example.com',
      emailVerified: true,
      displayName: 'Linker',
    });

    await h
      .request()
      .get(`/api/auth/google/callback?state=${encodeURIComponent(state)}`)
      .expect(302);

    const updated = await h.prisma.account.findUnique({
      where: { id: account.id },
    });
    expect(updated!.google_id).toBe('gid_link');
    expect(updated!.status).toBe('ACTIVE');
    expect(updated!.email_verified_at).toBeInstanceOf(Date);
  });

  test('AUTH-015-006 (revised) — existing email + email_verified=false → explicit-link redirect (error=ACCOUNT_EXISTS)', async () => {
    await seedActiveWorker(h.prisma, { email: 'live@example.com' });

    const state = await buildState(h, 'login', 'WORKER');
    enqueueGoogleProfile({
      googleId: 'gid_unverified_link',
      email: 'live@example.com',
      emailVerified: false,
      displayName: 'X',
    });

    const res = await h
      .request()
      .get(`/api/auth/google/callback?state=${encodeURIComponent(state)}`)
      .expect(302);

    const { params, url } = parseRedirect(res.headers.location);
    expect(url.pathname).toBe('/oauth/callback');
    expect(params.get('error')).toBe('ACCOUNT_EXISTS');
    expect(params.get('email')).toBe('live@example.com');
    expect(params.get('intent')).toBe('login');
  });

  test('Decisions Log 2026-04-26 (NO_GOOGLE_ACCOUNT) — intent=login + no account anywhere → redirect with error=NO_GOOGLE_ACCOUNT, no account created', async () => {
    const state = await buildState(h, 'login', 'WORKER');
    enqueueGoogleProfile({
      googleId: 'gid_unknown',
      email: 'unknown@example.com',
      emailVerified: true,
      displayName: 'Unknown',
    });

    const res = await h
      .request()
      .get(`/api/auth/google/callback?state=${encodeURIComponent(state)}`)
      .expect(302);

    const { params } = parseRedirect(res.headers.location);
    expect(params.get('error')).toBe('NO_GOOGLE_ACCOUNT');
    expect(params.get('intent')).toBe('login');

    const created = await h.prisma.account.findUnique({
      where: { email: 'unknown@example.com' },
    });
    expect(created).toBeNull();
  });

  test('Decisions Log 2026-04-26 (state signing) — tampering the signed state is rejected at the callback (defaults applied, attacker payload ignored)', async () => {
    // Build a tampered state that LOOKS valid but has a fake HMAC. The
    // callback should fall back to default role=WORKER, intent=login,
    // return_to=/profile — proving the signature check fired.
    const tamperedBody = Buffer.from(
      JSON.stringify({
        role: 'EMPLOYER',
        return_to: '//evil.com',
        intent: 'register',
      }),
      'utf8',
    ).toString('base64url');
    const fakeState = `${tamperedBody}.${'a'.repeat(64)}`;

    enqueueGoogleProfile({
      googleId: 'gid_tamper',
      email: 'tamper@example.com',
      emailVerified: true,
      displayName: 'Tamper',
    });

    const res = await h
      .request()
      .get(`/api/auth/google/callback?state=${encodeURIComponent(fakeState)}`)
      .expect(302);

    // Default intent=login + no account → NO_GOOGLE_ACCOUNT redirect, NOT
    // a register success. Proves the tampered "intent=register" was discarded.
    const { params } = parseRedirect(res.headers.location);
    expect(params.get('error')).toBe('NO_GOOGLE_ACCOUNT');
    // Default role=WORKER applied → the email was NOT silently provisioned as
    // an EMPLOYER account.
    const created = await h.prisma.account.findUnique({
      where: { email: 'tamper@example.com' },
    });
    expect(created).toBeNull();
  });
});
