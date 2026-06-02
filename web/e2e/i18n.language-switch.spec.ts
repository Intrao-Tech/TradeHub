// TEST-I18N-100 — language switch end-to-end.
// Drives the public /login page (AuthShell, no auth needed) and asserts the
// full i18n contract: the switcher swaps EN↔UK copy live, <html lang> tracks
// the choice, the choice persists across reload (localStorage detection cache),
// and the ?lng= querystring overrides it.

import { test, expect } from '@playwright/test';

const EN_TITLE = 'Log in to TradeHub';
const UK_TITLE = 'Вхід у TradeHub';

test.describe('TEST-I18N-100 language switch', () => {
  test('switcher swaps copy, syncs <html lang>, and persists', async ({
    page,
  }) => {
    // Force EN as the deterministic baseline (querystring beats the browser
    // locale and seeds the localStorage cache to a known value).
    await page.goto('/login?lng=en');
    await expect(
      page.getByText(EN_TITLE, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Open the language menu (trigger's accessible name is the localized
    // "Language" label) and pick Ukrainian.
    await page.getByRole('button', { name: 'Language' }).click();
    await page.getByRole('menuitem', { name: 'Українська' }).click();

    // Copy switches live, <html lang> follows, and the choice is cached.
    await expect(
      page.getByText(UK_TITLE, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem('i18nextLng')))
      .toBe('uk');

    // Persists across a reload with no querystring (detection reads the cache).
    await page.goto('/login');
    await expect(
      page.getByText(UK_TITLE, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');

    // And can be switched back — trigger now carries the localized UK label.
    await page.getByRole('button', { name: 'Мова' }).click();
    await page.getByRole('menuitem', { name: 'English' }).click();
    await expect(
      page.getByText(EN_TITLE, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('?lng=uk querystring renders Ukrainian directly', async ({ page }) => {
    await page.goto('/login?lng=uk');
    await expect(
      page.getByText(UK_TITLE, { exact: true }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  });
});
