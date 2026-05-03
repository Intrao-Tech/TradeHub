// TEST-AUTH-104 — admin creates staff via /staff API; the new staff member
// signs in and lands on /admin with last_login_at set.
//
// The marketplace SPA does not render /admin — that lives behind
// IS_STAFF_HOST. We exercise the full sign-in via the SPA on the spoofed
// staff host instead.

import { test, expect } from '@playwright/test';
import {
  TEST_PASSWORD,
  confirmEmailViaApi,
  registerWorker,
} from './util';

const API = 'http://localhost:8082/api';

test.describe('TEST-AUTH-104 staff invite', () => {
  test('AUTH-018-001 + AUTH-014-002 — admin creates fresh staff; staff signs in via the staff host and lands on /admin', async ({
    page,
    request,
  }) => {
    // Bootstrap an admin account by registering, verifying, then promoting
    // the existing client account to staff via the /staff endpoint. The
    // first call to /staff requires a bearer token from an existing admin —
    // here we fall back to creating the first admin directly via the
    // factory used by the unit/e2e suite. For Playwright, expose an
    // emergency seed by hitting the admin-only API after promoting our
    // user with raw SQL is non-trivial — instead we register two users:
    // user A becomes admin (manually via SQL through the test mailbox
    // endpoint? No — the spec calls for a direct admin seed).
    //
    // Pragmatic shortcut: create the admin via the same /auth/register
    // endpoint, verify, then mark as staff via SQL using the test-only
    // mailbox endpoint's prisma access path… that doesn't exist. We use a
    // separate test-only seed endpoint, which we DON'T have. Therefore
    // this spec is `test.fixme` and tracked in followups.md FU-7.
    test.fixme(
      true,
      'Requires a test-only admin-seed endpoint; tracked in followups.md FU-7.',
    );

    const adminEmail = `pw-admin-${Date.now()}@example.com`;
    await registerWorker(page, { email: adminEmail });
    await confirmEmailViaApi(request, adminEmail);
    // After this point the workflow needs an admin promotion path.
    expect(API).toBeTruthy();
  });
});
