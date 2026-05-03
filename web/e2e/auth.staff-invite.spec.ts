// TEST-AUTH-104 — admin creates staff via the /admin Members tab; the new
// staff member signs in on the staff host and lands on /admin.
//
// Bootstraps the first admin via POST /test/seed/admin (gated by NODE_ENV=test).
// The invite password is captured from the in-process MailService sink and
// surfaced through GET /test/mailbox/<email>.latest_staff_invite_password.

import { test, expect } from '@playwright/test';
import { fetchMailbox, seedAdminViaApi } from './util';

const WEB_PORT = Number(process.env.PW_WEB_PORT ?? 4173);
const STAFF_BASE = `http://internal.localhost:${WEB_PORT}`;

test.describe('TEST-AUTH-104 staff invite', () => {
  test('AUTH-018-001 + AUTH-014-002 — admin creates fresh staff via Members tab; staff signs in on the staff host and lands on /admin', async ({
    browser,
    request,
  }) => {
    // ── 1. Seed an admin ──────────────────────────────────────
    const admin = await seedAdminViaApi(request);

    // ── 2. Admin signs in on the staff host ───────────────────
    const adminCtx = await browser.newContext({ baseURL: STAFF_BASE });
    const adminPage = await adminCtx.newPage();
    await adminPage.goto('/login');
    await adminPage.getByLabel(/Email/i).fill(admin.email);
    await adminPage.getByLabel(/Password/i).fill(admin.password);
    await adminPage.getByRole('button', { name: /^Staff sign in$/i }).click();
    await adminPage.waitForURL(/\/admin/);
    // AdminPage h1 confirms the staff router actually rendered the page
    // (rather than a marketplace 404 fallback).
    await expect(
      adminPage.getByRole('heading', { name: /Staff \/ Admin/i }),
    ).toBeVisible();

    // ── 3. Members tab → Add staff ────────────────────────────
    const inviteeEmail = `pw-invitee-${Date.now()}@example.com`;
    await adminPage.getByRole('tab', { name: /Members/i }).click();
    await adminPage.getByRole('button', { name: /^Add staff$/i }).click();
    await adminPage.getByLabel(/Email/i).fill(inviteeEmail);
    await adminPage.getByLabel(/Display name/i).fill('Invitee Mod');
    // Role defaults to MODERATOR — leave as-is.
    await adminPage
      .getByRole('button', { name: /Create \+ send invite/i })
      .click();

    await expect(
      adminPage.getByText(/Staff account created/i),
    ).toBeVisible();

    // ── 4. Capture the initial password from the test mailbox ─
    const mailbox = await fetchMailbox(request, inviteeEmail);
    expect(mailbox.latest_staff_invite_password).toBeTruthy();
    const initialPassword = mailbox.latest_staff_invite_password!;
    expect(initialPassword.length).toBe(16);

    // ── 5. Invitee signs in on the staff host (separate context)
    const inviteeCtx = await browser.newContext({ baseURL: STAFF_BASE });
    const inviteePage = await inviteeCtx.newPage();
    await inviteePage.goto('/login');
    await inviteePage.getByLabel(/Email/i).fill(inviteeEmail);
    await inviteePage.getByLabel(/Password/i).fill(initialPassword);
    await inviteePage.getByRole('button', { name: /^Staff sign in$/i }).click();

    // ── 6. Lands on /admin ────────────────────────────────────
    await inviteePage.waitForURL(/\/admin/);
    await expect(
      inviteePage.getByRole('heading', { name: /Staff \/ Admin/i }),
    ).toBeVisible();

    await adminCtx.close();
    await inviteeCtx.close();
  });
});
