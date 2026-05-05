// TEST-PROF-108 — VerificationBadge + verificationFromLevel (PROF-032).
//
// After Verification shipped its trust-ladder vocab (UNVERIFIED → BASIC →
// CERTIFIED → PREMIUM), this test pins:
//   - every product-spec level maps to a renderable badge
//   - unknown values fall through to 'unverified' (the consume-don't-invent
//     boundary)

import { describe, expect, test } from 'vitest';
import { renderWithRouter, screen } from '@/test/render';
import {
  VerificationBadge,
  verificationFromLevel,
  type VerificationState,
} from './VerificationBadge';

describe('TEST-PROF-108 verificationFromLevel (PROF-032)', () => {
  test.each<[unknown, VerificationState]>([
    ['UNVERIFIED', 'unverified'],
    ['unverified', 'unverified'],
    ['BASIC', 'basic'],
    ['basic', 'basic'],
    ['CERTIFIED', 'certified'],
    ['certified', 'certified'],
    ['PREMIUM', 'premium'],
    ['premium', 'premium'],
    [null, 'unverified'],
    [undefined, 'unverified'],
    ['LEGACY_KYC', 'unverified'], // unknown → unverified, never throws
  ])('PROF-032 — input %p maps to badge state %p', (input, expected) => {
    expect(verificationFromLevel(input as never)).toBe(expected);
  });
});

describe('TEST-PROF-108 VerificationBadge render (PROF-032)', () => {
  test.each<[VerificationState, string]>([
    ['unverified', /unverified/i.source],
    ['basic', /basic.*id verified/i.source],
    ['certified', /certified/i.source],
    ['premium', /premium/i.source],
  ])('PROF-032 — state %s renders the badge label', (state, labelSrc) => {
    renderWithRouter(<VerificationBadge state={state} />);
    expect(screen.getByText(new RegExp(labelSrc, 'i'))).toBeInTheDocument();
  });
});
