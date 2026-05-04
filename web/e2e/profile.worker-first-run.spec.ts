// TEST-PROF-140 — worker first-run, target Basic verification (E2E-1).
//
// E2E-1 requires staff approval of the ID document.  Until the
// Verification staff queue ships, the test uses the Prisma-direct admin
// helper described in the tests-profiles Decisions Log (2026-05-03 row 2)
// to flip the document to APPROVED.  When Verification merges its admin
// endpoint, this test should be re-pointed at it without changing the
// surrounding flow.
//
// The full E2E-1 journey (avatar crop, specialisation, project + media,
// document upload, RTW share-code) wires into many components that aren't
// yet shipped (Trust ladder, RTW section).  Until those land, this test
// stays `.fixme` with a TODO citing the open dependencies, ready to flip
// live the moment they land.

import { test } from '@playwright/test';

test.describe('TEST-PROF-140 worker first-run (E2E-1) [BLOCKED on Verification + RTW UI]', () => {
  test.fixme(
    'E2E-1 full happy path — register → verify → avatar → specialisation → portfolio item with 2 media → ID upload → RTW share-code → staff approve → ladder advances to Basic',
    async () => {
      // Live once Verification ships:
      //   - staff document-approval endpoint OR a documented seam to
      //     replace the Prisma-direct helper at tasks/in-progress/profiles
      //     spec Open Question (b) recommendation;
      //   - TrustLadderPanel + RightToWorkSection (both blocked in
      //     tasks/in-progress/profiles/followups.md).
    },
  );
});
