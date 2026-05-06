// TEST-COLLAB-203 — Collaborations guardrails (parent E2E acceptance).
//
// Locks down the regressions the parent spec explicitly bans:
//   - <pre>{JSON.stringify(...)}</pre> dumps on the Collaborations surface
//   - escrow mutation buttons on /collaborations/:id
//   - <textarea> on /collaborations/:id (chat owns message composition)
//   - <input> placeholders that mirror the input's name attribute
//     (the legacy `placeholder="job_amount"` pattern)
//
// The anonymous `/escrow/:id` placeholder is reachable after sign-in only.
// The auth-required parts of TEST-COLLAB-203 (visiting /collaborations
// and /collaborations/:id while logged in) require `registerWorker()` plus
// a way to plant a collaboration row; the latter relies on the same
// `registerEmployer()` + test-only seed helper that blocks
// TEST-JOBS-202..204. Until then, the authed half is `test.fixme`'d below.

import { expect, test } from '@playwright/test';
import {
  confirmEmailViaApi,
  loginViaForm,
  registerEmployer,
  registerWorker,
  seedCollabConversationViaApi,
  TEST_PASSWORD,
} from './util';

test.describe('TEST-COLLAB-203 Collaborations guardrails (COLLAB-001 / COLLAB-022 / COLLAB-023)', () => {
  test('TEST-COLLAB-203 / COLLAB-001 — public escrow placeholder route after login has zero <pre> JSON dumps', async ({
    page,
    request,
  }) => {
    const email = `pw-collab-guard-${Date.now()}@example.com`;
    await registerWorker(page, { email });
    await confirmEmailViaApi(request, email);
    await loginViaForm(page, email, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);

    // /escrow/:id renders a static EmptyState — safe to drive without an
    // actual collaboration row.
    await page.goto('/escrow/1');
    await page.waitForLoadState('networkidle');
    expect(await page.locator('pre').count()).toBe(0);

    // /collaborations renders the empty list for a brand-new account.
    await page.goto('/collaborations');
    await page.waitForLoadState('networkidle');
    expect(await page.locator('pre').count()).toBe(0);
    // No textarea on the list page either.
    expect(await page.locator('textarea').count()).toBe(0);
  });

  test('TEST-COLLAB-203 — no <input> placeholder mirrors its name attribute on /collaborations', async ({
    page,
    request,
  }) => {
    const email = `pw-collab-input-${Date.now()}@example.com`;
    await registerWorker(page, { email });
    await confirmEmailViaApi(request, email);
    await loginViaForm(page, email, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);
    await page.goto('/collaborations');
    await page.waitForLoadState('networkidle');

    // Catch the legacy `placeholder="job_amount"` pattern: any input whose
    // placeholder equals (case-insensitive) its `name` is a regression.
    const offenders = await page.locator('input').evaluateAll((nodes) =>
      (nodes as HTMLInputElement[])
        .filter(
          (n) =>
            !!n.placeholder &&
            !!n.name &&
            n.placeholder.toLowerCase() === n.name.toLowerCase(),
        )
        .map((n) => ({ name: n.name, placeholder: n.placeholder })),
    );
    expect(offenders).toEqual([]);
  });

  test('TEST-COLLAB-203 / COLLAB-022 — /collaborations/:id has zero escrow mutation buttons + zero <textarea>', async ({
    page,
    request,
  }) => {
    const workerEmail = `pw-collab-203-w-${Date.now()}@example.com`;
    const employerEmail = `pw-collab-203-e-${Date.now()}@example.com`;
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
    const seeded = await seedCollabConversationViaApi(request, {
      workerEmail,
      employerEmail,
    });

    await loginViaForm(page, workerEmail, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);
    await page.goto(`/collaborations/${seeded.collaborationId}`);
    await page.waitForLoadState('networkidle');

    expect(await page.locator('pre').count()).toBe(0);
    // Escrow mutation buttons are explicitly out of scope on the collab
    // surface — they live on /escrow/:id.
    for (const re of [
      /create escrow/i,
      /^fund$/i,
      /confirm deposit/i,
      /^release$/i,
      /^refund$/i,
    ]) {
      await expect(page.getByRole('button', { name: re })).toHaveCount(0);
    }
    // Chat owns message composition — no textarea on the collab page.
    expect(await page.locator('textarea').count()).toBe(0);
  });
});
