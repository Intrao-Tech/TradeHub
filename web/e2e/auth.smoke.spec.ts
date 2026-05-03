// TEST-AUTH-100 — register → verify → login smoke test.
// Asserts the journey: register a worker, fetch the verification token from
// the test mailbox, hit verify-email/confirm, then sign in normally.

import { test, expect } from '@playwright/test';
import {
  TEST_PASSWORD,
  confirmEmailViaApi,
  loginViaForm,
  registerWorker,
} from './util';

test.describe('TEST-AUTH-100 register → verify → login smoke', () => {
  test('AUTH-006 + AUTH-014-002 — worker can register, verify, and reach /profile', async ({
    page,
    request,
  }) => {
    const email = `pw-smoke-${Date.now()}@example.com`;
    await registerWorker(page, { email });
    // Confirm email through the test mailbox API (mirrors the user clicking
    // the link).
    await confirmEmailViaApi(request, email);

    // Now log in as the verified worker.
    await loginViaForm(page, email, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);

    // No EMAIL_NOT_VERIFIED banner should be present on the profile.
    await expect(
      page.getByText(/Please verify your email/i),
    ).toHaveCount(0);
  });
});
