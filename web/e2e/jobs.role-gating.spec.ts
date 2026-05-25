// TEST-JOBS-207 — role gating (E2E-8).
// Worker visits /my-jobs → redirects to /profile.
// Employer visits /my-applications → renders a worker-only empty state.

import { expect, test } from '@playwright/test';
import {
  confirmEmailViaApi,
  loginViaForm,
  registerWorker,
  TEST_PASSWORD,
} from './util';

test.describe('TEST-JOBS-207 role gating (E2E-8)', () => {
  test('JOBS-026 — worker visiting /my-jobs is redirected to /profile', async ({
    page,
    request,
  }) => {
    const email = `pw-jobs-rg-${Date.now()}@example.com`;
    await registerWorker(page, { email });
    await confirmEmailViaApi(request, email);
    await loginViaForm(page, email, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);

    await page.goto('/my-jobs');
    await page.waitForURL(/\/profile/);
    expect(page.url()).toMatch(/\/profile/);
  });

  // The employer-side gating (TEST-JOBS-207b) is covered by the unit suite
  // at TEST-JOBS-171: `MyApplicationsPage` renders the worker-only empty
  // state when `isWorker` is false. A Playwright equivalent requires the
  // employer-register flow which is out of `tests-auth-flow`'s register
  // helper today. Tracked for future expansion.
});
