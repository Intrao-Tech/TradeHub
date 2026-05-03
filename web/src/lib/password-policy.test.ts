// TEST-AUTH-074 — frontend mirrors backend password-policy.
// Source: web/src/lib/password-policy.ts
// Contract: AUTH-015-004 — same composition rules as the backend (server is
// the source of truth; this is just for live UI feedback).

import { describe, expect, test } from 'vitest';
import {
  PASSWORD_RULES,
  checkPassword,
  describeReason,
} from './password-policy';

describe('TEST-AUTH-074 frontend password-policy mirror', () => {
  test('AUTH-015-004 — exposes the same five rules the backend enforces', () => {
    const ids = PASSWORD_RULES.map((r) => r.id).sort();
    expect(ids).toEqual([
      'no_digit',
      'no_lowercase',
      'no_special',
      'no_uppercase',
      'too_short',
    ]);
  });

  test('AUTH-015-004 — checkPassword agrees with backend rules: too short', () => {
    const result = checkPassword('Aa1!aa');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContain('too_short');
  });

  test('AUTH-015-004 — checkPassword surfaces missing classes', () => {
    expect(checkPassword('PASSWORD1!').ok).toBe(false);
    expect(checkPassword('password1!').ok).toBe(false);
    expect(checkPassword('Password!').ok).toBe(false);
    expect(checkPassword('Password1').ok).toBe(false);
  });

  test('AUTH-015-004 — accepts the boundary case (exactly 8 chars + all classes)', () => {
    expect(checkPassword('Aa1!aaaa')).toEqual({ ok: true });
  });

  test('AUTH-015-004 — describeReason returns user-readable copy for every rule id', () => {
    for (const r of PASSWORD_RULES) {
      const copy = describeReason(r.id);
      expect(typeof copy).toBe('string');
      expect(copy.length).toBeGreaterThan(0);
    }
  });
});
