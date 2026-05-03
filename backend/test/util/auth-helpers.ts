// TEST-AUTH-040 helper: mint JWTs for seeded accounts so e2e specs can call
// protected endpoints without going through the full /auth/login round-trip.
//
// Uses the same JwtService from the live AppModule so the signature matches
// what JwtStrategy expects (incl. the `vs` verification-state claim).

import type { JwtService } from '@nestjs/jwt';
import type { TestHarness } from './test-app';

export type AccessTokenOpts = {
  accountId: bigint;
  email: string;
  /** Defaults to 'ACTIVE'. Set to 'PENDING_EMAIL_VERIFICATION' to test the guard. */
  verificationState?: 'PENDING_EMAIL_VERIFICATION' | 'ACTIVE' | 'DEACTIVATED';
};

export function signAccessTokenFor(
  harness: TestHarness,
  opts: AccessTokenOpts,
): string {
  // Lazy resolve so we don't hold a JwtService reference across resets.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JwtService: JwtServiceClass } = require('@nestjs/jwt') as {
    JwtService: typeof JwtService;
  };
  const jwt = harness.app.get(JwtServiceClass);
  return jwt.sign({
    sub: opts.accountId.toString(),
    email: opts.email,
    vs: opts.verificationState ?? 'ACTIVE',
  });
}

/** Convenience: a `Authorization: Bearer …` header for supertest `.set()`. */
export function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}
