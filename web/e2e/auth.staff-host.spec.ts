// TEST-AUTH-105 — staff host gate (AUTH-016).
//
// `IS_STAFF_HOST` is computed at module load from window.location.hostname.
// Playwright drives a single dev server — to exercise the host check we
// override window.location.hostname before the SPA boots and assert the
// router tree it picks.

import { test, expect } from '@playwright/test';

test.describe('TEST-AUTH-105 staff host gate', () => {
  test('AUTH-016-004 — internal.* host renders the staff entry (no Google CTA on staff login)', async ({
    page,
  }) => {
    // Spoof the hostname for module evaluation. addInitScript runs before
    // any of the SPA bundle executes, so `window.location.hostname` is
    // already `internal.localhost` when host.ts and App.tsx evaluate.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: new Proxy(window.location, {
          get(target, key) {
            if (key === 'hostname') return 'internal.localhost';
            // @ts-expect-error string-keyed access on Location is intentional
            return target[key];
          },
        }),
      });
    });

    await page.goto('/login');
    // Staff login page renders without a Google CTA.
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toHaveCount(0);
  });

  test('AUTH-016-003 — marketplace host /internal/* path bounces to STAFF_BASE_URL', async ({
    page,
  }) => {
    // No spoof — default localhost is the marketplace host. Visiting
    // /internal/login should redirect via window.location.replace to the
    // staff host. We can't fully follow the redirect (different host), but
    // we can assert the URL change away from the marketplace path.
    await page.goto('/internal/login');
    // Either the SPA redirected us (URL no longer ends in /internal/login)
    // OR the marketplace router handled it as a 404. Both behaviours satisfy
    // the contract that marketplace does not render the staff router.
    await page.waitForLoadState('networkidle');
    const url = page.url();
    expect(url).not.toMatch(/\/internal\/login\b/);
  });
});
