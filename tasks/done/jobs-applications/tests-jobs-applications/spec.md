# Spec

## Summary

Lock the Jobs & Applications feature (`tasks/product/jobs-applications/`) behind an automated test suite. Covers backend unit tests, backend e2e tests against a real Postgres in a Testcontainer, and frontend unit + Playwright e2e tests for every Jobs page, hook, and component. Each `JOBS-NNN` requirement, each `BE-JOBS-N` backend prerequisite, and each `E2E-N` acceptance scenario from the Jobs spec gets at least one asserting test.

Test IDs are `TEST-JOBS-NNN` so they can be referenced from commits and PRs. Where a test maps directly to an existing `JOBS-NNN` requirement or `E2E-N` scenario, the source ID is cited in the test description so a failure points at the broken spec clause.

## Problem

Jobs & Applications is large (56+ requirements, 5 backend prerequisites, 6 routes, 9 acceptance scenarios) and is currently regression-protected only by manual smoke checks. The backend surface has **zero e2e coverage** today (`backend/test/` has no `job-post.e2e-spec.ts` or `job-application.e2e-spec.ts`). The full failure context lives in `brief.md`; the short version:

- The application lifecycle is a state machine with status-specific authorisation rules — illegal transitions are privilege-escalation bugs, not UX bugs.
- The unique `[job_post_id, worker_id]` constraint enforces re-apply policy at the schema level; tests must hold the line.
- Soft-freeze on edit is frontend-only; tests must lock the frontend gate and flag the backend gap.
- Role-aware Apply CTA has six branches; each is a hiding place for regressions.
- `<ChipMultiSelect>` is a new shared primitive consumed by post-create, edit, and the public-board filter; one bad refactor breaks all three.
- Cross-feature `E2E-N` scenarios (Auth → Profiles → Jobs) only Playwright can exercise.

## Goals

- Run `npm test` and `npm run test:e2e` per package and exercise the entire Jobs surface end-to-end.
- Make every `JOBS-NNN` requirement and every `E2E-N` acceptance scenario fail-loud if it regresses.
- Use the `tests-auth-flow` + `tests-profiles` tooling unchanged. No new test stack.
- Mock external services (mail, Verification's tier signals when consumed) so the suite stays hermetic and runs offline.
- Keep the suite local-runnable; do not couple to any CI provider in this feature.

## Non-goals

- CI / CD wiring (separate task).
- Performance / load testing of `/jobs` listing under high pagination.
- Visual regression of job cards / detail pages.
- Mutation testing.
- Replacing the manual `lint:tokens` / dark-mode / 375 px smoke checklists in PR reviews. The suite asserts behaviour and basic layout, not aesthetics.
- Writing tests for Verification-owned tier vocabulary. Jobs' contribution is consumption-only; tests assert that Jobs renders whatever Verification ships through the existing `<VerificationBadge>`.
- Re-testing Auth invariants — those live in `tests-auth-flow`.
- Re-testing Profiles primitives (avatar / `<StarRating>` / `<VerificationBadge>` / `useAccountMe`) — those live in `tests-profiles`. Jobs tests stub or reuse them.
- Real Stripe traffic, real object-store traffic.

## User Flow

Not applicable — the "users" are developers running `npm test` and AI agents reasoning about Jobs invariants.

## Test surfaces

Reuses the layers and tooling established by `tests-auth-flow` and `tests-profiles`:

1. **Backend unit tests** — `*.spec.ts` colocated under `backend/src/{job-post,job-application,specialisation,tag}/`. Prisma is deep-mocked with `jest-mock-extended`. No Postgres touched.
2. **Backend e2e tests** — `*.e2e-spec.ts` under `backend/test/`. Boots `AppModule` against a Postgres Testcontainer, applies migrations, drives HTTP via Supertest. Reuses the `test-app.ts` harness.
3. **Frontend unit tests** — `*.test.ts(x)` colocated under `web/src/`. Vitest + jsdom + RTL + MSW v2.
4. **Frontend e2e tests** — `*.spec.ts` under `web/e2e/`. Playwright drives Chromium against the real Vite dev server plus the real backend boot established by `tests-auth-flow`.

## Requirements

Conventions: each requirement has a stable ID `TEST-JOBS-NNN`. **Must** = blocks shipping this feature. **Should** = strongly preferred. Cross-references to the Jobs spec use `JOBS-NNN`, `BE-JOBS-N`, `E2E-N`. Cross-references to Auth / Profiles use `AUTH-NNN` / `PROF-NNN`.

### 1. Tooling

- **TEST-JOBS-001 (Must).** No new test runners or libraries beyond what `tests-auth-flow` and `tests-profiles` already added. If either has not yet landed, this feature is blocked on them (see status.md).
- **TEST-JOBS-002 (Must).** Extend `backend/test/util/factories.ts` with:
  - `seedJobPost(opts: { employerId, status?, isUrgent?, payType?, dayRateMin?, dayRateMax?, fixedPrice?, postcodeArea?, specialisationIds?, tagIds? })` — returns the persisted row with relations.
  - `seedJobApplication(opts: { jobPostId, workerId, initiatedBy?, status?, coverMessage?, proposedRate? })` — handles the unique constraint by upserting on `(jobPostId, workerId)`.
  - `seedSpecialisation(name)` / `seedTag(name)` — minimal helpers; rely on the existing seeded catalog where possible.
- **TEST-JOBS-003 (Must).** Extend `web/src/test/factories.ts` with:
  - `mockJobPost(overrides?)` — returns a JobPost shape compatible with the API response.
  - `mockJobApplication(overrides?)` — same for `JobApplication`.
  - `mockSpecialisationCatalog()` / `mockTagCatalog()` — small but realistic catalogs (3–5 items) for chip-multiselect tests.
- **TEST-JOBS-004 (Must).** Add `web/src/test/handlers/jobs.ts` — MSW v2 handlers for `GET /job-posts`, `GET /job-posts/:id`, `GET /job-posts/me`, `POST /job-posts`, `PATCH /job-posts/:id`, `DELETE /job-posts/:id`, `POST /job-applications/jobs/:jobPostId/apply`, `GET /job-applications/me`, `GET /job-applications/jobs/:jobPostId`, `PATCH /job-applications/:id/status`, `POST /job-applications/:id/to-collaboration`, `GET /specialisations`, `GET /tags`. Per-test override pattern matches `tests-profiles`.

### 2. Backend unit tests (mocked Prisma)

#### Job posts (`backend/src/job-post/`)

- **TEST-JOBS-010 (Must).** `job-post.service.spec.ts` `create()` (JOBS-014):
  - Persists every CreateJobPostDto field, defaults `status = 'OPEN'` and `is_urgent = false`.
  - When `pay_type === 'DAY_RATE'` and `day_rate_max < day_rate_min` → 400 with structured code.
  - `specialisation_ids` and `tag_ids` create the corresponding `JobPostSpecialisation` / `JobPostTag` rows in a single transaction.
  - Caller without `employer_profile` → 400 (matches controller guard at `:35`).
- **TEST-JOBS-011 (Must).** `job-post.service.spec.ts` `update()` ownership (JOBS-020):
  - Owner (`employer_id === user.clientProfileId`) → 200, fields persisted.
  - Non-owner employer → 403 with structured code.
  - Non-employer caller → 403 (controller-level, but test the service guard).
  - Updating `status` from `OPEN` → `CLOSED` and back → `OPEN` works.
- **TEST-JOBS-012 (Must).** `job-post.service.spec.ts` `delete()` (JOBS-031):
  - Owner with zero applications → 200, row removed.
  - Owner with ≥ 1 application → either succeeds (cascading delete of applications) OR rejects with `409 HAS_APPLICATIONS`. Document whichever the implementation does and lock it down. **If it cascades, the test files a follow-up against JOBS-031** (the frontend gate becomes load-bearing).
  - Non-owner → 403.
- **TEST-JOBS-013 (Must).** `job-post.service.spec.ts` `findAll()` query (JOBS-002 / JOBS-003 / JOBS-005):
  - Default `status` filter: only `OPEN` rows. (If the service returns all by default, file follow-up — JOBS-002 is frontend-enforceable but server-side default is the safer surface.)
  - `search` query matches title (case-insensitive substring).
  - `postcode_area` filter is exact match.
  - `specialisation_id` filter joins through `JobPostSpecialisation`.
  - `tag_id` filter joins through `JobPostTag`.
  - `is_urgent` parses the string flag.
  - Pagination respects `page`, `limit` (default 20, max 100 per `JobPostQueryDto`).
- **TEST-JOBS-014 (Should).** `job-post.service.spec.ts` `findMine()` (JOBS-026, BE-JOBS-1):
  - Returns only the caller's posts.
  - If BE-JOBS-1 ships, includes `applications_count` (or the `application_summary` aggregate). Otherwise the test stays `.skip` and is unblocked when BE-JOBS-1 lands.

#### Job applications (`backend/src/job-application/`)

- **TEST-JOBS-020 (Must).** `job-application.service.spec.ts` `apply()` (JOBS-012, BE-JOBS-2 / BE-JOBS-3):
  - Worker applies to an `OPEN` post → 201 with `status = 'PENDING'`, `initiated_by = 'WORKER'`.
  - Worker applies twice to the same post → second call hits `@@unique([job_post_id, worker_id])` and the service surfaces a structured `409 ALREADY_APPLIED` (BE-JOBS-2). If today's behaviour is a 500, **file a follow-up** and `.skip` the assertion until BE-JOBS-2 ships.
  - Worker applies to a `CLOSED` / `FILLED` / `CANCELLED` post → `400 JOB_CLOSED` (BE-JOBS-3). Same skip-and-follow-up rule if not yet shipped.
  - Worker without `worker_profile` → 400 (matches controller guard).
- **TEST-JOBS-021 (Must).** `job-application.service.spec.ts` `invite()` (JOBS-039):
  - Employer who owns the post → 201 with `status = 'PENDING'`, `initiated_by = 'EMPLOYER'`.
  - Employer who does **not** own the post → 403.
  - Side-effect: a conversation row is created (assert via the spy on the `ConversationService` collaborator).
- **TEST-JOBS-022 (Must).** `job-application.service.spec.ts` `updateStatus()` status-specific authorisation (JOBS-037, JOBS-044):
  - Worker → `WITHDRAWN` on **own** application from `PENDING` / `REVIEWED` / `SHORTLISTED` → 200.
  - Worker → `WITHDRAWN` on someone else's application → 403.
  - Worker → `ACCEPTED` (any) → 403.
  - Employer → `REVIEWED` / `SHORTLISTED` / `ACCEPTED` / `REJECTED` on an application **for their own post** → 200.
  - Employer → same statuses on an application for someone else's post → 403.
  - Employer → `WITHDRAWN` → 403.
  - On `ACCEPTED` / `REJECTED`, `responded_at` is set to `now()`.
- **TEST-JOBS-023 (Must).** `job-application.service.spec.ts` illegal transitions:
  - `WITHDRAWN` → anything → 400 `INVALID_TRANSITION` (or whatever code the service emits; lock it down).
  - `ACCEPTED` → `REJECTED` (or vice versa) — document the policy. If the service allows it (per Edge Cases JOBS-OQ-8), the test asserts allow-with-warning.
- **TEST-JOBS-024 (Must).** `job-application.service.spec.ts` `convertToCollaboration()` (JOBS-037):
  - `status === 'ACCEPTED'` → 201, returns the new collaboration row.
  - `status !== 'ACCEPTED'` → 400.
  - Calling twice on the same accepted application → 409 (or the service's structured error).
  - Non-owner employer → 403.
- **TEST-JOBS-025 (Must).** `job-application.service.spec.ts` `listMine()` and `listForPost()`:
  - `listMine()` returns applications **plus invitations** (`initiated_by === 'EMPLOYER'`) for the worker, and only the worker's rows.
  - `listForPost()` returns rows for the post; owner-only (the controller guard verified at the service layer).
  - Both honour the `status` and `initiated_by` filters from `ApplicationQueryDto`.

#### Specialisations & tags (read-only consumption)

- **TEST-JOBS-030 (Must).** `specialisation.controller.spec.ts` (or e2e — see below): `GET /specialisations` returns the catalog without auth and without leaking any non-public fields. (Smoke test — most logic lives in the service layer already covered by `tests-profiles` indirectly.)
- **TEST-JOBS-031 (Must).** `tag.controller.spec.ts` (or e2e): `GET /tags` returns the catalog without auth. Read-only confirmation that JOBS-022 / JOBS-025 don't drift toward staff-gated endpoints.

### 3. Backend e2e tests (Testcontainer Postgres)

- **TEST-JOBS-070 (Must).** `job-post.e2e-spec.ts` happy-path CRUD:
  - Verified employer creates a job post → 201 with relations expanded.
  - Owner edits → 200, edited fields visible on `GET /job-posts/:id`.
  - Owner closes (`PATCH … { status: 'CLOSED' }`) → 200, post hidden from `GET /job-posts` default but still visible by id.
  - Owner reopens → 200.
  - Owner deletes → 204; subsequent `GET` → 404.
- **TEST-JOBS-071 (Must).** `job-post.e2e-spec.ts` ownership:
  - Employer A cannot edit / delete employer B's post → 403 with structured code.
  - Worker cannot create a post → 403 (RolesGuard).
- **TEST-JOBS-072 (Must).** `job-post.e2e-spec.ts` AccountStateGuard (Auth contract §3, JOBS-017):
  - `PENDING_EMAIL_VERIFICATION` employer → `403 EMAIL_NOT_VERIFIED` on `POST /job-posts`.
  - `DEACTIVATED` employer → can't authenticate at login (covered in `tests-auth-flow`); spot-check at this surface that the guard fires anyway if a stale token is presented.
- **TEST-JOBS-073 (Must).** `job-post.e2e-spec.ts` query filters end-to-end:
  - Seed 5 posts varied by `postcode_area`, `specialisation_ids`, `tag_ids`, `is_urgent`. Assert each filter narrows the list correctly. Assert pagination is stable across pages.
- **TEST-JOBS-080 (Must).** `job-application.e2e-spec.ts` apply lifecycle (E2E-1, E2E-3):
  - Verified worker applies → 201, application visible on `GET /job-applications/me` and `GET /job-applications/jobs/:jobPostId`.
  - Employer marks `REVIEWED` → `SHORTLISTED` → `ACCEPTED` → 200 each.
  - Employer converts to collaboration → 201, collaboration row exists.
  - Each transition emits the expected `responded_at` on `ACCEPTED` / `REJECTED`.
- **TEST-JOBS-081 (Must).** `job-application.e2e-spec.ts` re-apply policy (JOBS-OQ-3, Edge Cases):
  - Worker applies → withdraws → tries to apply again → unique-constraint blocks (or the structured `409 ALREADY_APPLIED`). Lock it down.
- **TEST-JOBS-082 (Must).** `job-application.e2e-spec.ts` status authorisation:
  - Worker WITHDRAWS on own row → 200.
  - Worker tries to set ACCEPTED / REJECTED / SHORTLISTED → 403.
  - Employer A tries to mutate employer B's post applications → 403.
  - Employer tries to WITHDRAW → 403.
- **TEST-JOBS-083 (Must).** `job-application.e2e-spec.ts` AccountStateGuard:
  - `PENDING_EMAIL_VERIFICATION` worker → `403 EMAIL_NOT_VERIFIED` on apply.
  - Same for employer on invite.
- **TEST-JOBS-084 (Must).** `job-application.e2e-spec.ts` invite-creates-conversation:
  - Employer invites worker → conversation row exists in `Conversation` table linking the two parties.
- **TEST-JOBS-085 (Should).** `job-application.e2e-spec.ts` apply-on-closed-post (JOBS-013, BE-JOBS-3):
  - Apply on `CLOSED` post → `400 JOB_CLOSED` (or whatever ships). `.skip` until BE-JOBS-3 lands.
- **TEST-JOBS-086 (Should).** `job-application.e2e-spec.ts` `applications_count` aggregate (JOBS-029, BE-JOBS-1):
  - `GET /job-posts/me` returns each row with the live count. `.skip` until BE-JOBS-1 lands.
- **TEST-JOBS-087 (Must).** `job-post.e2e-spec.ts` browse anonymously:
  - `GET /job-posts` with no auth → 200, only `OPEN` rows by default.
  - `GET /job-posts/:id` with no auth → 200 for OPEN, 200 with status banner for CLOSED / FILLED / CANCELLED, 404 for deleted.
- **TEST-JOBS-088 (Must).** `specialisation.e2e-spec.ts` / `tag.e2e-spec.ts`: `GET /specialisations` and `GET /tags` both return non-empty catalogs without auth.

### 4. Frontend unit tests (Vitest + RTL + MSW)

#### Public job board (JOBS-001..JOBS-007)

- **TEST-JOBS-100 (Must).** `JobBoardPage.test.tsx` zero JSON dumps:
  - Component renders, `screen.queryByText(/JSON/)` is null.
  - No `<pre>` element with stringified JSON anywhere in the tree.
- **TEST-JOBS-101 (Must).** `JobBoardPage.test.tsx` filter binding (JOBS-003):
  - URL `?q=plumber&postcode_area=SW19&specialisation_id=4` pre-fills the inputs.
  - Submitting filters updates the URL.
- **TEST-JOBS-102 (Must).** `JobBoardPage.test.tsx` empty state (JOBS-006):
  - No matching posts → empty-state copy + correct CTA per auth state.
- **TEST-JOBS-103 (Must).** `JobBoardPage.test.tsx` pagination (JOBS-005):
  - Renders 20 cards by default; next-page button advances `?page=2` and refetches.

#### Job detail page (JOBS-008..JOBS-013)

- **TEST-JOBS-110 (Must).** `JobDetailPage.test.tsx` route renders (JOBS-008): `/jobs/123` mounts the page, calls `GET /job-posts/123`, renders title + employer chip + description.
- **TEST-JOBS-111 (Must).** `JobDetailPage.test.tsx` role-aware CTA (JOBS-011): six branches as enumerated in JOBS-011. Each branch is a separate test with `useAccountMe` mocked accordingly.
- **TEST-JOBS-112 (Must).** `JobDetailPage.test.tsx` already-applied state: when `GET /job-applications/me` includes the post id, CTA reads "Application submitted · View status".
- **TEST-JOBS-113 (Must).** `JobDetailPage.test.tsx` Apply happy path (JOBS-012): clicking Apply opens sheet, filling cover + rate and submitting hits `POST /job-applications/jobs/:id/apply`, sheet closes, toast shown, CTA flips.
- **TEST-JOBS-114 (Must).** `JobDetailPage.test.tsx` Apply error mapping (JOBS-013): MSW handler returns each documented error in turn (`401`, `403 EMAIL_NOT_VERIFIED`, `403 ACCOUNT_DEACTIVATED`, `409 ALREADY_APPLIED`, `400 JOB_CLOSED`); the UI surfaces the right copy / banner / redirect each time.
- **TEST-JOBS-115 (Must).** `JobDetailPage.test.tsx` `<AuthBanner>` reuse (JOBS-011): pending-verification worker sees the Auth-shipped banner, not a parallel one.

#### Post-a-job sheet (JOBS-014..JOBS-017)

- **TEST-JOBS-120 (Must).** `PostJobSheet.test.tsx` fields render in order, required `title` validates, conditional pay inputs flip with `pay_type`.
- **TEST-JOBS-121 (Must).** `PostJobSheet.test.tsx` chip-multiselect wiring (JOBS-022): selecting items emits `number[]` to `specialisation_ids` / `tag_ids` on submit. **No comma-separated text input anywhere** — assert by `screen.queryByText(/comma-separated/i)` is null.
- **TEST-JOBS-122 (Must).** `PostJobSheet.test.tsx` submit happy path: `POST /job-posts` called with the shape `CreateJobPostDto` expects; on 201, navigation goes to `/my-jobs/:id`.
- **TEST-JOBS-123 (Must).** `PostJobSheet.test.tsx` error mapping: `400 VALIDATION` returns field errors; the offending input gets `aria-invalid` and the toast describes the failure (no JSON dump).
- **TEST-JOBS-124 (Must).** `PostJobSheet.test.tsx` role gating (JOBS-017): rendered only for `isEmployer && verificationState === 'ACTIVE'`; pending employer sees disabled CTA + tooltip; worker doesn't see the CTA at all.

#### Edit-job page (JOBS-018..JOBS-020)

- **TEST-JOBS-130 (Must).** `EditJobPage.test.tsx` ownership gate (JOBS-020): non-owner is redirected to `/jobs/:id`.
- **TEST-JOBS-131 (Must).** `EditJobPage.test.tsx` soft-freeze (JOBS-019):
  - Post with `applications_count = 0` → all fields editable.
  - Post with `applications_count = 1` → `pay_type`, `day_rate_*`, `fixed_price`, `postcode_area`, `specialisation_ids` are `disabled`; `description`, `is_urgent`, `tag_ids`, `duration_days`, `start_date`, `expires_at`, `site_address`, `title` are still editable.
  - Disabled inputs carry the freeze tooltip.
- **TEST-JOBS-132 (Must).** `EditJobPage.test.tsx` submit only-changed fields: `PATCH /job-posts/:id` body contains only the edited fields, not the whole row.

#### Chip-multiselect primitive (JOBS-021)

- **TEST-JOBS-140 (Must).** `chip-multi-select.test.tsx`:
  - Selected items render as removable chips.
  - Typing filters the dropdown (case-insensitive substring on `name`).
  - Dropdown stays open across selections.
  - Tab focuses, ArrowDown opens dropdown, Enter selects.
  - Backspace on empty input removes the last chip.
  - Empty filter result shows "No specialisations match." / "No tags match." per `emptyText` prop.
  - Soft cap at 10 selections shows the helper hint above the limit (JOBS-023).
  - Mobile (≤ 768 px viewport via `matchMedia` mock) renders the full-screen sheet variant.

#### Employer dashboard `/my-jobs` (JOBS-026..JOBS-032)

- **TEST-JOBS-150 (Must).** `MyJobsPage.test.tsx` role gate (JOBS-026): non-employer redirects to `/profile`.
- **TEST-JOBS-151 (Must).** `MyJobsPage.test.tsx` status tabs (JOBS-028): each tab filters; per-tab counts match the seed.
- **TEST-JOBS-152 (Must).** `MyJobsPage.test.tsx` row actions (JOBS-029):
  - "View applicants" routes to `/my-jobs/:id/applicants`.
  - "Edit" routes to `/my-jobs/:id/edit`.
  - "Close" / "Reopen" / "Cancel" calls `PATCH /job-posts/:id` with the right status.
  - "Delete" disabled when `applications_count > 0`; tooltip points to "Close".
- **TEST-JOBS-153 (Must).** `MyJobsPage.test.tsx` empty state (JOBS-032): no posts → empty illustration + "Post a job" CTA.

#### Employer applicants view `/my-jobs/:id/applicants` (JOBS-033..JOBS-040)

- **TEST-JOBS-160 (Must).** `MyJobsApplicantsPage.test.tsx` ownership gate (JOBS-033).
- **TEST-JOBS-161 (Must).** `MyJobsApplicantsPage.test.tsx` status tabs (JOBS-035): tab counts match the seed; default tab is `Pending`.
- **TEST-JOBS-162 (Must).** `MyJobsApplicantsPage.test.tsx` action buttons per status (JOBS-037): each row exposes only the legal next-state buttons. Reject / Withdraw rows are read-only.
- **TEST-JOBS-163 (Must).** `MyJobsApplicantsPage.test.tsx` optimistic UI (JOBS-038): clicking a transition flips the badge before the API resolves and reverts on error.
- **TEST-JOBS-164 (Should).** `MyJobsApplicantsPage.test.tsx` `<VerificationBadge>` reuse (Profiles `PROF-032`): the badge component used is the Profiles primitive, not a parallel one.
- **TEST-JOBS-165 (Should).** `MyJobsApplicantsPage.test.tsx` invite-worker sheet (JOBS-039): hits `POST /job-applications/jobs/:id/invite` and refetches.

#### Worker dashboard `/my-applications` (JOBS-041..JOBS-046)

- **TEST-JOBS-170 (Must).** `MyApplicationsPage.test.tsx` zero JSON dumps: same grep-style assertion as TEST-JOBS-100.
- **TEST-JOBS-171 (Must).** `MyApplicationsPage.test.tsx` role gate (JOBS-041): non-worker redirects.
- **TEST-JOBS-172 (Must).** `MyApplicationsPage.test.tsx` status tabs (JOBS-042): tab counts match the seed; default is `All`.
- **TEST-JOBS-173 (Must).** `MyApplicationsPage.test.tsx` row actions (JOBS-043 / JOBS-044): Withdraw button shown only for `PENDING` / `REVIEWED` / `SHORTLISTED`. Confirm dialog → `PATCH /job-applications/:id/status { status: 'WITHDRAWN' }`. Row stays in the list with the new badge.
- **TEST-JOBS-174 (Should).** `MyApplicationsPage.test.tsx` invitations section (JOBS-046): rows where `initiated_by === 'EMPLOYER'` render in a separate "Invitations" pinned section with the "Invitation" chip and a "View job" CTA.
- **TEST-JOBS-175 (Must).** `MyApplicationsPage.test.tsx` empty state (JOBS-045): no applications → empty illustration + CTA to `/jobs`.

#### Hooks

- **TEST-JOBS-180 (Must).** `useSpecialisations.test.ts` — caches the catalog at module level, doesn't refetch within a session.
- **TEST-JOBS-181 (Must).** `useTags.test.ts` — same.

### 5. Frontend e2e tests (Playwright)

Each `E2E-N` from the Jobs spec maps 1:1 to a Playwright spec.

- **TEST-JOBS-200 (Must).** `jobs.worker-first-apply.spec.ts` (E2E-1): brand-new worker registers via the existing test mailbox flow → verifies email → completes the minimum profile fields → navigates to `/jobs` → applies a chip-multiselect filter → opens `/jobs/:id` → submits an application with cover message + proposed rate → finds the row on `/my-applications` Pending tab.
- **TEST-JOBS-201 (Must).** `jobs.worker-withdraw.spec.ts` (E2E-2): continuing from TEST-JOBS-200's seeded state, withdraws on `/my-applications`, returning to `/jobs/:id` finds the CTA reads "Application withdrawn" with no re-apply.
- **TEST-JOBS-202 (Must).** `jobs.employer-post-review-accept.spec.ts` (E2E-3): verified employer registers → posts a job (chip-multiselect, no comma-separated IDs) → lands on `/my-jobs/:id` → on the applicants page, marks Reviewed → Shortlisted → Accepted → clicks "Convert to collaboration" → routes to the collaboration surface (assert URL only, the collaboration page itself is out of scope).
- **TEST-JOBS-203 (Must).** `jobs.employer-edit-soft-freeze.spec.ts` (E2E-4): with one application on the post, opens `/my-jobs/:id/edit` → asserts the disabled state on `pay_type` / rates / `postcode_area` / specialisations → edits description + urgency → submit succeeds.
- **TEST-JOBS-204 (Must).** `jobs.employer-delete-zero-apps.spec.ts` (E2E-5): post a fresh job, delete from `/my-jobs`, assert row disappears.
- **TEST-JOBS-205 (Must).** `jobs.public-funnel.spec.ts` (E2E-6): anonymous visitor browses, opens a job, clicks "Sign in to apply" → lands on `/login?next=/jobs/:id` → signs in → bounced back to `/jobs/:id` with the active Apply CTA.
- **TEST-JOBS-206 (Must).** `jobs.pending-verification.spec.ts` (E2E-7): worker registers, does not verify email, lands on `/jobs/:id`, sees the disabled Apply + `<AuthBanner>` (Auth-shipped), verifies email via the test mailbox endpoint, the Apply button becomes active without a manual page refresh (after `useAccountMe().refetch()` triggered by focus or banner-close).
- **TEST-JOBS-207 (Must).** `jobs.role-gating.spec.ts` (E2E-8): worker visits `/my-jobs` → redirected to `/profile`; employer visits `/my-applications` → renders empty.
- **TEST-JOBS-208 (Must).** `jobs.guardrails.spec.ts` (E2E-9):
  - Visit each Jobs route (`/jobs`, `/jobs/:id`, `/my-jobs`, `/my-jobs/:id/applicants`, `/my-jobs/:id/edit`, `/my-applications`); assert `await page.locator('pre').filter({ hasText: 'JSON' }).count()` is 0.
  - Assert no `<input>` element has a placeholder matching `/comma[- ]separated/i`.
  - Hit `/api/docs` and assert the route shape includes the documented Jobs endpoints.
- **TEST-JOBS-209 (Should).** `jobs.mobile.spec.ts` (cross-cutting, JOBS-052): the Playwright spec runs at the 375 px viewport on `/jobs`, `/jobs/:id`, `/my-jobs`, `/my-applications` and asserts no horizontal scroll + tap targets ≥ 48 px on the primary CTAs.

### 6. Coverage & guardrails

- **TEST-JOBS-220 (Must).** Jest coverage thresholds in `backend/package.json` extended for `backend/src/job-post/` and `backend/src/job-application/`: floor at 60 % statements / 35 % branches per service file, 80 % statements on `*.controller.ts` (controllers are thin and easy to cover). DTOs excluded.
- **TEST-JOBS-221 (Should).** Vitest coverage in `web/vite.config.ts` includes the new Jobs pages and components in the report.
- **TEST-JOBS-222 (Must).** `npm run lint:tokens` passes after this feature merges; the suite does not introduce raw hex colours into any new spec or fixture.

### 7. Follow-ups discipline

- **TEST-JOBS-230 (Must).** Bugs surfaced by the suite are filed in `tasks/in-progress/jobs-applications/followups.md` (created on first finding) with the format used by `tasks/in-progress/profiles/followups.md` — `[JOBS-NNN]` ID + one-line summary + reproducing test ID + recommended fix scope. The suite **does not silently fix** any bug it reveals.
- **TEST-JOBS-231 (Must).** Tests that depend on un-shipped backend prerequisites (`BE-JOBS-1` / `BE-JOBS-2` / `BE-JOBS-3`) are written but `.skip`ped, with a comment citing the prerequisite ID. Removing the skip is the unblocker when the prerequisite ships.
- **TEST-JOBS-232 (Should).** A single `tasks/in-progress/jobs-applications/test-coverage-matrix.md` (or appendix in this spec) maps each `JOBS-NNN` ID to the `TEST-JOBS-NNN` IDs that cover it. Authored at the end of the implementation pass; ensures no requirement slipped through.

## Edge Cases

- **`<pre>{JSON.stringify(...)}</pre>` is reintroduced for "debugging" in a future PR.** The TEST-JOBS-100 / TEST-JOBS-170 / TEST-JOBS-208 guardrails fail.
- **A future refactor swaps `<ChipMultiSelect>` for a `<select multiple>` "to ship faster".** TEST-JOBS-121 fails on the comma-separated-input grep + TEST-JOBS-140 fails on keyboard nav.
- **Soft-freeze on edit becomes backend-enforced (BE-JOBS-4-style).** Frontend assertions in TEST-JOBS-131 still pass; add new `job-post.e2e-spec.ts` tests asserting backend rejects frozen-field edits.
- **Verification's tier vocabulary changes.** Profiles' `<VerificationBadge>` translates legacy values (`PROF-032`); Jobs tests stub the badge prop and don't assert specific tier strings.
- **`@@unique([job_post_id, worker_id])` is dropped to allow re-apply.** TEST-JOBS-081 fails; the policy change forces a spec amendment to JOBS-OQ-3.
- **Backend cascades application deletion on `DELETE /job-posts/:id` instead of blocking.** TEST-JOBS-012 catches it and files a follow-up against JOBS-031 — the frontend gate becomes the only safety net.

## Acceptance Criteria

- `cd backend && npm test` runs the new unit specs green, with un-shipped-prerequisite tests `.skip`ped (citing the prerequisite ID).
- `cd backend && npm run test:e2e` runs the new e2e specs green against the Testcontainer Postgres.
- `cd web && npm test` runs the new Vitest specs green.
- `cd web && npm run test:e2e` runs the new Playwright specs green; `E2E-N` map 1:1 to a passing test.
- Mentally re-introduce a JSON-dump `<pre>{JSON.stringify(jobs)}</pre>` on `JobBoardPage`: at least one of TEST-JOBS-100 / TEST-JOBS-170 / TEST-JOBS-208 goes red. Mentally drop the `EditJobPage` ownership gate: TEST-JOBS-130 goes red. Mentally swap `<ChipMultiSelect>` for `<select multiple>` with comma-separated value parsing: TEST-JOBS-121 + TEST-JOBS-140 go red.
- Production code under `backend/src/{job-post,job-application,specialisation,tag}/` and `web/src/pages/Job*` / `web/src/pages/My*` is **not modified** by this feature; bugs found are filed as follow-ups (TEST-JOBS-230).
- A coverage matrix exists (TEST-JOBS-232) showing every `JOBS-NNN` requirement and every `E2E-N` scenario maps to ≥ 1 `TEST-JOBS-NNN` test.

## Open Questions

- **TEST-JOBS-OQ-1.** Do we want a property-based / fuzz test on the chip-multiselect (e.g., fast-check) to catch keyboard-nav edge cases? Recommend: not in MVP — Playwright covers the realistic key sequences.
- **TEST-JOBS-OQ-2.** Should the Playwright e2e suite assert the `application_summary` aggregate on `/my-jobs` even before BE-JOBS-1 ships, by stubbing the backend response with MSW-on-the-fly? Recommend: no — Playwright should hit the real backend; if BE-JOBS-1 isn't shipped, the assertion is a `.skip`-then-unblock pattern, not a stub.
- **TEST-JOBS-OQ-3.** Where does `tests-jobs-applications/` live during the test-feature life cycle — `tasks/product/` like Verification, or `tasks/in-progress/` from day one? Recommend: opens in `tasks/in-progress/` the same week Jobs implementation begins, per repo `CLAUDE.md` "Tests are not optional"; lives in `tasks/done/` once green alongside the shipped Jobs feature.

## Decisions Log

- **2026-05-05 — Folder created.** `tasks/product/tests-jobs-applications/` opened the same day as the parent Jobs feature, per repo `CLAUDE.md` "Every shipped feature has tests" and the precedent set by `tests-auth-flow/` and `tests-profiles/`.
- **2026-05-05 — Reuse-only stack.** Vitest + RTL + MSW v2 (frontend unit), Playwright (frontend e2e), Jest + Supertest + Testcontainers (backend) — all already present in the repo via `tests-auth-flow` / `tests-profiles`. No new test runners.
- **2026-05-05 — Skip-and-unblock for un-shipped prerequisites.** Tests for `BE-JOBS-1` / `BE-JOBS-2` / `BE-JOBS-3` are written and `.skip`ped with a citation; removing the skip is the unblocker when each prerequisite ships (TEST-JOBS-231). Mirrors the `tests-profiles` pattern for un-shipped Stripe Connect endpoint tests.
- **2026-05-05 — No production-code edits from this feature.** Bugs surfaced get filed in `tasks/in-progress/jobs-applications/followups.md` (TEST-JOBS-230). Mirrors `tests-profiles` discipline.
