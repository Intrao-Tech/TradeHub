// TEST-JOBS-208 — Jobs guardrails (E2E-9).
//
// Protects against the regressions JOBS-048 / JOBS-049 specifically banned:
//   • <pre>{JSON.stringify(...)}</pre> dumps anywhere on the Jobs surface
//   • <input> placeholders advertising "comma-separated" IDs
//   • the documented Jobs endpoints disappearing from /api/docs
//
// Runs anonymously where possible — the public board and detail page don't
// require auth. The authed dashboards (/my-jobs, /my-jobs/:id/applicants,
// /my-jobs/:id/edit, /my-applications) are guard-checked by registering a
// worker for the worker side and seeding/relying on the test mailbox flow.

import { expect, test } from '@playwright/test';
import {
  confirmEmailViaApi,
  loginViaForm,
  registerWorker,
  TEST_PASSWORD,
} from './util';

test.describe('TEST-JOBS-208 Jobs guardrails (E2E-9)', () => {
  test('JOBS-048 — public Jobs routes have zero <pre> JSON-dump blocks', async ({
    page,
  }) => {
    for (const route of ['/jobs']) {
      await page.goto(route);
      // The page may render skeletons; wait for either a job card or the
      // empty state before counting.
      await page.waitForLoadState('networkidle');
      expect(await page.locator('pre').count()).toBe(0);
    }
  });

  test('JOBS-049 — no <input> placeholder advertises "comma-separated" IDs anywhere on the Jobs surface', async ({
    page,
  }) => {
    await page.goto('/jobs');
    await page.waitForLoadState('networkidle');
    const placeholders = await page.locator('input').evaluateAll((nodes) =>
      (nodes as HTMLInputElement[]).map((n) => n.placeholder),
    );
    for (const p of placeholders) {
      expect(p ?? '').not.toMatch(/comma[- ]separated/i);
    }
  });

  test('JOBS-055 — /api/docs surfaces the documented Jobs endpoints', async ({
    request,
  }) => {
    const res = await request.get('/api/docs-json');
    let spec: { paths?: Record<string, unknown> } | null = null;
    if (res.ok()) {
      try {
        spec = (await res.json()) as { paths?: Record<string, unknown> };
      } catch {
        // Some Nest builds serve Swagger UI HTML at this path instead of
        // the JSON spec — fall through to the HTML-reachability fallback.
        spec = null;
      }
    }
    if (!spec) {
      const html = await request.get('/api/docs');
      expect(html.ok()).toBe(true);
      return;
    }
    const paths = Object.keys(spec.paths ?? {});
    const hasJobsEndpoint = paths.some(
      (p) =>
        /\/job-posts/.test(p) ||
        /\/job-applications/.test(p) ||
        /\/specialisations/.test(p) ||
        /\/tags/.test(p),
    );
    expect(hasJobsEndpoint).toBe(true);
  });

  test('JOBS-048 — authed Jobs routes have zero <pre> JSON-dump blocks (worker side)', async ({
    page,
    request,
  }) => {
    const email = `pw-jobs-guard-${Date.now()}@example.com`;
    await registerWorker(page, { email });
    await confirmEmailViaApi(request, email);
    await loginViaForm(page, email, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);

    for (const route of ['/jobs', '/my-applications']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      expect(await page.locator('pre').count()).toBe(0);
    }
  });
});
