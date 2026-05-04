// TEST-PROF-144 — PENDING_EMAIL_VERIFICATION user can still edit their
// profile (E2E-6, Auth contract §3 exemption).

import { test, expect } from '@playwright/test';
import { TEST_PASSWORD, registerWorker, loginViaForm } from './util';

test.describe('TEST-PROF-144 PENDING user can edit profile (E2E-6)', () => {
  test('AUTH §3 / PROF-010 — registered-but-unverified worker hits /profile, sees AuthBanner, can interact with editor inputs', async ({
    page,
  }) => {
    const email = `pw-unverif-${Date.now()}@example.com`;
    await registerWorker(page, { email });
    // Don't confirm — go straight to login.  Auth contract §2 issues tokens
    // for PENDING users with an `EMAIL_NOT_VERIFIED` flag.
    await loginViaForm(page, email, TEST_PASSWORD);
    await page.waitForURL(/\/verify-email/, { timeout: 5000 }).catch(() => {});
    // PENDING users land on /verify-email by default; navigate to /profile
    // directly to exercise the editor surface.
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile/);

    // The verify-your-email banner is visible at the top of /profile.
    await expect(page.getByText(/verify your email/i).first()).toBeVisible();

    // Bio textarea is interactive.
    const bio = page.getByLabel(/^Bio$/i);
    await bio.fill('Friendly chippy with 7 years of experience.');
    await expect(bio).toHaveValue(
      'Friendly chippy with 7 years of experience.',
    );
  });
});
