/**
 * Post-login routing helpers (AUTH-014).
 *
 * Decides where to send the user after a successful auth event (login,
 * verify-email confirm, OAuth callback). Uses the role flags + verification
 * state returned by the backend so the SPA does not need a follow-up
 * `/account/me` round-trip.
 */

export type AccountSummary = {
  id: string | number;
  email: string;
  is_worker: boolean;
  is_employer: boolean;
  is_staff: boolean;
  verification_state:
    | 'PENDING_EMAIL_VERIFICATION'
    | 'ACTIVE'
    | 'DEACTIVATED';
};

/**
 * True when `path` is a same-origin relative URL we are willing to navigate to.
 * Rejects external URLs and protocol-relative `//evil.com` paths.
 */
export function isSafeNext(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}

/**
 * Resolves the post-auth target route (AUTH-014-002).
 *
 * Priority:
 *   1. `?next=` if same-origin and safe
 *   2. staff surface → `/admin`
 *   3. PENDING verification → `/verify-email`
 *   4. DEACTIVATED       → `/login?reason=deactivated` (caller should clear tokens)
 *   5. ACTIVE worker/employer → `/profile`
 */
export function postAuthRedirect(
  account: AccountSummary,
  next?: string | null,
): string {
  if (next && isSafeNext(next)) return next;
  if (account.is_staff) return '/admin';
  if (account.verification_state === 'PENDING_EMAIL_VERIFICATION') {
    return '/verify-email';
  }
  if (account.verification_state === 'DEACTIVATED') {
    return '/login?reason=deactivated';
  }
  return '/profile';
}
