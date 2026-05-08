# Brief

## Feature

Test coverage for the Reviews feature (`tasks/product/reviews/`).

## Problem

Reviews fully closes the post-`COMPLETED` collaboration loop end-to-end without an escrow dependency. The parent spec encodes ~25 `REVIEW-NNN` requirements across 8 sections plus a 13-row Edge Cases list and a 6-entry Decisions Log. The behaviour it ships is uniquely fragile because:

- The **backend exists today and is already shipped, but is unprotected**: `backend/src/review/` has no `*.spec.ts` file and `backend/test/` has no `review.e2e-spec.ts`. Six already-shipped endpoints (`POST /reviews/collaboration/:id`, `GET /reviews/collaboration/:id`, `GET /reviews/worker/:id`, `GET /reviews/employer/:id`, `GET /reviews/:id`, `PATCH /reviews/:id/publish`) are running in production-shape with no regression guard. Status-machine bugs introduced by future PRs would land silently.
- **One new backend endpoint** (`GET /reviews/unpublished`, `REVIEW-046`) is added in this feature. Its `@Roles('STAFF')` guard is a privilege wall — a regression that lets a non-staff caller list draft reviews leaks unpublished customer feedback. Staff-guard testing is mandatory, not optional.
- **Reviewer role is server-derived** (`review.service.ts:33-39`) — the client never sends `reviewer_role`. A regression that lets the body override role authorisation is a privilege-escalation bug. Both unit + e2e must assert the server ignores client role hints.
- **The unique constraint** `@@unique([collaboration_id, reviewer_role])` (`schema.prisma:543`) caps each collab at one review per side. A regression in the `existing` check (`review.service.ts:41-50`) would let a reviewer overwrite their counterparty's review by spoofing role inference. Test must assert the duplicate path returns the documented `400 A <ROLE> review already exists`.
- **The publish-side recalculation** (`review.service.ts:171-234`) updates `WorkerProfile.rating_avg / rating_count` and `EmployerProfile.rating_avg / rating_count`. Frontend reads these as authoritative without re-deriving. A regression that drops the recalc, double-counts unpublished rows, or computes the wrong subject silently rots every profile-page rating header.
- **The publish-or-don't visibility rule** on `GET /reviews/:id` (`review.service.ts:139-169`) has four branches: published-public; draft-as-author; draft-as-staff; draft-as-stranger-or-anonymous. A regression that swaps any two branches turns a private draft into a public link. Each branch must have a test.
- **The eligibility gate** for `Leave a review` is `Collaboration.status === 'COMPLETED'`. Future "while we're here, why don't we let people review `IN_PROGRESS` collabs" PRs must fail loudly. The button-visibility matrix on the collab-detail summary card has 8 cases (`COMPLETED` × participant × no-existing-review × {worker side, employer side}); each is a hiding place for regressions.
- **Local draft autosave** (`REVIEW-017`) writes to `localStorage` under `review-draft:<collaborationId>:<clientProfileId>`. A regression that fails to clear the key on successful submit leaves stale drafts that re-fill the form on a subsequent collaboration. Tests must lock the lifecycle.
- **The `/reviews/:id` back-link priority** (`REVIEW-033`) reads `document.referrer`; staff-only `/admin*` branch is gated on `useAccountMe().isStaff`. A regression that exposes the admin back-link to non-staff users surfaces an internal route to the public.
- **The deleted `ReviewsPage.tsx`** is replaced by a redirect. A "while we're cleaning up, let's restore the old debug page" PR is exactly the kind of drift the test suite must prevent — assert the file is gone and the route is a `<Navigate>`.

## Goal

Lock the Reviews surface behind an automated test suite — backend unit + backend e2e + frontend unit + Playwright e2e — so that every `REVIEW-NNN` requirement (existing six + `REVIEW-046` new) and every Edge Case from the parent spec has at least one test that fails if the behaviour regresses. Cover the **existing-but-untested** review backend at the same time, since the parent feature has no excuse to ship a polished frontend on top of an unprotected backend (matching the discipline established by `tests-collaborations-polish` for the collaboration backend).

## Users

- TradeHub developers and AI agents working on Reviews, Escrow (parallel track), Staff Tools (next), and any track that consumes the Reviews contract or the `WorkerProfile.rating_avg` / `EmployerProfile.rating_avg` columns.
- Reviewers of PRs touching `backend/src/review/`, `web/src/pages/CollaborationDetailPage.tsx`, `web/src/pages/WorkerDetailPage.tsx`, `web/src/pages/EmployerDetailPage.tsx`, `web/src/pages/AdminPage.tsx`, the new `web/src/pages/ReviewDetailPage.tsx`, the new `<LeaveReviewSheet>` / `<ReviewCard>` components, or the deleted `web/src/pages/ReviewsPage.tsx`.

## Expected Outcome

- **Backend**: every review endpoint (existing six + new `GET /reviews/unpublished`) has unit + e2e coverage. Reviewer-role server-derivation, the `COMPLETED`-only gate, the unique-per-collab-per-role constraint, the four-branch visibility rule on `getById`, the `recalculateRatings` math (worker side + employer side, both empty and populated), and the staff-only guard on `unpublished` are exhaustively asserted. The flag-not-trusted-from-client-body anti-test is explicit (`reviewer_role: 'EMPLOYER'` in the body of a worker's create request must not be honoured).
- **Frontend**: every Reviews page renders, validates, and routes correctly under MSW-mocked API responses. The `<LeaveReviewSheet>` form asserts the overall-rating-required gate, the optional-sub-rating clear behaviour, the 5000-char comment ceiling + 4900+ danger counter, the four error-mapping branches (`No client profile`, `Reviews can only be created for completed collaborations`, `A <ROLE> review already exists`, `Not a participant in this collaboration`). The `<ReviewsSummaryCard>` button-visibility matrix is exhaustively asserted. Profile-page Reviews tabs assert pagination, empty state, skeleton, and link-to-permalink wrapping. The admin queue asserts row render + `Publish` mutation + optimistic-error rollback + `View →` link.
- **Permalink**: `/reviews/:id` exhaustively covers the four-branch visibility rule (200 published / 200 draft-as-author / 200 draft-as-staff / 403 draft-as-stranger / 404), the counterparty-chip parallel fetch (`REVIEW-030`), and the back-link priority (admin → worker → employer → fallback, with the staff-only gate on the admin branch).
- **Draft autosave**: the `localStorage` lifecycle (write on change with 300ms debounce; restore on re-open with banner; clear on submit / `Discard draft` / terminal-error; 30-day housekeeping) is locked.
- **Guardrails**: the deleted `ReviewsPage.tsx` is enforced by a grep-style assertion that the file no longer exists and the `/reviews` route is a `<Navigate>`. The "no `<pre>{JSON.stringify(...)}</pre>`" rule is enforced the same way `tests-jobs-applications` and `tests-collaborations-polish` enforce it. The privilege wall around `GET /reviews/unpublished` (REVIEW-046) gets a dedicated 403-for-non-staff Playwright assertion.
- A failing test points the developer at the offending `REVIEW-NNN` ID and the spec clause it broke.
- Bugs surfaced by the suite are filed in `tasks/in-progress/reviews/followups.md` (created on first finding); the suite **does not silently fix** any bug it reveals, matching the discipline established by `tests-jobs-applications` and `tests-collaborations-polish`.

## Constraints

- Do **not** add CI / CD configuration. Local-execution only (matches the precedent set by every prior `tests-*` folder).
- Do not change Reviews behaviour. Tests must not silently fix bugs they reveal — file follow-ups instead.
- Reuse the existing test stack: Vitest + RTL + MSW v2 (frontend), Jest + `jest-mock-extended` (backend unit), Testcontainers Postgres + Supertest + the `test-app.ts` harness (backend e2e), Playwright (frontend e2e), the `seedWorker*` / `seedEmployer*` factories, the `renderWithProfile()` helper, the `TestMailService`, the `parseApiError()` helper. No new test stack.
- Do not write tests for escrow side-effects (e.g. "release fires when both reviews published") — escrow is its own folder under a separate owner, and Reviews has no escrow coupling. The recalculation of `rating_avg` is the only publish-time side-effect this suite asserts.
- Mail / push / SMS notifications on publish are out of scope for the parent spec — no tests for them here.
- The new `GET /reviews/unpublished` endpoint (`REVIEW-046`) and its tests (`REVIEW-047`) are scoped to this test feature; the parent feature's spec specifies the contract, this test feature delivers the assertions.
