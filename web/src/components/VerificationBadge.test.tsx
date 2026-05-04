// TEST-PROF-108 — VerificationBadge + verificationFromLevel (PROF-032).
//
// Profiles' contract is "consume whatever Verification ships, never invent
// new levels." The current `verificationFromLevel()` is a legacy mapper
// translating older backend values; the test below pins:
//   - every legacy + numeric value maps to a renderable badge
//   - unknown values fall through to 'unverified' (the consume-don't-invent
//     boundary)
// When Verification ships its enum reconciliation, TEST-PROF-202 instructs
// us to drop the legacy mapping in a follow-up commit; until then, this
// test is the regression guard against accidental vocabulary drift.

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
    ['KYC', 'kyc'],
    ['kyc', 'kyc'],
    [1, 'kyc'],
    ['REVIEWED', 'reviewed'],
    [2, 'reviewed'],
    ['HMRC', 'hmrc'],
    [3, 'hmrc'],
    [null, 'unverified'],
    [undefined, 'unverified'],
    ['SOMETHING_NEW_FROM_VERIFICATION', 'unverified'], // unknown → unverified, never throws
  ])('PROF-032 — input %p maps to badge state %p', (input, expected) => {
    expect(verificationFromLevel(input as never)).toBe(expected);
  });
});

describe('TEST-PROF-108 VerificationBadge render (PROF-032)', () => {
  test.each<[VerificationState, string]>([
    ['unverified', /unverified/i.source],
    ['kyc', /kyc verified/i.source],
    ['reviewed', /reviewed/i.source],
    ['hmrc', /hmrc confirmed/i.source],
  ])('PROF-032 — state %s renders the badge label', (state, labelSrc) => {
    renderWithRouter(<VerificationBadge state={state} />);
    expect(screen.getByText(new RegExp(labelSrc, 'i'))).toBeInTheDocument();
  });
});
