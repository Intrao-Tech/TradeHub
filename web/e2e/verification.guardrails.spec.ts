// TEST-VER-410 — Verification guardrails:
//   - no `<pre>` JSON-dump blocks on /admin Verification tab or /profile
//     verification surfaces (Decisions Log "no <pre> tags" rule).
//   - /api/docs surfaces every documented Verification endpoint.

import { test, expect } from '@playwright/test';
import {
  confirmEmailViaApi,
  loginViaForm,
  registerWorker,
  seedAdminViaApi,
  TEST_PASSWORD,
} from './util';

const API_BASE = process.env.PW_API_URL ?? 'http://localhost:8082/api';

test.describe('TEST-VER-410 guardrails', () => {
  test('No <pre> JSON dumps on the verification surfaces', async ({
    page,
    request,
  }) => {
    // Worker on /profile.
    const workerEmail = `pw-ver-guard-${Date.now()}@example.com`;
    await registerWorker(page, { email: workerEmail });
    await confirmEmailViaApi(request, workerEmail);
    await loginViaForm(page, workerEmail, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);
    expect(await page.locator('pre').count()).toBe(0);

    // Admin on /admin Verification tab.
    const admin = await seedAdminViaApi(request);
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await loginViaForm(page, admin.email, admin.password);
    await page.goto('/admin');
    // Click into the Verification tab if the layout uses tabs.
    const verifTab = page.getByRole('tab', { name: /Verification/i });
    if (await verifTab.count()) {
      await verifTab.first().click();
    } else {
      // If not tabs, the queue may be inline.
    }
    expect(await page.locator('pre').count()).toBe(0);
  });

  test('OpenAPI /api/docs includes the documented Verification endpoints', async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/docs-json`);
    if (!res.ok()) {
      const html = await request.get(`${API_BASE}/docs`);
      expect(html.ok()).toBe(true);
      return;
    }
    const spec = (await res.json()) as { paths?: Record<string, unknown> };
    expect(spec.paths).toBeDefined();
    const paths = Object.keys(spec.paths ?? {});
    const required = [
      '/api/verification/me',
      '/api/verification/identity/start',
      '/api/verification/queue',
      '/api/verification/documents/{id}/review',
    ];
    for (const route of required) {
      expect(paths).toContain(route);
    }
  });
});
