// TEST-CHAT-210 — End-to-end auto-create thread on collab confirm
// (CHAT-010..013).
//
// Worker A clicks "Confirm" on a seeded PENDING collab → the chat
// summary card on /collaborations/:id flips to "Open chat" (deep-link
// to /inbox/<conversationId>) → A clicks through and sees the SYSTEM
// welcome message in the thread.
//
// The two-context "employer's other tab updates within 2 s" assertion
// is covered by the backend WS e2e (TEST-CHAT-086 in
// `backend/test/chat.gateway.e2e-spec.ts`) — the real Socket.IO
// namespace there proves the `conversation_created` broadcast fires
// to both participants. This Playwright variant covers the UI-side
// auto-create + deep-link round trip.

import { expect, test } from '@playwright/test';
import {
  confirmEmailViaApi,
  loginViaForm,
  registerEmployer,
  registerWorker,
  seedCollabConversationViaApi,
  TEST_PASSWORD,
} from './util';

test.describe('TEST-CHAT-210 collab confirm → auto-thread (CHAT-010..013)', () => {
  test('TEST-CHAT-210 / CHAT-010..013 — worker confirms PENDING collab → chat card deep-links to /inbox/<id> with SYSTEM welcome', async ({
    page,
    request,
  }) => {
    const workerEmail = `pw-chat-210-w-${Date.now()}@example.com`;
    const employerEmail = `pw-chat-210-e-${Date.now()}@example.com`;
    await registerWorker(page, { email: workerEmail });
    await confirmEmailViaApi(request, workerEmail);
    const empCtx = await page.context().browser()!.newContext();
    const ep = await empCtx.newPage();
    try {
      await registerEmployer(ep, { email: employerEmail });
      await confirmEmailViaApi(request, employerEmail);
    } finally {
      await empCtx.close();
    }

    // Plant a PENDING collab — no conversation yet (auto-create runs on
    // confirm, exercised through the UI below).
    const seeded = await seedCollabConversationViaApi(request, {
      workerEmail,
      employerEmail,
      status: 'PENDING',
    });
    expect(seeded.conversationId).toBeNull();

    await loginViaForm(page, workerEmail, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);
    await page.goto(`/collaborations/${seeded.collaborationId}`);
    await page.waitForLoadState('networkidle');

    // Pre-confirm: chat summary card links to placeholder /inbox.
    const beforeLink = page.getByRole('link', { name: /open inbox/i });
    await expect(beforeLink).toHaveAttribute('href', '/inbox');

    // Worker (responder, since employer initiated) confirms.
    await page.getByRole('button', { name: /^Confirm$/ }).click();
    // After the PATCH lands + the chat summary card refetches the inbox,
    // the link flips to "Open chat" pointing at /inbox/<conversationId>.
    const afterLink = page.getByRole('link', { name: /open chat/i });
    await expect(afterLink).toBeVisible({ timeout: 10_000 });
    const href = await afterLink.getAttribute('href');
    expect(href).toMatch(/^\/inbox\/\d+$/);

    // Click through; the SYSTEM welcome message renders.
    await afterLink.click();
    await page.waitForURL(/\/inbox\/\d+/);
    await page.waitForLoadState('networkidle');
    // Match the SYSTEM pill inside the message list specifically — the
    // same copy also appears as the inbox row preview, which would
    // otherwise trip strict-mode.
    await expect(
      page
        .getByTestId('chat-message-list')
        .locator(
          'text=/Collaboration confirmed\\. You can now message each other about the project\\./i',
        ),
    ).toBeVisible();
  });
});
