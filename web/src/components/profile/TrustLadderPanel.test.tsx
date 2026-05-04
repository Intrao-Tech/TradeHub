// TEST-PROF-107 — TrustLadderPanel (PROF-033 / PROF-034).
//
// The TrustLadderPanel component is gated on Verification's contract being
// sealed (vocabulary reconciliation, rejection_reason field, promotion
// engine).  Per `tasks/in-progress/profiles/followups.md` the panel was
// explicitly NOT shipped on the Profiles 2026-05-03 cut.  These tests stay
// `.skip` per TEST-PROF-201 and become live the moment Verification ships.

import { describe, test } from 'vitest';

describe('TEST-PROF-107 TrustLadderPanel (PROF-033 / PROF-034) [BLOCKED on Verification]', () => {
  test.skip('PROF-034 — renders the four product-spec rungs verbatim (Unverified / Basic / Certified / Premium)', () => {
    // empty
  });
  test.skip('PROF-033 — current level is highlighted; primary CTA matches the next rung', () => {
    // empty
  });
  test.skip('PROF-033 — Premium rung renders requirement copy but caps state at Certified until Reviews ships', () => {
    // empty
  });
  test.skip('PROF-033 — "Usually takes 90 seconds" microcopy present on the relevant cards (Decisions Log 2026-05-03)', () => {
    // empty
  });
});
