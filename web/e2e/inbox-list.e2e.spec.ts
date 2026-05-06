// TEST-CHAT-200..203 — Inbox list e2e (Playwright).
//
// Asserts the rebuilt /inbox surface (CHAT-050..CHAT-053) does not
// regress to the legacy debug DNA: no JSON dumps, no recipient-id form,
// no Stripe / payment buttons. The empty-state path is exercised in
// both worker and employer contexts (TEST-CHAT-203) to prove the
// `registerEmployer` helper unblocks two-context flows. The richer
// "seeded 3 rows" variant stays `test.fixme` until a test-only seed
// endpoint (or the full Jobs accept-flow driven from Playwright) lands
// — same precedent as `tests-collaborations-polish` TEST-COLLAB-203.

import { expect, test } from '@playwright/test';
import {
  confirmEmailViaApi,
  loginViaForm,
  registerEmployer,
  registerWorker,
  seedCollabConversationViaApi,
  TEST_PASSWORD,
} from './util';

test.describe('TEST-CHAT-200..202 Inbox guardrails (CHAT-050..CHAT-053)', () => {
  test('TEST-CHAT-201 / CHAT-053 — /inbox has zero <pre> JSON dumps + no debug-recipient input', async ({
    page,
    request,
  }) => {
    const email = `pw-chat-inbox-${Date.now()}@example.com`;
    await registerWorker(page, { email });
    await confirmEmailViaApi(request, email);
    await loginViaForm(page, email, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);

    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    // Zero JSON dumps anywhere on the inbox surface.
    expect(await page.locator('pre').count()).toBe(0);
    await expect(page.locator('text=/Last action response/i')).toHaveCount(0);

    // Legacy "Recipient account ID" form removed (CHAT-052).
    await expect(page.locator('text=/Recipient account ID/i')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Start.*conversation/i }),
    ).toHaveCount(0);
    // Legacy manual "Mark read" button removed (CHAT-032).
    await expect(
      page.getByRole('button', { name: /^Mark read$/i }),
    ).toHaveCount(0);
  });

  test('TEST-CHAT-202 / scope guard — no Stripe / payment buttons on /inbox', async ({
    page,
    request,
  }) => {
    const email = `pw-chat-no-stripe-${Date.now()}@example.com`;
    await registerWorker(page, { email });
    await confirmEmailViaApi(request, email);
    await loginViaForm(page, email, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);

    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /Fund/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Pay$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Stripe/i })).toHaveCount(0);
  });

  test('TEST-CHAT-203 — worker AND employer contexts both reach /inbox empty-state (registerEmployer unblock)', async ({
    browser,
    request,
  }) => {
    // Two browser contexts — proves both auth flows hit the chat surface.
    const workerCtx = await browser.newContext();
    const employerCtx = await browser.newContext();
    try {
      const workerPage = await workerCtx.newPage();
      const employerPage = await employerCtx.newPage();

      const workerEmail = `pw-chat-w-${Date.now()}@example.com`;
      const employerEmail = `pw-chat-e-${Date.now()}@example.com`;

      await registerWorker(workerPage, { email: workerEmail });
      await registerEmployer(employerPage, { email: employerEmail });
      await confirmEmailViaApi(request, workerEmail);
      await confirmEmailViaApi(request, employerEmail);
      await loginViaForm(workerPage, workerEmail, TEST_PASSWORD);
      await loginViaForm(employerPage, employerEmail, TEST_PASSWORD);
      await workerPage.waitForURL(/\/profile/);
      await employerPage.waitForURL(/\/profile/);

      await workerPage.goto('/inbox');
      await employerPage.goto('/inbox');
      await workerPage.waitForLoadState('networkidle');
      await employerPage.waitForLoadState('networkidle');

      // Both contexts hit the empty-state copy — the rebuilt surface,
      // not the legacy debug page.
      await expect(
        workerPage.locator('text=/No conversations yet/i').first(),
      ).toBeVisible();
      await expect(
        employerPage.locator('text=/No conversations yet/i').first(),
      ).toBeVisible();
      // No legacy JSON dump on either side.
      expect(await workerPage.locator('pre').count()).toBe(0);
      expect(await employerPage.locator('pre').count()).toBe(0);
    } finally {
      await workerCtx.close();
      await employerCtx.close();
    }
  });

  test('TEST-CHAT-200 / CHAT-051 — seeded conversation appears on /inbox with the SYSTEM welcome message', async ({
    page,
    request,
  }) => {
    const workerEmail = `pw-chat-200-w-${Date.now()}@example.com`;
    const employerEmail = `pw-chat-200-e-${Date.now()}@example.com`;
    await registerWorker(page, { email: workerEmail });
    await confirmEmailViaApi(request, workerEmail);
    // Use a fresh page for the employer registration so cookies don't
    // collide. We don't need an employer browser context for this test —
    // we just need an employer account in the DB to satisfy the seed.
    const empPage = await page.context().browser()!.newContext();
    const ep = await empPage.newPage();
    try {
      await registerEmployer(ep, { email: employerEmail });
      await confirmEmailViaApi(request, employerEmail);
    } finally {
      await empPage.close();
    }

    const seeded = await seedCollabConversationViaApi(request, {
      workerEmail,
      employerEmail,
      welcomeContent: 'Collaboration confirmed. Welcome to your project chat.',
    });
    expect(seeded.conversationId).not.toBeNull();

    await loginViaForm(page, workerEmail, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);
    await page.goto('/inbox');
    await page.waitForLoadState('networkidle');

    // Empty-state copy must NOT show — we have one seeded thread.
    await expect(
      page.locator('text=/No conversations yet/i'),
    ).toHaveCount(0);
    // The seeded SYSTEM welcome message is the last message → renders as
    // the row preview. Open the conversation; the SYSTEM pill appears.
    await page.goto(`/inbox/${seeded.conversationId}`);
    await page.waitForLoadState('networkidle');
    await expect(
      page
        .locator('text=/Collaboration confirmed\\. Welcome to your project chat\\./i')
        .first(),
    ).toBeVisible();
    // The "View collaboration" deep-link surfaces because the thread is
    // collab-bound (CHAT-060).
    await expect(page.getByRole('link', { name: /View collaboration/i })).toBeVisible();
  });
});
