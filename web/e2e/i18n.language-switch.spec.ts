// TEST-I18N-100 — language switch end-to-end.
//
// Language is an authenticated-only setting (I18N decision): the ONLY
// switcher in the app lives in the AppShell account dropdown, and every
// logged-out surface (marketing AND auth pages) is pinned to English. This
// spec asserts the full contract: auth pages expose NO switcher and stay
// English even with a ?lng= override, the account-menu submenu swaps EN↔UK
// copy live for a signed-in user, <html lang> tracks the choice, and the
// choice persists across reload (localStorage detection cache).

import { test, expect } from '@playwright/test';
import {
  TEST_PASSWORD,
  confirmEmailViaApi,
  loginViaForm,
  registerWorker,
} from './util';

const EN_TITLE = 'Log in to TradeHub';

test.describe('TEST-I18N-100 language switch', () => {
  test('no switcher on auth pages; account menu swaps language and persists', async ({
    page,
    request,
  }) => {
    await page.goto('/login');
    await expect(page.getByText(EN_TITLE, { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Auth pages no longer expose a standalone switcher.
    await expect(page.getByRole('button', { name: 'Language' })).toHaveCount(0);

    // Sign up + verify + sign in — the switcher only exists for authed users.
    const email = `i18n-${Date.now()}@e2e.test`;
    await registerWorker(page, { email });
    await confirmEmailViaApi(request, email);
    await loginViaForm(page, email, TEST_PASSWORD);
    await page.waitForURL(/\/profile/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Switch to Ukrainian from the account dropdown's Language submenu.
    await page.getByRole('button', { name: 'Open account menu' }).click();
    await page.getByRole('menuitem', { name: /^Language/ }).click();
    await page.getByRole('menuitem', { name: 'Українська' }).click();

    // Copy switches live, <html lang> follows, and the choice is cached.
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
    await expect(page.locator('header')).toContainText('Вакансії');
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('i18nextLng')))
      .toBe('uk');

    // Persists across a reload while signed in.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
    await expect(page.locator('header')).toContainText('Вакансії');

    // And can be switched back (submenu label is now localised).
    await page.getByRole('button', { name: 'Відкрити меню акаунта' }).click();
    await page.getByRole('menuitem', { name: /^Мова/ }).click();
    await page.getByRole('menuitem', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('auth pages stay English even with a ?lng=uk override', async ({
    page,
  }) => {
    await page.goto('/login?lng=uk');
    // Copy is hardcoded English and the logged-out pin forces lang back to en.
    await expect(page.getByText(EN_TITLE, { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
