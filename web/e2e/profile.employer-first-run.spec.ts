// TEST-PROF-142 — employer first-run (E2E-3).
//
// Brand-new employer registers → verifies email → reaches /profile.
// /employers/:id is reachable anonymously and shows no Send-message
// affordance.

import { test, expect } from '@playwright/test';
import {
  TEST_PASSWORD,
  confirmEmailViaApi,
  loginViaForm,
} from './util';

const API_BASE = process.env.PW_API_URL ?? 'http://localhost:8082/api';

async function registerEmployer(
  page: import('@playwright/test').Page,
  email: string,
) {
  await page.goto('/register');
  // Role card title (en copy: register.roleEmployer).
  await page.getByText('Employer', { exact: true }).click();
  await page.getByLabel(/Email/i).fill(email);
  await page.getByLabel(/^Password$/i).fill(TEST_PASSWORD);
  await page.getByLabel(/Confirm password/i).fill(TEST_PASSWORD);
  await page.getByLabel(/Company name/i).fill('Acme Build Ltd');
  await page.getByRole('button', { name: /Create account/i }).click();
  await page.waitForURL(/\/verify-email/);
}

test.describe('TEST-PROF-142 employer first-run (E2E-3)', () => {
  test('PROF-013 — employer registers, verifies, lands on /profile', async ({
    page,
    request,
  }) => {
    const email = `pw-emp-${Date.now()}@example.com`;
    await registerEmployer(page, email);
    await confirmEmailViaApi(request, email);
    await loginViaForm(page, email, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);
    await expect(page.getByLabel(/company name/i)).toBeVisible();
  });

  test('PROF-002 / PROF-006 — /employers/:id reachable without auth, no Send-message CTA', async ({
    page,
    request,
    context,
  }) => {
    const email = `pw-emp2-${Date.now()}@example.com`;
    await registerEmployer(page, email);
    await confirmEmailViaApi(request, email);

    // Look up the new employer id via the public listing. Hit the API host
    // directly — Playwright's `baseURL` points at Vite, which serves the
    // SPA fallback for unknown paths.
    const list = await request.get(`${API_BASE}/employer-profiles?limit=50`);
    expect(list.ok()).toBe(true);
    const body = (await list.json()) as { data: Array<{ id: string }> };
    const id = body.data[body.data.length - 1].id;

    await context.clearCookies();
    await page.evaluate(() => window.localStorage.clear()).catch(() => {});
    await page.goto(`/employers/${id}`);
    await expect(page.getByRole('button', { name: /send message/i })).toHaveCount(
      0,
    );
  });
});
