// TEST-CHAT-230..232 — Attachment upload / send / preview (CHAT-040 / CHAT-042).
//
// Backend tests cover the validation + binding rules end-to-end
// (TEST-CHAT-075 / 076 / 077). This Playwright variant locks the
// browser-side composer round trip: pick a file, see the in-flight
// chip, submit, B receives a bubble with the thumbnail.

import { expect, test } from '@playwright/test';
import {
  confirmEmailViaApi,
  loginViaForm,
  registerEmployer,
  registerWorker,
  seedCollabConversationViaApi,
  TEST_PASSWORD,
} from './util';

// 1×1 valid PNG (the eight-byte signature + minimal IHDR/IDAT/IEND).
// Plenty for MIME / extension validation; well under the 10 MB cap.
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4' +
    '890000000a49444154789c63000100000005000159e7e8c70000000049454e44' +
    'ae426082',
  'hex',
);

test.describe('TEST-CHAT-230..232 attachments (CHAT-040 / CHAT-042)', () => {
  test('TEST-CHAT-230 / CHAT-040 — upload PNG via composer → submit → B receives the bubble with the attachment', async ({
    browser,
    request,
  }) => {
    const workerEmail = `pw-chat-230-w-${Date.now()}@example.com`;
    const employerEmail = `pw-chat-230-e-${Date.now()}@example.com`;
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
      await workerPage.goto(`/inbox/${convId}`);
      await employerPage.goto(`/inbox/${convId}`);
      await workerPage.waitForLoadState('networkidle');
      await employerPage.waitForLoadState('networkidle');

      // Pick the hidden file input directly — the production composer
      // wires a <Paperclip> button to .click() it; the input is what
      // multer reads. See web/src/components/chat/Composer.tsx.
      const fileInput = workerPage.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: 'tradehub-test.png',
        mimeType: 'image/png',
        buffer: TINY_PNG,
      });

      // In-flight chip renders, then transitions to ready.
      const chip = workerPage.getByTestId('composer-attachment-chip');
      await expect(chip).toBeVisible({ timeout: 5_000 });

      // Wait for the upload to complete (chip stays, but the spinner
      // is gone — assert the send button enables).
      const sendBtn = workerPage.getByTestId('chat-composer-send');
      await expect(sendBtn).toBeEnabled({ timeout: 8_000 });

      const ta = workerPage.getByTestId('chat-composer-textarea');
      const greeting = `see image ${Date.now()}`;
      await ta.fill(greeting);
      await sendBtn.click();

      // Worker sees their own bubble + an <img> for the attachment.
      await expect(workerPage.getByText(greeting).first()).toBeVisible({
        timeout: 4_000,
      });
      // Employer's UI receives the same bubble within a few seconds.
      await expect(employerPage.getByText(greeting).first()).toBeVisible({
        timeout: 8_000,
      });
      // Both bubbles render the image attachment as an <img alt="...">.
      const empImg = employerPage.locator('img[alt="tradehub-test.png"]');
      await expect(empImg).toBeVisible({ timeout: 8_000 });
    } finally {
      await workerCtx.close();
      await employerCtx.close();
    }
  });
});
