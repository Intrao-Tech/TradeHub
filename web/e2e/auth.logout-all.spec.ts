// TEST-AUTH-103 — logout-all from one context revokes the other's session.

import { test, expect } from '@playwright/test';
import {
  TEST_PASSWORD,
  confirmEmailViaApi,
  jwtIatGap,
  loginViaForm,
  registerWorker,
} from './util';

test.describe('TEST-AUTH-103 logout-all', () => {
  test('AUTH-008 — Settings → Sign out everywhere in context A invalidates context B', async ({
    browser,
    request,
    page,
  }) => {
    const email = `pw-logoutall-${Date.now()}@example.com`;
    await registerWorker(page, { email });
    await confirmEmailViaApi(request, email);
    await loginViaForm(page, email, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);

    // FU-2: pause so the second refresh-token JWT differs from the first.
    await jwtIatGap();
    const otherCtx = await browser.newContext();
    const otherPage = await otherCtx.newPage();
    await loginViaForm(otherPage, email, TEST_PASSWORD);
    await otherPage.waitForURL(/\/profile/);

    // Trigger logout-all from context A. We invoke the same endpoint the
    // SPA's "Sign out everywhere" button hits — what we're asserting is the
    // server-side behaviour ("AUTH-008: every refresh token revoked"), not
    // the SettingsSecurityPage UX (covered in TEST-AUTH-083).
    const accessTokenA = await page.evaluate(() =>
      window.localStorage.getItem('access_token'),
    );
    expect(accessTokenA).toBeTruthy();
    const logoutRes = await request.post(
      'http://localhost:8082/api/auth/logout-all',
      {
        headers: { Authorization: `Bearer ${accessTokenA}` },
      },
    );
    expect(logoutRes.ok()).toBeTruthy();

    // Context B's refresh token is dead at the API level — that's the
    // contract assertion (AUTH-008: every refresh token revoked). The SPA's
    // redirect-to-login on refresh failure is covered by TEST-AUTH-085.
    const refreshTokenB = await otherPage.evaluate(() =>
      window.localStorage.getItem('refresh_token'),
    );
    expect(refreshTokenB).toBeTruthy();
    const refreshRes = await request.post(
      'http://localhost:8082/api/auth/refresh',
      {
        data: { refresh_token: refreshTokenB },
      },
    );
    expect(refreshRes.status()).toBe(401);

    await otherCtx.close();
  });
});
