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
  label: string;
  check: (password: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'too_short',
    label: `At least ${MIN_LENGTH} characters`,
    check: (p) => p.length >= MIN_LENGTH,
  },
  {
    id: 'no_lowercase',
    label: 'One lowercase letter (a–z)',
    check: (p) => /[a-z]/.test(p),
  },
  {
    id: 'no_uppercase',
    label: 'One uppercase letter (A–Z)',
    check: (p) => /[A-Z]/.test(p),
  },
  {
    id: 'no_digit',
    label: 'One digit (0–9)',
    check: (p) => /\d/.test(p),
  },
  {
    id: 'no_special',
    label: 'One special character (!@#$…)',
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

export function describeReason(reason: PasswordPolicyReason): string {
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
