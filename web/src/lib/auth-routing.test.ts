// TEST-AUTH-072 — auth-routing helpers.
// Source: web/src/lib/auth-routing.ts
// Contract: AUTH-014-002 priority list, AUTH-014-003 next sanitisation.

import { describe, expect, test } from 'vitest';
import { isSafeNext, postAuthRedirect } from './auth-routing';

describe('TEST-AUTH-072 isSafeNext (AUTH-014-003)', () => {
  test('AUTH-014-003 — same-origin relative path is safe', () => {
    expect(isSafeNext('/profile')).toBe(true);
    expect(isSafeNext('/profile?x=1')).toBe(true);
    expect(isSafeNext('/some/deeper/route')).toBe(true);
  });

  test('AUTH-014-003 — protocol-relative URL //evil.com is rejected', () => {
    expect(isSafeNext('//evil.com')).toBe(false);
    expect(isSafeNext('//evil.com/path')).toBe(false);
  });

  test('AUTH-014-003 — absolute external URL is rejected', () => {
    expect(isSafeNext('http://evil.com')).toBe(false);
    expect(isSafeNext('https://evil.com/path')).toBe(false);
  });

  test('AUTH-014-003 — non-string inputs return false (defence in depth)', () => {
    expect(isSafeNext(undefined)).toBe(false);
    expect(isSafeNext(null)).toBe(false);
    expect(isSafeNext(123)).toBe(false);
    expect(isSafeNext('')).toBe(false);
    expect(isSafeNext('relative')).toBe(false);
  });
});

describe('TEST-AUTH-072 postAuthRedirect priority list (AUTH-014-002)', () => {
  function account(over: Partial<Parameters<typeof postAuthRedirect>[0]> = {}) {
    return {
      id: '1',
      email: 'u@x.io',
      is_worker: false,
      is_employer: false,
      is_staff: false,
      verification_state: 'ACTIVE' as const,
      ...over,
    };
  }

  test('AUTH-014-002 #1 — `next` (safe) wins over every other rule', () => {
    expect(
      postAuthRedirect(
        account({ is_staff: true, verification_state: 'PENDING_EMAIL_VERIFICATION' }),
        '/some-page',
      ),
    ).toBe('/some-page');
  });

  test('AUTH-014-002 #1 — `next` is ignored when unsafe; staff route applies', () => {
    expect(
      postAuthRedirect(account({ is_staff: true }), '//evil.com'),
    ).toBe('/admin');
  });

  test('AUTH-014-002 #2 — staff routes to /admin (no next)', () => {
    expect(postAuthRedirect(account({ is_staff: true }))).toBe('/admin');
  });

  test('AUTH-014-002 #3 — PENDING routes to /verify-email', () => {
    expect(
      postAuthRedirect(
        account({
          is_worker: true,
          verification_state: 'PENDING_EMAIL_VERIFICATION',
        }),
      ),
    ).toBe('/verify-email');
  });

  test('AUTH-014-002 #4 — DEACTIVATED routes to /login?reason=deactivated (block)', () => {
    expect(
      postAuthRedirect(account({ verification_state: 'DEACTIVATED' })),
    ).toBe('/login?reason=deactivated');
  });

  test('AUTH-014-002 #5 — ACTIVE worker/employer routes to /profile', () => {
    expect(postAuthRedirect(account({ is_worker: true }))).toBe('/profile');
    expect(postAuthRedirect(account({ is_employer: true }))).toBe('/profile');
  });
});
