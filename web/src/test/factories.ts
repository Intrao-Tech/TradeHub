// TEST-AUTH-131 — frontend factories that mirror backend response shapes.
// Used by both MSW handlers and component tests.

import type { AccountSummary } from '@/lib/auth-routing';

export function makeAccountSummary(
  overrides: Partial<AccountSummary> & {
    staff_role?: 'ADMIN' | 'MODERATOR' | null;
  } = {},
): AccountSummary & { staff_role: 'ADMIN' | 'MODERATOR' | null } {
  return {
    id: overrides.id ?? '42',
    email: overrides.email ?? 'user@example.com',
    is_worker: overrides.is_worker ?? true,
    is_employer: overrides.is_employer ?? false,
    is_staff: overrides.is_staff ?? false,
    verification_state: overrides.verification_state ?? 'ACTIVE',
    staff_role: overrides.staff_role ?? null,
  };
}

export function makeLoginResponse(
  overrides: {
    email?: string;
    is_worker?: boolean;
    is_employer?: boolean;
    is_staff?: boolean;
    verification_state?:
      | 'PENDING_EMAIL_VERIFICATION'
      | 'ACTIVE'
      | 'DEACTIVATED';
    staff_role?: 'ADMIN' | 'MODERATOR' | null;
    withTokens?: boolean;
    token?: string | null;
  } = {},
) {
  return {
    access_token: overrides.token ?? 'test-access-token',
    refresh_token: 'test-refresh-token',
    account: makeAccountSummary({
      email: overrides.email,
      is_worker: overrides.is_worker,
      is_employer: overrides.is_employer,
      is_staff: overrides.is_staff,
      verification_state: overrides.verification_state,
      staff_role: overrides.staff_role ?? null,
    }),
  };
}

/** Common error body shape produced by the backend GlobalExceptionFilter. */
export function makeErrorBody(
  code: string,
  extras: Record<string, unknown> = {},
) {
  return {
    code,
    message: extras.message ?? `${code} error`,
    statusCode: extras.statusCode ?? 400,
    timestamp: new Date().toISOString(),
    ...extras,
  };
}
