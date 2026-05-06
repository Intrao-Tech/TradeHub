// TEST-CHAT-220..222 — Send / receive across two browser contexts (real WS).
//
// Drives the production /chat namespace end-to-end through the UI:
//   - Worker A and Employer B both load /inbox/<id> for the same
//     seeded conversation in separate browser contexts.
//   - A submits a message; the optimistic bubble appears on A's side
//     immediately, then B's side receives the persisted bubble within
//     a few seconds via the real WS round trip.
// The backend WS test (TEST-CHAT-082..088) covers the gateway in
// isolation; this layer asserts the UI reconciliation.

import { expect, test } from '@playwright/test';
import {
  confirmEmailViaApi,
  loginViaForm,
  registerEmployer,
  registerWorker,
  seedCollabConversationViaApi,
  TEST_PASSWORD,
} from './util';

test.describe('TEST-CHAT-220..222 send / receive across two contexts (CHAT-063 / CHAT-064)', () => {
  test('TEST-CHAT-220 / CHAT-063 — A sends → optimistic bubble in A, persisted bubble visible to B', async ({
    browser,
    request,
  }) => {
    const workerEmail = `pw-chat-220-w-${Date.now()}@example.com`;
    const employerEmail = `pw-chat-220-e-${Date.now()}@example.com`;
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
      expect(seeded.conversationId).not.toBeNull();
      const convId = seeded.conversationId!;

      await loginViaForm(workerPage, workerEmail, TEST_PASSWORD);
      await loginViaForm(employerPage, employerEmail, TEST_PASSWORD);
      await workerPage.waitForURL(/\/profile/);
      await employerPage.waitForURL(/\/profile/);
      await workerPage.goto(`/inbox/${convId}`);
      await employerPage.goto(`/inbox/${convId}`);
      await workerPage.waitForLoadState('networkidle');
      await employerPage.waitForLoadState('networkidle');

      // Worker types and sends.
      const ta = workerPage.getByTestId('chat-composer-textarea');
      const greeting = `hello employer ${Date.now()}`;
      await ta.fill(greeting);
      await ta.press('Enter');

      // Optimistic bubble appears immediately in A's UI.
      await expect(workerPage.getByText(greeting).first()).toBeVisible({
        timeout: 2_000,
      });
      // Persisted bubble reaches B within a few WS ticks.
      await expect(employerPage.getByText(greeting).first()).toBeVisible({
        timeout: 8_000,
      });
    } finally {
      await workerCtx.close();
      await employerCtx.close();
    }
  });
});
