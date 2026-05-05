// TEST-JOBS-200..209 — Playwright scenarios mapped 1:1 to E2E-1..E2E-9
// from `tasks/done/jobs-applications/spec.md` Acceptance Criteria.
//
// E2E-6 / E2E-8 / E2E-9 are covered by the dedicated specs in this folder
// (`jobs.public-funnel.spec.ts`, `jobs.role-gating.spec.ts`,
// `jobs.guardrails.spec.ts`). The remaining scenarios are written as
// `test.fixme` until the test harness gains an `employer-register` helper
// equivalent to `registerWorker()` — at which point unblocking each is a
// matter of removing the `.fixme` and filling the body. Mirrors the
// `tests-profiles` "fixme-and-unblock" pattern (see
// `tasks/done/tests-profiles/status.md`).

import { test } from '@playwright/test';

test.describe('TEST-JOBS-200..204 / 206 / 209 — Jobs scenarios', () => {
  test.fixme(
    'TEST-JOBS-200 (E2E-1) — worker first apply: register → verify → /jobs filter → /jobs/:id → submit → row in Pending tab',
    async () => {
      // Unblock when:
      //   1. e2e/util.ts gains a worker registration that lands on /jobs.
      //   2. The dev seed always provides at least one OPEN post.
      // Steps:
      //   - register + verify worker via existing helpers.
      //   - go to /jobs; if seed has no posts, register an employer and post.
      //   - apply via the Apply sheet; assert row on /my-applications Pending.
    },
  );

  test.fixme(
    'TEST-JOBS-201 (E2E-2) — worker withdraws: continuing from E2E-1, withdraws on /my-applications, /jobs/:id flips to "Application withdrawn"',
    async () => {
      // Same prerequisites as E2E-1.
    },
  );

  test.fixme(
    'TEST-JOBS-202 (E2E-3) — verified employer post → review → accept → convert to collaboration',
    async () => {
      // Unblock when e2e/util.ts gains `registerEmployer()`. Steps:
      //   - register + verify employer; visit /jobs.
      //   - "Post a job" sheet: chip-multiselect picks 2 specs + 2 tags.
      //   - lands on /my-jobs/:id; visit /applicants page.
      //   - REVIEWED → SHORTLISTED → ACCEPTED via the action buttons.
      //   - "Convert to collaboration" routes to a /collaborations/:id URL.
    },
  );

  test.fixme(
    'TEST-JOBS-203 (E2E-4) — employer edit soft-freeze: post with 1 application, structural fields disabled, description editable, save succeeds',
    async () => {
      // Same prerequisites as E2E-3 + a worker to apply.
    },
  );

  test.fixme(
    'TEST-JOBS-204 (E2E-5) — employer deletes a fresh post (zero applications) from /my-jobs',
    async () => {
      // Same prerequisites as E2E-3.
    },
  );

  test.fixme(
    'TEST-JOBS-206 (E2E-7) — pending-verification worker on /jobs/:id sees disabled Apply + AuthBanner; verifying email re-enables Apply',
    async () => {
      // Steps:
      //   - register worker (lands on /verify-email).
      //   - go to /jobs/:id with a known seeded post id.
      //   - assert <AuthBanner> + disabled Apply.
      //   - confirmEmailViaApi(); the page must re-fetch /account/me on focus
      //     or banner-close, then Apply enables.
    },
  );

  test.fixme(
    'TEST-JOBS-209 (E2E-9 mobile, JOBS-052) — 375 px viewport: /jobs, /jobs/:id, /my-jobs, /my-applications have no horizontal scroll and primary CTAs ≥ 48 px',
    async () => {
      // Use page.setViewportSize({ width: 375, height: 812 }) and assert
      // document.documentElement.scrollWidth === clientWidth, plus
      // boundingBox().height >= 48 on the primary CTA per route.
    },
  );
});
