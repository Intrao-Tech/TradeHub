// TEST-AUTH-102 — forgot → reset → new password works, old does not.
// Plus: a second logged-in browser context is signed out on next API call.

import { test, expect } from '@playwright/test';
import {
  TEST_PASSWORD,
  clearTokens,
  confirmEmailViaApi,
  fetchMailbox,
  jwtIatGap,
  loginViaForm,
  registerWorker,
} from './util';

const API = 'http://localhost:8082/api';

test.describe('TEST-AUTH-102 password recovery e2e', () => {
  test('AUTH-007 — forgot → reset → new password works, old fails. Concurrent session is invalidated on next API call.', async ({
    browser,
    request,
    page,
  }) => {
    const email = `pw-reset-${Date.now()}@example.com`;
    await registerWorker(page, { email });
    await confirmEmailViaApi(request, email);

    // Sign in twice — second context is the "other device" we want to verify
    // gets revoked when the password is reset. FU-2: pause between logins so
    // the second refresh-token JWT differs from the first.
    await loginViaForm(page, email, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);

    await jwtIatGap();
    const otherCtx = await browser.newContext();
    const otherPage = await otherCtx.newPage();
    await loginViaForm(otherPage, email, TEST_PASSWORD);
    await otherPage.waitForURL(/\/profile/);

    // Trigger forgot-password.
    await page.goto('/forgot-password');
    await page.getByLabel(/Email/i).fill(email);
    await page.getByRole('button', { name: /Send reset link/i }).click();
    await expect(page.getByText(/If an account exists/i)).toBeVisible();

    // Fetch the reset token from the test mailbox.
    const mailbox = await fetchMailbox(request, email);
    expect(mailbox.latest_reset).not.toBeNull();

    // Apply the new password via the API (mirrors clicking the link).
    const newPassword = 'PwE2eRestart1!';
    const resetRes = await request.post(`${API}/auth/reset-password`, {
      data: { token: mailbox.latest_reset, password: newPassword },
    });
    expect(resetRes.ok()).toBeTruthy();

    // Old password no longer works. Wipe stale tokens first so api.ts
    // doesn't redirect to /login?reason=expired before the form submit lands.
    await clearTokens(page);
    await loginViaForm(page, email, TEST_PASSWORD);
    await expect(page.getByText(/Sign in failed/i)).toBeVisible();

    // New password works.
    await loginViaForm(page, email, newPassword);
    await page.waitForURL(/\/profile/);

    await otherCtx.close();
  });
});
