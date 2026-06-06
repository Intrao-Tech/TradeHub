import type { TranslateFn } from '@/i18n/types';
/**
 * Mirrors `backend/src/common/validators/password-policy.ts` for inline
 * client-side feedback. The server is the source of truth — this is just so
 * the user sees policy errors before submitting.
 */

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 128;

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

/**
 * Each rule has a stable id (used for keys + for mapping backend reasons),
 * a human description, and a check function.
 */
export type PasswordRule = {
  id: PasswordPolicyReason;
  /** English fallback copy (used as `defaultValue` and in non-i18n contexts/tests). */
  label: string;
  /** i18next key (in the `auth` namespace) for the localized label. */
  labelKey: string;
  check: (password: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'too_short',
    label: `At least ${MIN_LENGTH} characters`,
    labelKey: 'auth:shared.atLeastChars',
    check: (p) => p.length >= MIN_LENGTH,
  },
  {
    id: 'no_lowercase',
    label: 'One lowercase letter (a–z)',
    labelKey: 'auth:password.lowercase',
    check: (p) => /[a-z]/.test(p),
  },
  {
    id: 'no_uppercase',
    label: 'One uppercase letter (A–Z)',
    labelKey: 'auth:password.uppercase',
    check: (p) => /[A-Z]/.test(p),
  },
  {
    id: 'no_digit',
    label: 'One digit (0–9)',
    labelKey: 'auth:password.digit',
    check: (p) => /\d/.test(p),
  },
  {
    id: 'no_special',
    label: 'One special character (!@#$…)',
    labelKey: 'auth:password.special',
    check: (p) => /[^a-zA-Z0-9]/.test(p),
  },
];

export function checkPassword(password: string): PasswordPolicyResult {
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
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

type TFn = TranslateFn;

/**
 * Human-readable copy for a failed rule. Pass the i18next `t` for a localized
 * sentence (keys live in the `auth` namespace); called without `t` it returns
 * the English fallback — keeps the pure-lib unit test and non-React callers
 * working.
 */
export function describeReason(
  reason: PasswordPolicyReason,
  t?: TFn,
): string {
  if (t) {
    const count = reason === 'too_long' ? MAX_LENGTH : MIN_LENGTH;
    return t(`auth:password.reason.${reason}`, { count });
  }
  switch (reason) {
    case 'too_short':
      return `Use at least ${MIN_LENGTH} characters.`;
    case 'too_long':
      return `Keep it under ${MAX_LENGTH} characters.`;
    case 'no_lowercase':
      return 'Add at least one lowercase letter.';
    case 'no_uppercase':
      return 'Add at least one uppercase letter.';
    case 'no_digit':
      return 'Add at least one digit.';
    case 'no_special':
      return 'Add at least one special character (e.g. !@#$).';
  }
}
