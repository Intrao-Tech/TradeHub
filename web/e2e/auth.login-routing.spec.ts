// TEST-AUTH-101 — login routing priority list (AUTH-014-002).
// Covers: PENDING worker → /verify-email after login.
// Staff routing (→ /admin) is covered by TEST-AUTH-104.

import { test, expect } from '@playwright/test';
import { TEST_PASSWORD, loginViaForm, registerWorker } from './util';

test.describe('TEST-AUTH-101 post-login routing', () => {
  test('AUTH-014-002 — PENDING marketplace user signing in is routed to /verify-email', async ({
    page,
  }) => {
    const email = `pw-pending-${Date.now()}@example.com`;
    await registerWorker(page, { email });
    // Don't verify — log in immediately. Backend returns 403 EMAIL_NOT_VERIFIED
    // with tokens. The SPA stores tokens and routes to /verify-email.
    await loginViaForm(page, email, TEST_PASSWORD);
    await page.waitForURL(/\/verify-email/);
  });

  test('AUTH-014-003 — `next` param with same-origin path is honoured after login', async ({
    page,
    request,
  }) => {
    // Verify the user first so they can reach a protected route.
    const email = `pw-next-${Date.now()}@example.com`;
    await registerWorker(page, { email });
    const verifyRes = await request.post(
      `http://localhost:8082/api/auth/verify-email/confirm`,
      {
        data: {
          token: (
            await (
              await request.get(
                `http://localhost:8082/api/test/mailbox/${encodeURIComponent(email)}`,
              )
            ).json()
          ).latest_verification,
        },
      },
    );
    expect(verifyRes.ok()).toBeTruthy();

    await page.goto('/login?next=%2Fprofile');
    await page.getByLabel(/Email/i).fill(email);
    await page.getByLabel(/Password/i).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /^Sign in$/i }).click();
    await page.waitForURL(/\/profile/);
  });
});
