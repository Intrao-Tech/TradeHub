// TEST-COLLAB-204 — role-gating Playwright spec.
//
// The Collaborations surface and the placeholder /escrow/:id route are
// private. Anonymous visitors hitting them must redirect to
// /login?next=<original-path>.
//
// The "logged-in worker who is not party → 403 surface" branch (parent
// spec Edge Case "GET /collaborations/:id returns 404") relies on a
// `registerEmployer()` helper that the harness does not yet provide
// (same blocker as TEST-JOBS-202..204), so the third assertion is
// `test.fixme`'d with an unblock note.

import { expect, test } from '@playwright/test';

test.describe('TEST-COLLAB-204 role-gating (COLLAB-052)', () => {
  for (const route of [
    '/collaborations',
    '/collaborations/123',
    '/escrow/123',
  ]) {
    test(`TEST-COLLAB-204 / COLLAB-052 — anonymous → ${route} → /login?next=${route}`, async ({
      page,
    }) => {
      await page.goto(route);
      await page.waitForURL(/\/login/);
      const url = new URL(page.url());
      expect(url.pathname).toBe('/login');
      expect(url.searchParams.get('next')).toBe(route);
    });
  }

  test.fixme(
    'TEST-COLLAB-204 / COLLAB-051 — logged-in non-party → /collaborations/:id → 403 EmptyState with back-link',
    async () => {
      // Unblock when:
      //   1. e2e/util.ts gains `registerEmployer()` so we can seat a row
      //      between two real verified parties.
      //   2. A `seedCollaboration` test-only API helper lands so the spec
      //      can plant a row to test against without going through the
      //      Jobs accept-flow (which itself is gated on registerEmployer).
      // Steps:
      //   - register + verify worker A (non-party).
      //   - seed a collab between worker B and an employer (via test API).
      //   - log in as worker A; visit /collaborations/<that-id>.
      //   - expect EmptyState "Collaboration not found or you don't have
      //     access" and a back-link to /collaborations.
    },
  );
});
