// TEST-AUTH-020 — Google OAuth state signing.
// Source under test: AuthController.buildGoogleStart + AuthController.googleCallback.
// Contract: Decisions Log 2026-04-26 ("Google OAuth state is signed by /auth/google/start"):
// the SPA does not have JWT_SECRET, so the BACKEND signs `state`. Tampering
// is rejected at the callback.

import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

function makeController(secret = 'unit-secret'): AuthController {
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      const env: Record<string, string> = {
        JWT_SECRET: secret,
        FRONTEND_URL: 'http://localhost:3000',
        GOOGLE_CLIENT_ID: 'client_id_for_unit_test',
        GOOGLE_CALLBACK_URL: 'http://localhost:8081/api/auth/google/callback',
      };
      return env[key] ?? fallback;
    }),
  } as unknown as ConfigService;
  const authService = {
    handleGoogleLogin: jest.fn(),
  } as unknown as AuthService;
  return new AuthController(authService, config);
}

describe('TEST-AUTH-020 Google OAuth state signing', () => {
  test('Decisions Log 2026-04-26 — buildGoogleStart returns a Google URL with a server-signed `state` (HMAC of body using JWT_SECRET)', () => {
    const ctrl = makeController('secret-A');
    const { redirect_url } = ctrl.buildGoogleStart(
      'EMPLOYER',
      '/profile',
      'register',
    );

    expect(redirect_url).toMatch(
      /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/,
    );
    const url = new URL(redirect_url);
    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();
    // state shape: <base64url-body>.<hex-hmac>
    expect(state).toMatch(/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/);
    const [body, sig] = state!.split('.');
    // Recompute the HMAC with the same secret and assert it matches.

    const crypto = require('node:crypto') as typeof import('node:crypto');
    const expected = crypto
      .createHmac('sha256', 'secret-A')
      .update(body)
      .digest('hex');
    expect(sig).toBe(expected);
    // Body decodes to the inputs we passed in (so role / return_to / intent
    // survived the signing step).
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    expect(payload).toEqual({
      role: 'EMPLOYER',
      return_to: '/profile',
      intent: 'register',
    });
  });

  test('Decisions Log 2026-04-26 — buildGoogleStart sanitises return_to: external URL falls back to /profile', () => {
    const ctrl = makeController();
    const { redirect_url } = ctrl.buildGoogleStart(
      'WORKER',
      '//evil.com/steal',
      'login',
    );
    const state = new URL(redirect_url).searchParams.get('state')!;
    const [body] = state.split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    expect(payload.return_to).toBe('/profile');
  });

  test('Decisions Log 2026-04-26 — invalid role / intent are coerced (defence in depth)', () => {
    const ctrl = makeController();
    const { redirect_url } = ctrl.buildGoogleStart(
      'NONSENSE',
      '/safe',
      'BOGUS',
    );
    const state = new URL(redirect_url).searchParams.get('state')!;
    const [body] = state.split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    expect(payload.role).toBe('WORKER');
    expect(payload.intent).toBe('login');
  });

  test('Decisions Log 2026-04-26 — googleCallback rejects state with a wrong signature (falls back to defaults, does NOT honour tampered state)', async () => {
    // We spy on AuthService.handleGoogleLogin to inspect what the callback
    // forwards. If the tampered state were honoured, role/intent/return_to
    // would reflect the attacker's body. Instead we expect the defaults.
    const handleGoogleLogin = jest.fn().mockResolvedValue({
      access_token: 't',
      refresh_token: 'r',
      account: {
        id: '1',
        email: 'x@x.io',
        is_worker: true,
        is_employer: false,
        is_staff: false,
        verification_state: 'ACTIVE',
      },
    });
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        const env: Record<string, string> = {
          JWT_SECRET: 'real-secret',
          FRONTEND_URL: 'http://localhost:3000',
          GOOGLE_CLIENT_ID: 'cid',
          GOOGLE_CALLBACK_URL: 'http://localhost/cb',
        };
        return env[key] ?? fallback;
      }),
    } as unknown as ConfigService;
    const ctrl = new AuthController(
      { handleGoogleLogin } as unknown as AuthService,
      config,
    );

    const tamperedBody = Buffer.from(
      JSON.stringify({
        role: 'EMPLOYER',
        return_to: '//evil',
        intent: 'register',
      }),
      'utf8',
    ).toString('base64url');
    const fakeSig = 'a'.repeat(64);
    const tamperedState = `${tamperedBody}.${fakeSig}`;

    const res = {
      redirect: jest.fn(),
    } as unknown as { redirect: jest.Mock };

    await ctrl.googleCallback(
      {
        user: {
          googleId: 'g',
          email: 'g@x.io',
          displayName: 'G',
          emailVerified: true,
        },
        query: { state: tamperedState },
      },
      res as never,
      '127.0.0.1',
    );

    // The callback should still have called handleGoogleLogin — but with
    // role: 'WORKER' (default) and intent: 'login' (default), proving the
    // tampered state was rejected. return_to default is '/profile'.
    expect(handleGoogleLogin).toHaveBeenCalledTimes(1);
    expect(handleGoogleLogin.mock.calls[0][0]).toMatchObject({
      role: 'WORKER',
      intent: 'login',
    });
    // And the redirect respected the default return_to=/profile, not the
    // attacker-supplied //evil.
    expect(res.redirect).toHaveBeenCalledTimes(1);
    const target = res.redirect.mock.calls[0][0] as string;
    expect(target).toMatch(/next=%2Fprofile/);
    expect(target).not.toContain('evil');
  });

  test('Decisions Log 2026-04-26 — googleCallback accepts a correctly signed state (round trip)', async () => {
    const handleGoogleLogin = jest.fn().mockResolvedValue({
      access_token: 't',
      refresh_token: 'r',
      account: {
        id: '1',
        email: 'x@x.io',
        is_worker: true,
        is_employer: false,
        is_staff: false,
        verification_state: 'ACTIVE',
      },
    });
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        const env: Record<string, string> = {
          JWT_SECRET: 'real-secret',
          FRONTEND_URL: 'http://localhost:3000',
          GOOGLE_CLIENT_ID: 'cid',
          GOOGLE_CALLBACK_URL: 'http://localhost/cb',
        };
        return env[key] ?? fallback;
      }),
    } as unknown as ConfigService;
    const ctrl = new AuthController(
      { handleGoogleLogin } as unknown as AuthService,
      config,
    );

    // Build a real, correctly-signed state via the same surface SPAs use.
    const { redirect_url } = ctrl.buildGoogleStart(
      'EMPLOYER',
      '/admin',
      'register',
    );
    const validState = new URL(redirect_url).searchParams.get('state')!;

    const res = { redirect: jest.fn() } as unknown as { redirect: jest.Mock };

    await ctrl.googleCallback(
      {
        user: {
          googleId: 'g',
          email: 'g@x.io',
          displayName: 'G',
          emailVerified: true,
        },
        query: { state: validState },
      },
      res as never,
      '127.0.0.1',
    );

    expect(handleGoogleLogin).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'EMPLOYER', intent: 'register' }),
      '127.0.0.1',
    );
    const target = res.redirect.mock.calls[0][0] as string;
    expect(target).toContain('next=%2Fadmin');
  });
});
