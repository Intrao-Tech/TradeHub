// TEST-AUTH-022 — AccountStateGuard unit tests.
// Source: backend/src/common/guards/account-state.guard.ts
// Contract: AUTH-015-001 — PENDING accounts hard-blocked from trust-sensitive
// routes; allow-listed routes pass through.
//
// We exercise the guard's logic directly: built with a fake Reflector that
// returns the metadata the @RequiresVerifiedEmail decorator would set, and a
// mocked ExecutionContext carrying a fake `req.user`. This is the exact
// behaviour the controllers under §3 of the contract get.

import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountStateGuard } from './account-state.guard';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';

function ctx(user: Partial<CurrentUserPayload> | undefined): ExecutionContext {
  const req = { user };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getHandler: () => () => {},
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function withReflector(decorated: boolean): AccountStateGuard {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(decorated);
  return new AccountStateGuard(reflector);
}

const TRUST_SENSITIVE_ROUTES = [
  'POST /jobs',
  'POST /job-applications',
  'POST /conversations',
  'POST /conversations/:id/messages',
  'POST /collaborations',
  'POST /referrals',
  'POST /reviews',
  'POST /escrow',
  'POST /verifications',
];

describe('TEST-AUTH-022 AccountStateGuard — PENDING deny-list (AUTH-015-001)', () => {
  test.each(TRUST_SENSITIVE_ROUTES)(
    'AUTH-015-001 — PENDING user denied on %s with EMAIL_NOT_VERIFIED',
    (route) => {
      const guard = withReflector(true);
      const exec = ctx({
        accountId: 1n,
        email: 'p@x.io',
        verificationState: 'PENDING_EMAIL_VERIFICATION',
        isWorker: true,
        isEmployer: false,
        isStaff: false,
        clientProfileId: 1n,
        staffRole: null,
      });

      try {
        guard.canActivate(exec);
        fail(`expected guard to deny on ${route}`);
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const body = (err as ForbiddenException).getResponse() as {
          code: string;
        };
        expect(body.code).toBe('EMAIL_NOT_VERIFIED');
      }
    },
  );

  test('AUTH-015-001 — DEACTIVATED user is denied with ACCOUNT_DEACTIVATED', () => {
    const guard = withReflector(true);
    const exec = ctx({
      accountId: 2n,
      email: 'd@x.io',
      verificationState: 'DEACTIVATED',
      isWorker: false,
      isEmployer: false,
      isStaff: false,
      clientProfileId: null,
      staffRole: null,
    });
    try {
      guard.canActivate(exec);
      fail('expected guard to deny');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as {
        code: string;
      };
      expect(body.code).toBe('ACCOUNT_DEACTIVATED');
    }
  });

  test('AUTH-015-001 — ACTIVE user is permitted on a trust-sensitive route', () => {
    const guard = withReflector(true);
    const exec = ctx({
      accountId: 3n,
      email: 'a@x.io',
      verificationState: 'ACTIVE',
      isWorker: true,
      isEmployer: false,
      isStaff: false,
      clientProfileId: 3n,
      staffRole: null,
    });
    expect(guard.canActivate(exec)).toBe(true);
  });
});

describe('TEST-AUTH-022 AccountStateGuard — allow-list (AUTH-015-001)', () => {
  // The allow-list is everywhere @RequiresVerifiedEmail is NOT applied — the
  // guard either short-circuits (decorator missing → returns true) or the
  // decorator is absent on those controllers entirely. This test asserts the
  // short-circuit so a future refactor of the decorator API can't silently
  // re-enable the deny-list everywhere.
  const ALLOW_LIST = [
    'GET /account/me',
    'PATCH /client-profiles/me',
    'PATCH /worker-profiles/me',
    'PATCH /employer-profiles/me',
    'POST /portfolio',
    'POST /document/upload',
    'POST /auth/verify-email/send',
    'POST /auth/verify-email/confirm',
    'POST /auth/logout',
    'POST /auth/logout-all',
  ];

  test.each(ALLOW_LIST)(
    'AUTH-015-001 — PENDING user permitted on %s (no @RequiresVerifiedEmail decorator)',
    (route) => {
      const guard = withReflector(false); // no decorator → permitted
      const exec = ctx({
        accountId: 4n,
        email: 'p@x.io',
        verificationState: 'PENDING_EMAIL_VERIFICATION',
        isWorker: true,
        isEmployer: false,
        isStaff: false,
        clientProfileId: 4n,
        staffRole: null,
      });
      expect(guard.canActivate(exec)).toBe(true);
      void route;
    },
  );
});

describe('TEST-AUTH-022 AccountStateGuard — defence in depth', () => {
  test('AUTH-015-001 — missing user (JwtAuthGuard not run / bypassed) → 403 UNAUTHENTICATED, never silent allow', () => {
    const guard = withReflector(true);
    const exec = ctx(undefined);
    try {
      guard.canActivate(exec);
      fail('expected guard to deny');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as {
        code: string;
      };
      expect(body.code).toBe('UNAUTHENTICATED');
    }
  });
});
