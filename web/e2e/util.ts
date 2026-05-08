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
  latest_staff_invite_password: string | null;
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

/**
 * Mirror of `registerWorker` for the EMPLOYER role. Picks "I'm hiring"
 * on the role-card screen and fills the Company-name field instead of
 * First/Surname. Lands on /verify-email like the worker flow.
 *
 * Unblocks the two-context Playwright specs that need an employer party
 * (TEST-CHAT-200 seeded variant, TEST-CHAT-210/220/240, TEST-COLLAB-203
 * authed half, TEST-JOBS-202..204).
 */
export async function registerEmployer(
  page: Page,
  opts: { email: string; password?: string; companyName?: string },
) {
  const password = opts.password ?? TEST_PASSWORD;
  await page.goto('/register');
  await page.getByText(/I'm hiring/i).click();
  await page.getByLabel(/Email/i).fill(opts.email);
  await page.getByLabel(/^Password$/i).fill(password);
  await page.getByLabel(/Confirm password/i).fill(password);
  await page.getByLabel(/Company name/i).fill(opts.companyName ?? 'Acme E2E Ltd');
  await page.getByRole('button', { name: /Create account/i }).click();
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

/** Bootstrap a fresh ADMIN staff account directly via the test-only seed
 *  endpoint (gated by NODE_ENV === 'test'). Sidesteps the chicken-and-egg
 *  problem that every /staff mutation requires an existing admin. */
export async function seedAdminViaApi(
  request: APIRequestContext,
  opts: { email?: string; password?: string } = {},
): Promise<{ id: string; email: string; password: string }> {
  const res = await request.post(`${API}/test/seed/admin`, {
    data: { email: opts.email, password: opts.password },
  });
  if (!res.ok()) {
    throw new Error(
      `seed-admin failed: ${res.status()} ${await res.text()}`,
    );
  }
  return res.json();
}

/**
 * Plant a JobPost owned by an already-registered employer (and
 * optionally a JobApplication from a worker) via the test-only seed
 * endpoint. Skips the "Post a job" Sheet so Jobs e2e scenarios can
 * start from a known post / application state.
 */
export async function seedJobPostViaApi(
  request: APIRequestContext,
  opts: {
    employerEmail: string;
    title?: string;
    payType?: 'DAY_RATE' | 'FIXED_PRICE';
    dayRateMin?: number;
    dayRateMax?: number;
    fixedPrice?: number;
    postcodeArea?: string;
    durationDays?: number;
    isUrgent?: boolean;
    status?: 'OPEN' | 'CLOSED' | 'FILLED' | 'CANCELLED';
    withApplicationFromWorkerEmail?: string;
    applicationStatus?:
      | 'PENDING'
      | 'REVIEWED'
      | 'SHORTLISTED'
      | 'ACCEPTED'
      | 'REJECTED'
      | 'WITHDRAWN';
  },
): Promise<{
  jobPostId: string;
  employerAccountId: string;
  applicationId: string | null;
  workerAccountId: string | null;
}> {
  const res = await request.post(`${API}/test/seed/job-post`, { data: opts });
  if (!res.ok()) {
    throw new Error(
      `seed-job-post failed: ${res.status()} ${await res.text()}`,
    );
  }
  return res.json();
}

/**
 * Plant a Collaboration + auto-created Conversation between two already-
 * registered worker / employer accounts via `POST /test/seed/collab-
 * conversation` (gated by NODE_ENV === 'test'). Used by the chat e2e
 * specs (TEST-CHAT-200, 210, 220..222, 230..232, 240) to bypass the
 * Jobs accept-flow UI fixture and start from a known thread state.
 */
export async function seedCollabConversationViaApi(
  request: APIRequestContext,
  opts: {
    workerEmail: string;
    employerEmail: string;
    status?: 'PENDING' | 'CONFIRMED';
    welcomeContent?: string;
  },
): Promise<{
  collaborationId: string;
  conversationId: string | null;
  workerAccountId: string;
  employerAccountId: string;
}> {
  const res = await request.post(`${API}/test/seed/collab-conversation`, {
    data: opts,
  });
  if (!res.ok()) {
    throw new Error(
      `seed-collab-conversation failed: ${res.status()} ${await res.text()}`,
    );
  }
  return res.json();
}

/**
 * Plant a Review (and optionally its parent COMPLETED Collaboration) via
 * the test-only `POST /test/seed/review` endpoint. Used by the Reviews e2e
 * suite (TEST-REVIEW-202..205) to drive the read / permalink / staff-
 * publish flows without first walking the full collaboration-lifecycle UI.
 */
export async function seedReviewViaApi(
  request: APIRequestContext,
  opts: {
    workerEmail: string;
    employerEmail: string;
    reviewerRole?: 'WORKER' | 'EMPLOYER';
    overallRating?: number;
    comment?: string | null;
    isPublished?: boolean;
    collaborationId?: string;
  },
): Promise<{
  reviewId: string;
  collaborationId: string;
  workerAccountId: string;
  employerAccountId: string;
}> {
  const res = await request.post(`${API}/test/seed/review`, { data: opts });
  if (!res.ok()) {
    throw new Error(
      `seed-review failed: ${res.status()} ${await res.text()}`,
    );
  }
  return res.json();
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

