// TEST-CHAT-240 — Live unread badge across pages (CHAT-070 / CHAT-071).
//
// Two-context flow: A is on /jobs (not /inbox). B sends a message
// through the composer in their own context. A's AppShell Inbox nav
// badge increments to 1 within a few seconds via the WS event +
// unread-count refetch. A then opens the thread; the badge clears.

import { expect, test } from '@playwright/test';
import {
  confirmEmailViaApi,
  loginViaForm,
  registerEmployer,
  registerWorker,
  seedCollabConversationViaApi,
  TEST_PASSWORD,
} from './util';

test.describe('TEST-CHAT-240 unread badge across pages (CHAT-070)', () => {
  test('TEST-CHAT-240 — B sends a message → A\'s nav badge increments while on /jobs; clears after opening the thread', async ({
    browser,
    request,
  }) => {
    const workerEmail = `pw-chat-240-w-${Date.now()}@example.com`;
    const employerEmail = `pw-chat-240-e-${Date.now()}@example.com`;
    const workerCtx = await browser.newContext();
    const employerCtx = await browser.newContext();
    try {
      const workerPage = await workerCtx.newPage();
      const employerPage = await employerCtx.newPage();
      await registerWorker(workerPage, { email: workerEmail });
      await registerEmployer(employerPage, { email: employerEmail });
      await confirmEmailViaApi(request, workerEmail);
      await confirmEmailViaApi(request, employerEmail);
      const seeded = await seedCollabConversationViaApi(request, {
        workerEmail,
        employerEmail,
      });
      const convId = seeded.conversationId!;

      await loginViaForm(workerPage, workerEmail, TEST_PASSWORD);
      await loginViaForm(employerPage, employerEmail, TEST_PASSWORD);
      await workerPage.waitForURL(/\/profile/);
      await employerPage.waitForURL(/\/profile/);

      // Employer opens the thread to mark-read the SYSTEM welcome
      // message they were the sender of (so we start from total: 0 on
      // A's side too — A is the worker, not the sender of the SYSTEM
      // message; the seed used the employer as sender). The worker
      // visits /jobs separately.
      await workerPage.goto(`/inbox/${convId}`);
      await workerPage.waitForLoadState('networkidle');
      await workerPage.goto('/jobs');
      await workerPage.waitForLoadState('networkidle');
      // Confirm the badge is hidden on /jobs while A has zero unread.
      const inboxNav = workerPage.getByRole('link', { name: /^Inbox/i }).first();
      const initialText = (await inboxNav.textContent()) ?? '';
      expect(initialText.replace(/\s/g, '')).toBe('Inbox');

      // Employer sends a message to A.
      await employerPage.goto(`/inbox/${convId}`);
      await employerPage.waitForLoadState('networkidle');
      const eta = employerPage.getByTestId('chat-composer-textarea');
      const greeting = `ping from employer ${Date.now()}`;
      await eta.fill(greeting);
      await eta.press('Enter');

      // A's badge ticks up while still on /jobs.
      await expect
        .poll(
          async () => {
            const t = (await inboxNav.textContent()) ?? '';
            return /\d/.test(t);
          },
          { timeout: 8_000 },
        )
        .toBe(true);

      // A opens the inbox; mark-read on visibility clears the badge.
      await workerPage.goto(`/inbox/${convId}`);
      await workerPage.waitForLoadState('networkidle');
      // Wait for the bubble + the mark-read PATCH round trip + the
      // unread-count refetch.
      await expect
        .poll(
          async () => {
            const nav = workerPage
              .getByRole('link', { name: /^Inbox/i })
              .first();
            return (await nav.textContent()) ?? '';
          },
          { timeout: 8_000 },
        )
        .toMatch(/^Inbox\s*$/);
    } finally {
      await workerCtx.close();
      await employerCtx.close();
    }
  });
});
