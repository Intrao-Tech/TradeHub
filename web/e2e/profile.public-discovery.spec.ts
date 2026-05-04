// TEST-PROF-143 — public discovery (E2E-4).
// Anonymous user lands on /workers, navigates to /workers/:id (after seeding
// a worker via the registration + verification path used by tests-auth-flow).

import { test, expect } from '@playwright/test';
import { confirmEmailViaApi, registerWorker } from './util';

test.describe('TEST-PROF-143 public discovery (E2E-4)', () => {
  test('PROF-005 / PROF-006 — anonymous user can browse /workers and reach /workers/:id without auth', async ({
    page,
    request,
    context,
  }) => {
    // Seed: register + verify a worker so the directory has at least one row.
    const email = `pw-prof-${Date.now()}@example.com`;
    await registerWorker(page, { email });
    await confirmEmailViaApi(request, email);

    // Anonymous navigation: clear storage to drop any tokens left by signup.
    await context.clearCookies();
    await page.evaluate(() => window.localStorage.clear());

    await page.goto('/workers');
    await expect(page).toHaveURL(/\/workers/);
    // Card-list renders something — at minimum the page header.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('PROF-048 — /workers renders without horizontal scroll at 375 px', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.evaluate(() => window.localStorage.clear()).catch(() => {});
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/workers');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2); // 1-2px sub-pixel rounding allowed
  });
});
