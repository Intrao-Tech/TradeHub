# Spec

## Summary

Lock the Reviews feature (`tasks/product/reviews/`) behind an automated test suite. Covers backend unit tests for `backend/src/review/` (none exist today), backend e2e tests against a real Postgres in a Testcontainer, frontend unit tests for every new / changed page and component, and Playwright e2e tests for the user flows on the Reviews surface.

Each `REVIEW-NNN` requirement and each Edge Case from the parent spec gets at least one asserting test. Backend e2e tests for the existing-but-untested review endpoints land at the same time, plus new coverage for the staff-only `GET /reviews/unpublished` endpoint introduced by `REVIEW-046`.

Test IDs are `TEST-REVIEW-NNN` so they can be referenced from commits and PRs. Where a test maps directly to a `REVIEW-NNN` requirement, the source ID is cited in the test description so a failure points at the broken spec clause.

## Problem

Reviews ships ~25 numbered requirements, 13 edge cases, and 9 acceptance criteria on top of a backend with **zero existing test coverage** (no `review.service.spec.ts`, no `review.e2e-spec.ts`). The full failure context lives in `brief.md`; the short version:

- Reviewer role is **server-derived** from `client_profile_id` matching `worker_id` / `employer_id` (`review.service.ts:33-39`). A regression that lets the body override the role is a privilege-escalation bug.
- The unique-per-collab-per-role constraint (`schema.prisma:543`) caps each collaboration at one review per side. A regression in the duplicate check leaks a second review per side.
- The four-branch visibility rule on `getById` (`review.service.ts:139-169`) — published-public / draft-as-author / draft-as-staff / draft-as-stranger-or-anonymous — is the only thing standing between a private draft and a public link.
- The publish-time recalculation of `WorkerProfile.rating_avg / rating_count` and `EmployerProfile.rating_avg / rating_count` (`review.service.ts:171-234`) is the entire feedback loop powering profile-page rating headers. Frontend reads these as authoritative without re-deriving.
- The new `GET /reviews/unpublished` endpoint (`REVIEW-046`) is staff-only; a regression that drops the role guard exposes draft customer feedback.
- The frontend moves from a single-screen JSON dump to: a `Leave a review` CTA on the collab detail card; real review listings on `/workers/:id` and `/employers/:id`; a `/reviews/:id` permalink with a referrer-aware back-link; an admin publish queue.
- The `<LeaveReviewSheet>` localStorage draft autosave has its own lifecycle (write / restore / clear / housekeeping) — a regression that fails to clear on submit re-fills future forms.

## Goals

- Run `npm test` and `npm run test:e2e` per package and exercise the entire Reviews surface end-to-end.
- Make every `REVIEW-NNN` requirement and every Edge Case from the parent spec fail-loud if it regresses.
- Use the existing tests-* tooling unchanged. No new test stack.
- Mock external services (mail) so the suite stays hermetic and runs offline.
- Keep the suite local-runnable; do not couple to any CI provider in this feature.

## Non-goals

- CI / CD wiring (separate task).
- Performance / load testing of `/reviews/worker/:id` and `/reviews/employer/:id` listings under high pagination.
- Visual regression of `<ReviewCard>` / sheet / queue rows.
- Mutation testing.
- Replacing the manual `lint:tokens` / dark-mode / 375 px smoke checklists in PR reviews.
- Tests for escrow side-effects (e.g. "release fires when both reviews published"). Reviews has no escrow coupling per the parent spec; escrow-side tests live in `tests-escrow/`.
- Tests for mail / push / SMS notifications on publish — explicitly out of scope for the parent spec.
- Re-testing Auth invariants (covered by `tests-auth-flow`), Profiles primitives (covered by `tests-profiles`), Jobs primitives (covered by `tests-jobs-applications`), or Collaborations primitives (covered by `tests-collaborations-polish`). Reviews tests stub or reuse them.

## User Flow

Not applicable — the "users" are developers running `npm test` and AI agents reasoning about Reviews invariants.

## Test surfaces

Reuses the layers and tooling established by `tests-auth-flow`, `tests-profiles`, `tests-jobs-applications`, and `tests-collaborations-polish`:

1. **Backend unit tests** — `*.spec.ts` colocated under `backend/src/review/`. Prisma is deep-mocked with `jest-mock-extended`. No Postgres touched.
2. **Backend e2e tests** — `*.e2e-spec.ts` under `backend/test/`. Boots `AppModule` against a Postgres Testcontainer, applies migrations, drives HTTP via Supertest. Reuses the `test-app.ts` harness.
3. **Frontend unit tests** — `*.test.ts(x)` colocated under `web/src/`. Vitest + jsdom + RTL + MSW v2.
4. **Frontend e2e tests** — `*.spec.ts` under `web/e2e/`. Playwright drives Chromium against the real Vite dev server plus the real backend boot.

## Requirements

Conventions: each requirement has a stable ID `TEST-REVIEW-NNN`. **Must** = blocks shipping this feature. **Should** = strongly preferred. Cross-references to the parent spec use `REVIEW-NNN`. Cross-references to other features use `AUTH-NNN` / `PROF-NNN` / `JOBS-NNN` / `COLLAB-NNN`.

### 1. Tooling

- **TEST-REVIEW-001 (Must).** No new test runners or libraries beyond what previous `tests-*` folders already added. If any of those have not yet landed, this feature is blocked on them.
- **TEST-REVIEW-002 (Must).** Extend `backend/test/util/factories.ts` with:
  - `seedReview(opts: { collaborationId, reviewerRole: 'WORKER' | 'EMPLOYER', overallRating?, qualityRating?, reliabilityRating?, communicationRating?, paymentRating?, safetyRating?, comment?, isPublished? })` — returns the persisted row. Defaults: `overallRating = 5`, optional sub-ratings `null`, `comment = null`, `isPublished = false`. When `isPublished: true`, sets `published_at` and triggers the same `recalculateRatings()` path the production code uses (call the service or mirror the math; document the choice in a code comment).
- **TEST-REVIEW-003 (Must).** Extend `web/src/test/factories.ts` with:
  - `mockReview(overrides?)` — returns a Review shape compatible with `GET /reviews/collaboration/:id` and rows in `GET /reviews/{worker,employer}/:id`. Defaults to `is_published: true`.
  - `mockReviewDraft(overrides?)` — convenience for `is_published: false, published_at: null`.
  - `mockReviewListResponse(items, overrides?)` — wraps `items` in the paginated envelope `{ items, total, page, limit, totalPages }`.
- **TEST-REVIEW-004 (Must).** Add `web/src/test/handlers/reviews.ts` — MSW v2 handlers for: `POST /reviews/collaboration/:id`, `GET /reviews/collaboration/:id`, `GET /reviews/worker/:id`, `GET /reviews/employer/:id`, `GET /reviews/:id`, `PATCH /reviews/:id/publish`, `GET /reviews/unpublished`. Per-test override pattern matches `tests-collaborations-polish`.

### 2. Backend unit tests (mocked Prisma)

- **TEST-REVIEW-010 (Must).** `review.service.spec.ts` `create()` role-derivation (`REVIEW-013`, `review.service.ts:32-39`):
  - Caller's `clientProfileId === collaboration.worker_id` → `reviewer_role = 'WORKER'`.
  - Caller's `clientProfileId === collaboration.employer_id` → `reviewer_role = 'EMPLOYER'`.
  - Caller's `clientProfileId` matches neither → `ForbiddenException('Not a participant')`.
  - **Anti-test:** body containing `reviewer_role: 'EMPLOYER'` is *not* honoured when the caller is the worker — server-derived value wins. (`CreateReviewDto` does not declare `reviewer_role`, so this is a validation-and-shape assertion — confirms a future "let's accept role from the client" PR fails at compile time.)
- **TEST-REVIEW-011 (Must).** `review.service.spec.ts` `create()` `COMPLETED`-only gate (`REVIEW-013`):
  - `status === 'COMPLETED'` → review created.
  - `status === 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'REJECTED' | 'DISPUTED'` → `BadRequestException('Reviews can only be created for completed collaborations')` for each of the five non-COMPLETED states.
  - Missing collaboration → `NotFoundException('Collaboration not found')`.
- **TEST-REVIEW-012 (Must).** `review.service.spec.ts` `create()` unique-per-role enforcement (`schema.prisma:543`):
  - Existing `WORKER` review on the collaboration, caller is the worker → `BadRequestException('A WORKER review already exists for this collaboration')`.
  - Existing `EMPLOYER` review, caller is the employer → mirror.
  - Existing `WORKER` review, caller is the **employer** → 201 (employer's first review on this collab is independent).
- **TEST-REVIEW-013 (Must).** `review.service.spec.ts` `create()` rating + comment field passthrough:
  - All six rating fields (overall + 5 optional) round-trip from DTO into the persisted row.
  - Optional sub-ratings default to `null` when omitted from the DTO.
  - Comment over 5000 chars rejected by class-validator (assert via DTO-level test under `dto/create-review.dto.spec.ts`).
- **TEST-REVIEW-014 (Must).** `review.service.spec.ts` `getById()` four-branch visibility (`REVIEW-032`, `review.service.ts:139-169`):
  - Published review, anonymous caller → row.
  - Published review, any logged-in caller → row.
  - Draft review, caller is the reviewer (matches `worker_id` for WORKER reviewer or `employer_id` for EMPLOYER reviewer) → row.
  - Draft review, staff caller → row.
  - Draft review, anonymous caller → `ForbiddenException('This review is not published')`.
  - Draft review, logged-in non-participant non-staff → `ForbiddenException`.
  - Missing review → `NotFoundException('Review not found')`.
- **TEST-REVIEW-015 (Must).** `review.service.spec.ts` `getBySubject()` `is_published` filter (`REVIEW-020`):
  - Worker subject: published EMPLOYER reviews only — drafts excluded, WORKER-side reviews about other parties excluded.
  - Employer subject: published WORKER reviews only — mirror.
  - Pagination: `page=2, limit=10` skips the first 10, returns up to 10.
  - `orderBy: { published_at: 'desc' }` — newest published first.
  - `total` is the count under the same `where`, not the unfiltered table.
- **TEST-REVIEW-016 (Must).** `review.service.spec.ts` `publish()` happy path:
  - Draft review → 200, `is_published: true`, `published_at` set to `now()`.
  - Already-published review → 200 (idempotent, returns the existing row without re-stamping `published_at`).
  - Missing review → `NotFoundException`.
- **TEST-REVIEW-017 (Must).** `review.service.spec.ts` `recalculateRatings()` math, EMPLOYER side (`review.service.ts:171-205`):
  - One published EMPLOYER review with `overall_rating: 5` on worker X → `WorkerProfile.rating_avg = 5.00, rating_count = 1`.
  - Two published EMPLOYER reviews `[5, 3]` on worker X → `rating_avg = 4.00, rating_count = 2`.
  - Mix: 2 published + 1 unpublished → published-only counted (`rating_avg = 4.00, rating_count = 2`).
  - Zero published reviews after publishing one then somehow having it removed (synthetic) → `rating_avg = 0, rating_count = 0` (asserts the `?? 0` fallback at `:198`).
  - WORKER-side reviews on the same worker's collabs are **not** counted (they aren't *about* the worker).
- **TEST-REVIEW-018 (Must).** `review.service.spec.ts` `recalculateRatings()` math, WORKER side (`review.service.ts:206-233`): mirror of TEST-REVIEW-017, asserting `EmployerProfile.rating_avg / rating_count`.
- **TEST-REVIEW-019 (Must).** `review.service.spec.ts` `getUnpublished()` (REVIEW-046):
  - Returns only `is_published: false` rows.
  - Pagination + ordering (`created_at desc`).
  - Includes `collaboration` per the spec'd `include`.
  - Empty result → `{ items: [], total: 0, page, limit, totalPages: 0 }`.
- **TEST-REVIEW-020 (Must).** `review.service.spec.ts` `assertCollaborationParticipant()`:
  - Staff caller → no throw, no DB fetch.
  - Caller without `clientProfileId` and not staff → `ForbiddenException('No client profile')`.
  - Caller's profile id matches `worker_id` or `employer_id` → no throw.
  - Caller's profile id matches neither → `ForbiddenException('Not a participant in this collaboration')`.
  - Missing collaboration → `NotFoundException`.

### 3. Backend e2e tests (real Postgres)

Fixtures: each test seeds a worker, an employer, and a `COMPLETED` collaboration via `seedCollaboration`. Auth uses the `getAuthHeader` helper from existing tests-* folders.

- **TEST-REVIEW-070 (Must).** `POST /reviews/collaboration/:collaborationId` (`REVIEW-013`):
  - Worker JWT submits → 201, row created with `reviewer_role: 'WORKER'`, `is_published: false`, `published_at: null`.
  - Employer JWT submits → 201 mirror.
  - Anonymous → 401.
  - Worker JWT but `Account.status !== 'ACTIVE'` → 403 (asserts `AccountStateGuard` from `review.controller.ts:33`).
  - Worker JWT but `email_verified === false` → 403 (asserts `RequiresVerifiedEmail` from `:34`).
  - Worker submits twice → second → 400 with body containing `A WORKER review already exists`.
  - Worker submits on a `PENDING` collab → 400 with `Reviews can only be created for completed`.
  - Worker submits on a collab they're not part of → 403 with `Not a participant`.
  - Worker submits with a body containing `reviewer_role: 'EMPLOYER'` → 201, persisted row has `reviewer_role: 'WORKER'` (server-derived; body field is silently ignored by `class-transformer` strict whitelist).
- **TEST-REVIEW-071 (Must).** `GET /reviews/collaboration/:collaborationId`:
  - Worker JWT → both worker-side and employer-side reviews on the collab (drafts and published alike, since the participant has access).
  - Employer JWT → mirror.
  - Non-participant JWT → 403.
  - Staff JWT → both rows.
  - Anonymous → 401.
- **TEST-REVIEW-072 (Must).** `GET /reviews/worker/:workerId` (`REVIEW-020`):
  - Anonymous → 200 with published EMPLOYER reviews only.
  - Pagination: seed 12 published reviews, `?page=2&limit=5` → items 6-10 newest-first.
  - Drafts not included even when caller is the worker themselves (the public list never leaks drafts; drafts go through `getById`).
- **TEST-REVIEW-073 (Must).** `GET /reviews/employer/:employerId` — mirror of TEST-REVIEW-072.
- **TEST-REVIEW-074 (Must).** `GET /reviews/:id` four-branch visibility (`REVIEW-032`):
  - Published, anonymous → 200.
  - Draft, anonymous → 403.
  - Draft, reviewer JWT → 200.
  - Draft, counterparty JWT (the reviewee) → 403 (only the *reviewer* and staff see drafts).
  - Draft, staff JWT → 200.
  - Missing → 404.
- **TEST-REVIEW-075 (Must).** `PATCH /reviews/:id/publish` (`REVIEW-042`):
  - Staff JWT → 200, `is_published: true`, `published_at` populated.
  - Non-staff JWT → 403.
  - Anonymous → 401.
  - After publish: `WorkerProfile.rating_avg` / `rating_count` (or `EmployerProfile.*` for WORKER reviewer) reflect the published review (asserts the recalc actually fires through the live service path).
  - Re-publish (same id, already published) → 200, `published_at` unchanged.
- **TEST-REVIEW-076 (Must).** `GET /reviews/unpublished` (`REVIEW-046`):
  - Staff JWT → 200, only `is_published: false` rows.
  - Non-staff JWT → 403.
  - Anonymous → 401.
  - Pagination newest-first (`created_at desc`).
  - Empty result returns the paginated envelope with `total: 0, totalPages: 0`.
  - **Privilege wall:** seed two drafts under different collaborations, hit the endpoint as a non-staff worker who is the reviewer of one of the drafts → 403, **not** "show me only my drafts" leakage. The endpoint is all-or-nothing on staff.
- **TEST-REVIEW-077 (Should).** Cross-feature: `Collaboration.status` transitions to `COMPLETED` (via `PATCH /collaborations/:id/status`, owned by `COLLAB-021`) → subsequently `POST /reviews/collaboration/:id` works. Asserts the collaboration → reviews handoff for the production flow.

### 4. Frontend unit tests (Vitest + RTL + MSW)

#### 4.1 `<LeaveReviewSheet>` (`web/src/components/reviews/LeaveReviewSheet.test.tsx`)

- **TEST-REVIEW-100 (Must).** Sheet opens; first interactive element is the overall-rating star (`REVIEW-016`).
- **TEST-REVIEW-101 (Must).** Submit is disabled while overall rating is 0 / not picked. Setting it to ≥ 1 enables submit (`REVIEW-012`).
- **TEST-REVIEW-102 (Must).** Optional sub-ratings: setting + clearing each of the five returns to `unset`; submit body for an only-overall-rated review contains exactly `{ overall_rating, comment? }` (`REVIEW-012`).
- **TEST-REVIEW-103 (Must).** Comment 5000-char ceiling: counter shows `<n> / 5000`, danger-coloured at 4900+, submit blocked at > 5000 (`REVIEW-012`).
- **TEST-REVIEW-104 (Must).** Happy-path submit: success closes sheet, fires toast "Review submitted — staff will review…", parent's `onSubmitted` called with the response (`REVIEW-013`).
- **TEST-REVIEW-105 (Must).** Error mapping — each of the four documented error shapes (`REVIEW-014`):
  - `400 No client profile for this account` → inline alert with `<Link to="/profile">`. Sheet stays open.
  - `400 Reviews can only be created for completed collaborations` → sheet closes, warning toast, parent refetch is invoked.
  - `400 A WORKER review already exists` (and EMPLOYER mirror) → sheet closes, info toast, parent refetch.
  - `403 Not a participant in this collaboration` → sheet closes, danger toast.
  - `500` (representative "anything else") → inline alert via `parseApiError()`. Sheet stays open.

#### 4.2 Draft autosave (`<LeaveReviewSheet>` + `localStorage`)

- **TEST-REVIEW-110 (Must).** While sheet is open, a debounced 300ms after the user changes a field, `localStorage.setItem` is called with key `review-draft:<collaborationId>:<clientProfileId>` and a JSON payload of the form state (`REVIEW-017`).
- **TEST-REVIEW-111 (Must).** Re-opening the sheet for the same collab + same user with a stored draft hydrates the form **and** renders the `Draft restored — last edited <relative-time>` banner with a `Discard draft` button.
- **TEST-REVIEW-112 (Must).** `Discard draft` removes the key and resets the form to defaults; banner disappears.
- **TEST-REVIEW-113 (Must).** Successful submit clears the key (no draft restore on next open).
- **TEST-REVIEW-114 (Must).** Each of the four "terminal" error branches in REVIEW-014 (the ones that close the sheet — race-completed, duplicate, non-participant) **also** clear the key. (The "stays open" branch — `No client profile`, fallback — does *not* clear, so the user can fix and resubmit.)
- **TEST-REVIEW-115 (Should).** Housekeeping: on sheet open, keys older than 30 days under the `review-draft:` prefix are cleared. Use `vi.setSystemTime` to age out a seeded key.

#### 4.3 `<ReviewsSummaryCard>` extension (`web/src/pages/CollaborationDetailPage.test.tsx`)

- **TEST-REVIEW-120 (Must).** Button-visibility matrix (8 cases, `REVIEW-010`):
  - `COMPLETED` × worker viewer × no worker review yet → worker-side button visible.
  - `COMPLETED` × worker viewer × worker review exists → button hidden, `Draft` / `Published` badge shown.
  - `COMPLETED` × employer viewer × no employer review yet → employer-side button visible.
  - `COMPLETED` × employer viewer × employer review exists → button hidden.
  - `IN_PROGRESS` × any viewer → no button on either side.
  - `PENDING`, `CONFIRMED`, `REJECTED`, `DISPUTED` × any viewer → no button on either side.
  - Non-participant viewer × `COMPLETED` → no button (the existing card content stays unchanged).
  - Staff viewer × `COMPLETED` → no button (staff publishes; staff does not author).
- **TEST-REVIEW-121 (Must).** Account-state gating (`REVIEW-015`): when `useAccountMe()` returns `Account.status !== 'ACTIVE'` or `verification_state !== 'ACTIVE'`, the button renders disabled with the documented tooltip linking to `/settings/security`.
- **TEST-REVIEW-122 (Must).** Click button → `<LeaveReviewSheet>` opens with the correct `collaborationId` prop.

#### 4.4 Profile-page Reviews tabs (`WorkerDetailPage.test.tsx`, `EmployerDetailPage.test.tsx`)

- **TEST-REVIEW-130 (Must).** Worker page Reviews tab calls `GET /reviews/worker/:id?page=1&limit=10` and renders `<ReviewCard>` for each item (`REVIEW-020`).
- **TEST-REVIEW-131 (Must).** Pagination: `Page X of Y · N reviews` footer; `Previous` disabled on page 1, `Next` disabled on last page.
- **TEST-REVIEW-132 (Must).** Empty state when `total === 0` (`REVIEW-023`).
- **TEST-REVIEW-133 (Should).** Skeleton render while in flight (`REVIEW-024`).
- **TEST-REVIEW-134 (Must).** Each card is wrapped in a `<Link to="/reviews/:id">` (asserts `linkToPermalink` default true).
- **TEST-REVIEW-135 (Must).** Mirror of TEST-REVIEW-130..134 for the employer page.

#### 4.5 `<ReviewCard>` (`web/src/components/reviews/ReviewCard.test.tsx`)

- **TEST-REVIEW-140 (Must).** Header row renders reviewer-side label (`From an employer` / `From a worker`), `Published` badge, and a `<time>` for `published_at` (`REVIEW-021`).
- **TEST-REVIEW-141 (Must).** Rating block renders overall + numeric label, plus all five sub-ratings (`<StarRating size="sm">` or `—` when null).
- **TEST-REVIEW-142 (Must).** Comment renders escaped (HTML in the comment is rendered as text); empty comment renders the `<em>No comment</em>` fallback.
- **TEST-REVIEW-143 (Must).** Footer renders `Project: <project_type>` + dates from `review.collaboration`, with the documented fallbacks when one or both date fields are null.
- **TEST-REVIEW-144 (Must).** When `linkToPermalink={false}` (used on `/reviews/:id`), the card is not wrapped in a `<Link>`.
- **TEST-REVIEW-145 (Must).** `Draft` badge renders instead of `Published` when `is_published: false`.

#### 4.6 `/reviews/:id` page (`web/src/pages/ReviewDetailPage.test.tsx`)

- **TEST-REVIEW-150 (Must).** 200 published, anonymous viewer → renders the page with counterparty chip, no draft banner, no collab-link footer (`REVIEW-031`).
- **TEST-REVIEW-151 (Must).** 200 draft, author viewer → sticky `<Banner variant="warning">This review is not public yet…` rendered, collab-link footer visible.
- **TEST-REVIEW-152 (Must).** 200 draft, staff viewer → same as TEST-REVIEW-151 plus collab-link visible.
- **TEST-REVIEW-153 (Must).** 403 (draft, stranger) → `<EmptyState title="Review not available">` (`REVIEW-032`).
- **TEST-REVIEW-154 (Must).** 404 → `<EmptyState title="Review not found">`.
- **TEST-REVIEW-155 (Must).** Counterparty chip parallel fetch (`REVIEW-030`):
  - `reviewer_role: 'EMPLOYER'` → `GET /worker/:workerId` is fired in parallel with `GET /reviews/:id`.
  - `reviewer_role: 'WORKER'` → `GET /employer/:employerId` mirror.
  - Counterparty fetch in flight → `<Skeleton>` rendered for the chip.
  - Counterparty fetch 404 → fallback `Worker #<id>` / `Employer #<id>` with initials avatar.
- **TEST-REVIEW-156 (Must).** Back-link priority (`REVIEW-033`):
  - `document.referrer` matches `<origin>/admin*` AND `useAccountMe().isStaff` → `← Back to publish queue` linking to `/admin?tab=reviews`.
  - `document.referrer` matches `<origin>/admin*` BUT non-staff viewer → fallback (no admin leak).
  - `document.referrer` matches `<origin>/workers/:id` → `← Back to <name>'s reviews`.
  - `document.referrer` matches `<origin>/employers/:id` → mirror.
  - Empty / external referrer → `← Back` calling `navigate(-1)` if history is non-empty.
  - Empty referrer + empty history → `← Back` linking to `/`.

#### 4.7 Admin publish queue (`web/src/pages/AdminPage.reviews.test.tsx`)

- **TEST-REVIEW-160 (Must).** Tab opens → calls `GET /reviews/unpublished?page=1&limit=20`. Response items render as queue rows (`REVIEW-040`).
- **TEST-REVIEW-161 (Must).** Each row renders: reviewer-role badge, collab link, overall rating + numeric, comment preview truncated to 200 chars with `Read more` expanding inline, `Submitted <relative-time>`, `[Publish]` button, and `View →` link to `/reviews/:id` (`REVIEW-041`).
- **TEST-REVIEW-162 (Must).** `Publish` happy path (`REVIEW-042`): optimistic remove, `PATCH /reviews/:id/publish` fires, success toast.
- **TEST-REVIEW-163 (Must).** `Publish` error: row is restored, inline alert via `parseApiError()`.
- **TEST-REVIEW-164 (Must).** Pagination: `Previous` / `Next` (`REVIEW-043`).
- **TEST-REVIEW-165 (Should).** Empty queue state (`REVIEW-044`).
- **TEST-REVIEW-166 (Must).** Bare-ID `Publish review` form (`AdminPage.tsx:614-625`) is gone — `screen.queryByLabelText('Review ID')` returns null.

#### 4.8 Route registration

- **TEST-REVIEW-170 (Must).** `/reviews` resolves to a `<Navigate>`: logged-in → `/collaborations?from=reviews`; anonymous → `/login` (`REVIEW-002`, `REVIEW-004`).
- **TEST-REVIEW-171 (Must).** `/reviews/:id` is registered and **not** wrapped in `<Protected>` (`REVIEW-003`, `REVIEW-051`).
- **TEST-REVIEW-172 (Must).** `web/src/pages/ReviewsPage.tsx` does not exist — file-existence assertion via `vi.dynamicImport` rejecting (or a tooling test in REVIEW-220).

### 5. Frontend e2e tests (Playwright)

Reuses the `registerWorker()` / `registerEmployer()` helpers, the `seedReview` test-only API helper from REVIEW-002, and the live backend boot.

- **TEST-REVIEW-200 (Must).** Worker leave-review happy path: register worker + employer → seed a `COMPLETED` collaboration → worker logs in → navigates to `/collaborations/:id` → clicks `Leave a review` → fills overall + comment → submits → toast → summary card shows `Worker review · Draft` and the button hides.
- **TEST-REVIEW-201 (Must).** Employer leave-review happy path: mirror.
- **TEST-REVIEW-202 (Must).** Public visitor browses `/workers/:id` → `Reviews` tab shows the published reviews list. Clicks a card → lands on `/reviews/:id` → back-link reads `← Back to <name>'s reviews` and routes back to the Reviews tab.
- **TEST-REVIEW-203 (Must).** Staff publish flow: staff logs in → `/admin` → `Reviews` tab → sees a queue row for the worker's draft review → clicks `Publish` → row disappears → public visitor reloading `/workers/:id` Reviews tab now sees the review (regression-tests the recalc + display loop end-to-end).
- **TEST-REVIEW-204 (Must).** Draft autosave persistence: worker opens leave-review sheet, half-fills form, closes sheet without submitting (clicks the `<Sheet>` X), re-opens → form is hydrated, banner reads `Draft restored…`.
- **TEST-REVIEW-205 (Must).** Permalink visibility:
  - Anonymous opens `/reviews/:id` for a published review → page renders.
  - Anonymous opens `/reviews/:id` for a draft → `Review not available` empty state.
  - Reviewer opens their own draft `/reviews/:id` → page renders with draft banner.
- **TEST-REVIEW-206 (Must).** Privilege wall on `/reviews/unpublished`: non-staff worker hits the URL via the API client → 403 (Playwright `request` fixture). Asserts the role guard via the wire, not just the unit test.
- **TEST-REVIEW-207 (Should).** Mobile 375 px: worker leave-review flow (TEST-REVIEW-200) on a 375 px viewport — no horizontal scroll, sheet renders full-screen, all CTAs ≥ 48 px.

### 6. Guardrails (tooling / negative assertions)

- **TEST-REVIEW-220 (Must).** No `<pre>{JSON.stringify(...)}</pre>` rendering on any reviews-related surface. A Vitest tooling test greps `web/src/pages/Review*.tsx`, `web/src/components/reviews/**.tsx`, `web/src/pages/AdminPage.tsx` (Reviews-tab subtree), `web/src/pages/{Worker,Employer}DetailPage.tsx` (Reviews-tab subtree) for `JSON.stringify(`. Pattern matches `tests-jobs-applications` / `tests-collaborations-polish`.
- **TEST-REVIEW-221 (Must).** `web/src/pages/ReviewsPage.tsx` does not exist (file-system assertion).
- **TEST-REVIEW-222 (Must).** `npm run lint:tokens` clean on the changed files in this feature. Same tooling test as `tests-collaborations-polish`.
- **TEST-REVIEW-223 (Should).** `web/src/App.tsx` no longer imports `ReviewsPage` and no longer has a `{ to: '/reviews', label: 'Reviews' }` nav item — file content asserted via a string-grep tooling test.

### 7. Coverage matrix discipline

- **TEST-REVIEW-232 (Must).** Every `REVIEW-NNN` requirement and every Edge Case in the parent spec maps to ≥ 1 `TEST-REVIEW-NNN` in this folder. The mapping lives in `coverage-matrix.md`. PRs that add a new `REVIEW-NNN` to the parent spec **must** add the corresponding row to `coverage-matrix.md` in the same change set.

## Edge Cases

The parent spec's 13 Edge Cases are covered by the unit + e2e tests above:

- **Worker is the responder, employer is the initiator (or vice versa)** — TEST-REVIEW-010 (role derivation by client_profile_id, not initiator).
- **A user who is both worker and employer on the same TradeHub account** — TEST-REVIEW-010 (role derivation is unambiguous because each collaboration row has only one of the two ids match the caller).
- **Re-submit after network drop** — TEST-REVIEW-105 (duplicate-review error path).
- **Two-tab race** — TEST-REVIEW-105, TEST-REVIEW-120 (button visibility flips after refetch).
- **Backend `rating_avg` recalculated to 0** — TEST-REVIEW-017 (zero-published case).
- **Comment contains valid HTML / Markdown** — TEST-REVIEW-142 (escaped, plain-text rendering).
- **Sub-ratings: pick → clear → re-pick** — TEST-REVIEW-102 (final value sent, not `null`).
- **Public visitor opens `/reviews/:id` for a draft** — TEST-REVIEW-153 / TEST-REVIEW-205.
- **`/reviews/:id` with a `Review` whose `Collaboration` was deleted** — TEST-REVIEW-143 (footer fallback when collaboration data is missing — synthetic test).
- **Network failure on first list load** — TEST-REVIEW-130 (alert + retry assertion).
- **Staff queue shows 0 unpublished reviews** — TEST-REVIEW-165.
- **Review with all five sub-ratings null + no comment** — TEST-REVIEW-141 / TEST-REVIEW-142 (renders without crash).
- **`<LeaveReviewSheet>` opened, token expires, submit hits 401** — covered by the global `<ApiError>` interceptor's existing tests in `tests-auth-flow`; no duplicate test here.

## Acceptance Criteria

- `cd backend && npm test` runs the new unit specs in `backend/src/review/` green.
- `cd backend && npm run test:e2e` runs the new `review.e2e-spec.ts` green against a Postgres Testcontainer.
- `cd web && npm test` runs the new Vitest specs green; the JSON-stringify guardrail (TEST-REVIEW-220) and the deleted-file guardrail (TEST-REVIEW-221) both run as part of the suite.
- `cd web && npm run test:e2e` runs the Playwright specs green (excluding any `.fixme` blocks gated on missing helpers, documented in `coverage-matrix.md`).
- `coverage-matrix.md` shows every `REVIEW-NNN` in the parent spec mapped to ≥ 1 `TEST-REVIEW-NNN` in this folder. (TEST-REVIEW-232.)
- A failing test description cites the offending `REVIEW-NNN` so the PR reviewer can find the broken clause without reading the test body.

## Open Questions

(None at folder creation. Add here as they surface during implementation. Resolved entries move to a Decisions Log at the bottom.)
