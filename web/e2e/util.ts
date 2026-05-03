// Shared helpers for Playwright e2e specs.

import type { APIRequestContext, Page } from '@playwright/test';

const API = process.env.PW_API_URL ?? 'http://localhost:8082/api';

export const TEST_PASSWORD = 'PwE2e1!Aa';

export async function fetchMailbox(
  request: APIRequestContext,
  email: string,
): Promise<{
  email: string;
  status: string;
  latest_verification: string | null;
  latest_reset: string | null;
}> {
  const res = await request.get(
    `${API}/test/mailbox/${encodeURIComponent(email)}`,
  );
  if (!res.ok()) {
    throw new Error(`mailbox lookup failed: ${res.status()}`);
  }
  return res.json();
}

export async function registerWorker(
  page: Page,
  opts: { email: string; password?: string; first?: string; surname?: string },
) {
  const password = opts.password ?? TEST_PASSWORD;
  await page.goto('/register');
  await page.getByText(/I'm a tradesperson/i).click();
  await page.getByLabel(/Email/i).fill(opts.email);
  await page.getByLabel(/^Password$/i).fill(password);
  await page.getByLabel(/Confirm password/i).fill(password);
  await page.getByLabel(/First name/i).fill(opts.first ?? 'Mike');
  await page.getByLabel(/Surname/i).fill(opts.surname ?? 'E2E');
  await page.getByRole('button', { name: /Create account/i }).click();
  // Lands on /verify-email
  await page.waitForURL(/\/verify-email/);
}

export async function confirmEmailViaApi(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const mailbox = await fetchMailbox(request, email);
  if (!mailbox.latest_verification) {
    throw new Error(`no verification token captured for ${email}`);
  }
  const res = await request.post(`${API}/auth/verify-email/confirm`, {
    data: { token: mailbox.latest_verification },
  });
  if (!res.ok()) {
    throw new Error(
      `verify-email/confirm failed: ${res.status()} ${await res.text()}`,
    );
  }
}

export async function loginViaForm(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto('/login');
  await page.getByLabel(/Email/i).fill(email);
  await page.getByLabel(/Password/i).fill(password);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
}

/**
 * Wipes localStorage on the active page. Use before re-attempting a login
 * after the previous session was invalidated server-side — otherwise api.ts
 * sees the stale access_token, hits 401, fails the refresh, and redirects
 * to /login?reason=expired *before* the form submit completes.
 */
export async function clearTokens(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.removeItem('access_token');
    window.localStorage.removeItem('refresh_token');
  });
}

/** Step past the next whole second so two refresh-token JWTs differ — see
 *  followups.md FU-2. Needed any time two logins happen for the same
 *  account within ~1 second. */
export async function jwtIatGap(): Promise<void> {
  await new Promise((r) => setTimeout(r, 1100));
}
