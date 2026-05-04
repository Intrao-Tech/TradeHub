// TEST-PROF-141 — worker advances to Certified (E2E-2).
//
// Continuation of E2E-1.  Same Verification + TrustLadderPanel dependency:
// stays `.fixme` until the staff-approve seam and the ladder UI ship.

import { test } from '@playwright/test';

test.describe('TEST-PROF-141 worker advances to Certified (E2E-2) [BLOCKED on Verification + TrustLadderPanel]', () => {
  test.fixme(
    'E2E-2 — add CSCS portfolio cert + matching CSCS_CARD document, link them, staff approves, ladder → Certified, "Verified by TradeHub" indicator on public profile',
    async () => {
      // Live once Verification + TrustLadderPanel land.
    },
  );
});
