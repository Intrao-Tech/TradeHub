// TEST-PROF-145 — multi-role render (E2E-7).
//
// `/auth/register` creates exactly one sub-profile per the chosen role
// (Auth contract §2).  Multi-role is currently producible only via a
// staff-side seed action which has not been wired into the e2e harness.
// Per TEST-PROF-145 the test stays `.fixme` with a TODO until multi-role
// seeding lands.

import { test } from '@playwright/test';

test.describe('TEST-PROF-145 multi-role profile render (E2E-7) [BLOCKED on multi-role seeding]', () => {
  test.fixme(
    'PROF-038 — staff-seeded multi-role account renders both worker and employer editors on /profile',
    async () => {
      // Live the moment a staff-side or test-only multi-role seed surface ships.
    },
  );
});
