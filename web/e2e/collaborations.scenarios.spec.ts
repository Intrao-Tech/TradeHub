// TEST-COLLAB-200..207 — Collaborations Playwright scenarios mapped 1:1 to
// the parent spec Acceptance Criteria. The scenarios that need a real
// employer-side login are written as `test.fixme` until
// `e2e/util.ts` gains a `registerEmployer()` helper equivalent to
// `registerWorker()` — same harness gap that gates TEST-JOBS-202..204.
//
// `collaborations.role-gating.spec.ts` and
// `collaborations.guardrails.spec.ts` cover the worker-only / anonymous
// slices of TEST-COLLAB-203 + TEST-COLLAB-204 today. Removing each
// `.fixme` below is a matter of filling the body once the harness gap
// closes; the assertions are listed in the comment so the unblock PR has
// no design work to do.

import { test } from '@playwright/test';

test.describe('TEST-COLLAB-200..207 — Collaborations scenarios', () => {
  test.fixme(
    'TEST-COLLAB-200 (COLLAB-021) — verified worker confirms → starts → completes a PENDING collab they responded to',
    async () => {
      // Unblock when:
      //   1. e2e/util.ts gains registerEmployer() so a real row exists.
      //   2. A test-only POST /test/seed/collaboration helper plants a
      //      PENDING row between the registered worker and a seeded
      //      employer with initiated_by=EMPLOYER.
      // Steps:
      //   - register + verify worker.
      //   - seed a PENDING collab via test API.
      //   - log in as worker; visit /collaborations/<id>.
      //   - click Confirm → assert status pill flips to "Confirmed"
      //     and confirmed_at populated in the timeline.
      //   - click Start work → "In progress" + started_at.
      //   - click Mark complete → "Completed" + ended_at.
      //   - assert no transition buttons remain (terminal state).
    },
  );

  test.fixme(
    'TEST-COLLAB-201 (COLLAB-030..033) — verified employer creates a manual collaboration via the New collaboration sheet',
    async () => {
      // Unblock when registerEmployer() + a way to look up a worker_id
      // from the public profile page lands.
      // Steps:
      //   - register + verify employer.
      //   - register + verify worker (note the worker_id from the seeded
      //     /test/seed response, or scrape /workers/:id).
      //   - log in as employer; click "New collaboration" on /collaborations.
      //   - fill Worker ID, Project type, Site postcode (NW1), Agreed amount.
      //   - submit; assert URL is /collaborations/:id and a row appears on
      //     /collaborations after a reload.
    },
  );

  test.fixme(
    'TEST-COLLAB-202 (COLLAB-040..042) — flag dialog round-trips each non-OTHER category and the OTHER detail',
    async () => {
      // Steps:
      //   - seat a collab (see TEST-COLLAB-200 unblock).
      //   - log in as the worker party; open /collaborations/<id>.
      //   - click Flag dispute; for each non-OTHER category in the spec,
      //     submit and assert the backend persists `flag_reason` exactly
      //     as `<CATEGORY>` (verified via GET /collaborations/:id).
      //   - select OTHER, type 11+ chars, submit; assert
      //     `flag_reason === 'OTHER: <detail>'`.
      //   - select OTHER, type < 10 chars; assert Submit is disabled.
    },
  );

  test.fixme(
    'TEST-COLLAB-205 (COLLAB-051) — staff visits /collaborations/:id, sees disabled lifecycle buttons + working flag',
    async () => {
      // Unblock when seedAdminViaApi() can sign into the staff host AND
      // the staff host route registers /collaborations/:id (today the
      // staff router only mounts /admin and /settings/security per
      // App.tsx). If staff use the marketplace host directly, log in as
      // admin, visit /collaborations/:id, and assert:
      //   - both party chips render.
      //   - the disabled "Lifecycle actions disabled" button has the
      //     staff-only tooltip.
      //   - clicking Flag dispute opens the dialog, submitting works,
      //     and a follow-up GET /collaborations/:id shows flagged=true.
    },
  );

  test.fixme(
    'TEST-COLLAB-206 (COLLAB-061) — 375 px viewport: /collaborations and /collaborations/:id have no horizontal scroll, primary CTAs ≥ 48 px',
    async () => {
      // Steps:
      //   - register + verify worker, log in.
      //   - page.setViewportSize({ width: 375, height: 812 }).
      //   - for each route:
      //       const dims = await page.evaluate(() => ({
      //         scrollWidth: document.documentElement.scrollWidth,
      //         clientWidth: document.documentElement.clientWidth,
      //       }));
      //       expect(dims.scrollWidth).toBeLessThanOrEqual(dims.clientWidth);
      //   - primary CTA bounding box height ≥ 48 px.
    },
  );

  test.fixme(
    'TEST-COLLAB-207 (cross-feature seam Jobs → Collaborations) — accept → convert routes to /collaborations/:id',
    async () => {
      // Unblock with registerEmployer() + the Jobs E2E-3 path. Steps:
      //   - register + verify employer, post a job.
      //   - register + verify worker, apply to the job.
      //   - log in as employer, visit /my-jobs/:id/applicants, accept.
      //   - click Convert to collaboration; assert URL routes to
      //     /collaborations/:id and the row appears on /collaborations
      //     for both parties (re-login as worker, hit /collaborations).
    },
  );
});
