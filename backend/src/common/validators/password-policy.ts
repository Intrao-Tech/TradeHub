/**
 * Password policy — standard composition rules.
 *
 * Required:
 *  - 8–128 characters
 *  - at least one lowercase letter
 *  - at least one uppercase letter
 *  - at least one digit
 *  - at least one special character (non-alphanumeric)
 *
 * Same rules apply to registration, password reset, change-password, and
 * staff invite generation. Mirrored on the frontend in
 * `web/src/lib/password-policy.ts` for live UI feedback (server is the
 * source of truth).
 */

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

export type PasswordPolicyReason =
  | 'too_short'
  | 'too_long'
  | 'no_lowercase'
  | 'no_uppercase'
  | 'no_digit'
  | 'no_special';

export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; reasons: PasswordPolicyReason[] };

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const reasons: PasswordPolicyReason[] = [];

  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    reasons.push('too_short');
  }
  if (typeof password === 'string' && password.length > MAX_LENGTH) {
    reasons.push('too_long');
  }
  if (typeof password === 'string') {
    if (!/[a-z]/.test(password)) reasons.push('no_lowercase');
    if (!/[A-Z]/.test(password)) reasons.push('no_uppercase');
    if (!/\d/.test(password)) reasons.push('no_digit');
    if (!/[^a-zA-Z0-9]/.test(password)) reasons.push('no_special');
  }

  if (reasons.length === 0) return { ok: true };
  return { ok: false, reasons };
}

export const PASSWORD_POLICY_LIMITS = {
  MIN_LENGTH,
  MAX_LENGTH,
} as const;
