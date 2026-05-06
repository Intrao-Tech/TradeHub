// TEST-COLLAB-200..207 — Collaborations Playwright scenarios mapped 1:1 to
// the parent spec Acceptance Criteria. The scenarios that need a real
// employer-side login are written as `test.fixme` until
// `e2e/util.ts` gains a `registerEmployer()` helper equivalent to
// `registerWorker()` — same harness gap that gates TEST-JOBS-202..204.
//
// `collaborations.role-gating.spec.ts` and
// `collaborations.guardrails.spec.ts` cover the worker-only / anonymous
// slices of TEST-COLLAB-203 + TEST-COLLAB-204 today. Removing each
// `.fixme` below is a matter of filling the body once the harness gap
// closes; the assertions are listed in the comment so the unblock PR has
// no design work to do.

import { expect, test } from '@playwright/test';
import {
  confirmEmailViaApi,
  loginViaForm,
  registerEmployer,
  registerWorker,
  seedCollabConversationViaApi,
  TEST_PASSWORD,
} from './util';

async function setupCollab(
  browser: import('@playwright/test').Browser,
  request: import('@playwright/test').APIRequestContext,
  status: 'PENDING' | 'CONFIRMED' = 'PENDING',
): Promise<{
  workerEmail: string;
  employerEmail: string;
  collaborationId: string;
}> {
  const workerEmail = `pw-collab-sc-w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const employerEmail = `pw-collab-sc-e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const wctx = await browser.newContext();
  const wp = await wctx.newPage();
  try {
    await registerWorker(wp, { email: workerEmail });
    await confirmEmailViaApi(request, workerEmail);
  } finally {
    await wctx.close();
  }
  const ectx = await browser.newContext();
  const ep = await ectx.newPage();
  try {
    await registerEmployer(ep, { email: employerEmail });
    await confirmEmailViaApi(request, employerEmail);
  } finally {
    await ectx.close();
  }
  const seeded = await seedCollabConversationViaApi(request, {
    workerEmail,
    employerEmail,
    status,
  });
  return {
    workerEmail,
    employerEmail,
    collaborationId: seeded.collaborationId,
  };
}

test.describe('TEST-COLLAB-200..207 — Collaborations scenarios', () => {
  test('TEST-COLLAB-200 (COLLAB-021) — verified worker confirms → starts → completes a PENDING collab they responded to', async ({
    browser,
    page,
    request,
  }) => {
    const { workerEmail, collaborationId } = await setupCollab(
      browser,
      request,
      'PENDING',
    );
    await loginViaForm(page, workerEmail, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);
    await page.goto(`/collaborations/${collaborationId}`);
    await page.waitForLoadState('networkidle');

    // PENDING → CONFIRMED.
    await page.getByRole('button', { name: /^Confirm$/ }).click();
    await expect(page.getByText(/^Confirmed$/).first()).toBeVisible({
      timeout: 8_000,
    });
    // Timeline event "Confirmed" surfaces.
    await expect(page.getByText('Confirmed', { exact: true }).first()).toBeVisible();

    // CONFIRMED → IN_PROGRESS.
    await page.getByRole('button', { name: /^Start work$/ }).click();
    await expect(page.getByText(/^In progress$/i).first()).toBeVisible({
      timeout: 8_000,
    });

    // IN_PROGRESS → COMPLETED.
    await page.getByRole('button', { name: /^Mark complete$/ }).click();
    await expect(page.getByText(/^Completed$/).first()).toBeVisible({
      timeout: 8_000,
    });

    // No transition buttons remain (terminal state).
    await expect(page.getByRole('button', { name: /^Confirm$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Start work$/ })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /^Mark complete$/ }),
    ).toHaveCount(0);
  });

  test.fixme(
    'TEST-COLLAB-201 (COLLAB-030..033) — verified employer creates a manual collaboration via the New collaboration sheet',
    async () => {
      // Unblock when the New-collaboration sheet's worker_id lookup UI
      // exposes a copyable id (today there is no public mapping from
      // display name → worker_id surfaced in the UI). The two helpers
      // (registerEmployer + seedCollabConversationViaApi) skip the
      // sheet and create rows directly, so this UI-driven path waits
      // on the worker-search component, not on auth/seeding infra.
    },
  );

  test('TEST-COLLAB-202 (COLLAB-040..042) — flag dialog: OTHER < 10 chars disables Submit; valid OTHER: <detail> persists flag_reason verbatim', async ({
    browser,
    page,
    request,
  }) => {
    const { workerEmail, collaborationId } = await setupCollab(
      browser,
      request,
      'CONFIRMED',
    );
    await loginViaForm(page, workerEmail, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);
    await page.goto(`/collaborations/${collaborationId}`);
    await page.waitForLoadState('networkidle');

    // Open the flag dialog.
    await page.getByRole('button', { name: /^Flag dispute$/ }).click();
    const submit = page.getByRole('button', { name: /^Submit flag$/ });
    await expect(submit).toBeVisible();
    await expect(submit).toBeDisabled(); // no category selected yet

    // Pick OTHER + < 10 chars detail → Submit stays disabled.
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /Something else/i }).click();
    await page.getByLabel(/^Detail/).fill('short');
    await expect(submit).toBeDisabled();

    // Type ≥ 10 chars → Submit enables.
    const longDetail = 'paid-late-three-weeks';
    await page.getByLabel(/^Detail/).fill(longDetail);
    await expect(submit).toBeEnabled();
    await submit.click();
    // Dialog closes after success.
    await expect(submit).toHaveCount(0, { timeout: 8_000 });

    // Reload + assert the flag-history strip surfaces the verbatim reason.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByText(`OTHER: ${longDetail}`).first(),
    ).toBeVisible();
  });

  test.fixme(
    'TEST-COLLAB-205 (COLLAB-051) — staff visits /collaborations/:id, sees disabled lifecycle buttons + working flag',
    async () => {
      // Unblock when seedAdminViaApi() can sign into the staff host AND
      // the staff host route registers /collaborations/:id (today the
      // staff router only mounts /admin and /settings/security per
      // App.tsx). If staff use the marketplace host directly, log in as
      // admin, visit /collaborations/:id, and assert:
      //   - both party chips render.
      //   - the disabled "Lifecycle actions disabled" button has the
      //     staff-only tooltip.
      //   - clicking Flag dispute opens the dialog, submitting works,
      //     and a follow-up GET /collaborations/:id shows flagged=true.
    },
  );

  test('TEST-COLLAB-206 (COLLAB-061) — 375 px viewport: /collaborations and /collaborations/:id have no horizontal scroll', async ({
    browser,
    page,
    request,
  }) => {
    const { workerEmail, collaborationId } = await setupCollab(
      browser,
      request,
      'PENDING',
    );
    await page.setViewportSize({ width: 375, height: 812 });
    await loginViaForm(page, workerEmail, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);

    for (const route of ['/collaborations', `/collaborations/${collaborationId}`]) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const dims = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dims.scrollWidth).toBeLessThanOrEqual(dims.clientWidth);
    }
  });

  test.fixme(
    'TEST-COLLAB-207 (cross-feature seam Jobs → Collaborations) — accept → convert routes to /collaborations/:id',
    async () => {
      // Unblock with registerEmployer() + the Jobs E2E-3 path. Steps:
      //   - register + verify employer, post a job.
      //   - register + verify worker, apply to the job.
      //   - log in as employer, visit /my-jobs/:id/applicants, accept.
      //   - click Convert to collaboration; assert URL routes to
      //     /collaborations/:id and the row appears on /collaborations
      //     for both parties (re-login as worker, hit /collaborations).
    },
  );
});
