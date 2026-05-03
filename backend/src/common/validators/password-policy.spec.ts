// TEST-AUTH-010 — password-policy unit tests.
// Source under test: backend/src/common/validators/password-policy.ts
// Contract: AUTH-015-004 (REVISED 2026-04-26): 8–128 chars, lower+upper+digit+special.

import { checkPasswordPolicy } from './password-policy';
import { generateInitialPassword } from './generate-initial-password';

describe('TEST-AUTH-010 password-policy', () => {
  describe('rejects passwords missing required composition', () => {
    test('AUTH-015-004 — strings shorter than 8 chars are rejected with too_short', () => {
      const result = checkPasswordPolicy('Aa1!aa');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons).toContain('too_short');
    });

    test('AUTH-015-004 — strings longer than 128 chars are rejected with too_long', () => {
      // 129 chars all meeting composition rules
      const tooLong = 'A1!a' + 'a'.repeat(125);
      expect(tooLong.length).toBe(129);
      const result = checkPasswordPolicy(tooLong);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons).toContain('too_long');
    });

    test('AUTH-015-004 — missing lowercase rejected with no_lowercase', () => {
      const result = checkPasswordPolicy('PASSWORD1!');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons).toContain('no_lowercase');
    });

    test('AUTH-015-004 — missing uppercase rejected with no_uppercase', () => {
      const result = checkPasswordPolicy('password1!');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons).toContain('no_uppercase');
    });

    test('AUTH-015-004 — missing digit rejected with no_digit', () => {
      const result = checkPasswordPolicy('Password!');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons).toContain('no_digit');
    });

    test('AUTH-015-004 — missing special rejected with no_special', () => {
      const result = checkPasswordPolicy('Password1');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons).toContain('no_special');
    });

    test('AUTH-015-004 — multiple violations all reported', () => {
      const result = checkPasswordPolicy('aaa');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons).toContain('too_short');
        expect(result.reasons).toContain('no_uppercase');
        expect(result.reasons).toContain('no_digit');
        expect(result.reasons).toContain('no_special');
      }
    });
  });

  describe('accepts boundary cases', () => {
    test('AUTH-015-004 — exactly 8 chars meeting all rules is accepted', () => {
      expect(checkPasswordPolicy('Aa1!aaaa')).toEqual({ ok: true });
    });

    test('AUTH-015-004 — exactly 128 chars meeting all rules is accepted', () => {
      const pwd = 'Aa1!' + 'a'.repeat(124);
      expect(pwd.length).toBe(128);
      expect(checkPasswordPolicy(pwd)).toEqual({ ok: true });
    });

    test('AUTH-015-004 — production-grade password is accepted', () => {
      expect(checkPasswordPolicy('Tr@deHub2026!Build')).toEqual({ ok: true });
    });

    test('AUTH-015-004 — special chars include common punctuation', () => {
      for (const special of ['!', '@', '#', '$', '%', '^', '&', '*', '?', '_', '-']) {
        const pwd = `Aa1${special}aaaa`;
        expect(checkPasswordPolicy(pwd)).toEqual({ ok: true });
      }
    });
  });

  describe('TEST-AUTH-026 — staff initial-password generator passes the same policy', () => {
    // Regression guard against the spec promise that staff passwords satisfy
    // the policy. The generator is the actual function used by StaffService
    // (extracted to common/validators so the test imports the production code
    // path, not a copy).
    test('AUTH-018-001 — 100 generations all satisfy checkPasswordPolicy', () => {
      let failures = 0;
      const reasonsSeen = new Set<string>();
      for (let i = 0; i < 100; i += 1) {
        const candidate = generateInitialPassword();
        const result = checkPasswordPolicy(candidate);
        if (!result.ok) {
          failures += 1;
          for (const r of result.reasons) reasonsSeen.add(r);
        }
      }
      expect({ failures, reasonsSeen: [...reasonsSeen] }).toEqual({
        failures: 0,
        reasonsSeen: [],
      });
    });
  });
});
