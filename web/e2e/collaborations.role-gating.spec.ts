// TEST-COLLAB-204 — role-gating Playwright spec.
//
// The Collaborations surface and the placeholder /escrow/:id route are
// private. Anonymous visitors hitting them must redirect to
// /login?next=<original-path>.
//
// The "logged-in worker who is not party → 403 surface" branch (parent
// spec Edge Case "GET /collaborations/:id returns 404") relies on a
// `registerEmployer()` helper that the harness does not yet provide
// (same blocker as TEST-JOBS-202..204), so the third assertion is
// `test.fixme`'d with an unblock note.

import { expect, test } from '@playwright/test';
import {
  confirmEmailViaApi,
  loginViaForm,
  registerEmployer,
  registerWorker,
  seedCollabConversationViaApi,
  TEST_PASSWORD,
} from './util';

test.describe('TEST-COLLAB-204 role-gating (COLLAB-052)', () => {
  for (const route of [
    '/collaborations',
    '/collaborations/123',
    '/escrow/123',
  ]) {
    test(`TEST-COLLAB-204 / COLLAB-052 — anonymous → ${route} → /login?next=${route}`, async ({
      page,
    }) => {
      await page.goto(route);
      await page.waitForURL(/\/login/);
      const url = new URL(page.url());
      expect(url.pathname).toBe('/login');
      expect(url.searchParams.get('next')).toBe(route);
    });
  }

  test('TEST-COLLAB-204 / COLLAB-051 — logged-in non-party → /collaborations/:id → 403 EmptyState with back-link', async ({
    page,
    request,
  }) => {
    const partyWorkerEmail = `pw-collab-204-pw-${Date.now()}@example.com`;
    const partyEmployerEmail = `pw-collab-204-pe-${Date.now()}@example.com`;
    const outsiderEmail = `pw-collab-204-out-${Date.now()}@example.com`;

    // Two browser contexts to register the parties; the outsider then
    // takes the main page over to drive the assertion.
    const setupCtx = await page.context().browser()!.newContext();
    const sp = await setupCtx.newPage();
    try {
      await registerWorker(sp, { email: partyWorkerEmail });
      await confirmEmailViaApi(request, partyWorkerEmail);
    } finally {
      await setupCtx.close();
    }
    const empCtx = await page.context().browser()!.newContext();
    const ep = await empCtx.newPage();
    try {
      await registerEmployer(ep, { email: partyEmployerEmail });
      await confirmEmailViaApi(request, partyEmployerEmail);
    } finally {
      await empCtx.close();
    }
    const seeded = await seedCollabConversationViaApi(request, {
      workerEmail: partyWorkerEmail,
      employerEmail: partyEmployerEmail,
    });

    // Outsider (worker A, NOT a party) registers + logs in on the main
    // test context, then visits the planted collab.
    await registerWorker(page, { email: outsiderEmail });
    await confirmEmailViaApi(request, outsiderEmail);
    await loginViaForm(page, outsiderEmail, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);
    await page.goto(`/collaborations/${seeded.collaborationId}`);
    await page.waitForLoadState('networkidle');

    // Production CollaborationDetailPage maps 403/404 to a "Collaboration
    // not found" EmptyState with a "Back to collaborations" link.
    await expect(
      page.getByText(/Collaboration not found/i).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Back to collaborations/i }).first(),
    ).toBeVisible();
  });
});
