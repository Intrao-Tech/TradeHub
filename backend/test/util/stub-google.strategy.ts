// TEST-AUTH-049: deterministic Google OAuth stub used in e2e specs.
// Replaces the real GoogleAuthGuard via overrideGuard. The next callback
// pulls the queued profile, attaches it as `req.user`, and clears the queue.

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

export type StubGoogleProfile = {
  googleId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
};

let queued: StubGoogleProfile | null = null;

/** Tests call this before navigating /auth/google/callback. */
export function enqueueGoogleProfile(profile: StubGoogleProfile) {
  queued = profile;
}

export function resetGoogleQueue() {
  queued = null;
}

@Injectable()
export class StubGoogleAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!queued) {
      throw new Error(
        'StubGoogleAuthGuard: no Google profile enqueued for this callback',
      );
    }
    req.user = queued;
    queued = null;
    return true;
  }
}
