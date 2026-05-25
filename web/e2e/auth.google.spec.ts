// TEST-AUTH-106 (Should) — Google OAuth callback handling from the browser
// side. Uses page.route() to intercept the accounts.google.com redirect and
// send the browser back to /oauth/callback with controlled query params.
//
// The deeper behaviours (state signing, intent handling) are covered
// end-to-end in backend test/auth.google.e2e-spec.ts. This spec asserts the
// SPA's response to the callback URL.

import { test, expect } from '@playwright/test';

test.describe('TEST-AUTH-106 OAuth callback page (browser-side)', () => {
  test('Decisions Log 2026-04-26 — error=NO_GOOGLE_ACCOUNT renders the "Create an account" CTA', async ({
    page,
  }) => {
    await page.goto('/oauth/callback?error=NO_GOOGLE_ACCOUNT&intent=login');
    await expect(page.getByText(/No TradeHub account yet/i)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Create a TradeHub account/i }),
    ).toBeVisible();
  });

  test('Decisions Log 2026-04-26 — error=ACCOUNT_EXISTS&intent=register surfaces the "sign in instead" copy', async ({
    page,
  }) => {
    await page.goto(
      '/oauth/callback?error=ACCOUNT_EXISTS&intent=register&email=existing%40example.com',
    );
    await expect(page.getByText(/already have a TradeHub account/i)).toBeVisible();
  });
});
