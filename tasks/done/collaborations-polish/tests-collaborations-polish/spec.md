# Spec

## Summary

Lock the Collaborations Polish feature (`tasks/product/collaborations-polish/`) behind an automated test suite. Covers backend unit tests for `backend/src/collaboration/` (none exist today), backend e2e tests against a real Postgres in a Testcontainer, frontend unit tests for every new / changed page and component, and Playwright e2e tests for the user flows on the Collaborations surface.

Each `COLLAB-NNN` requirement and each Edge Case from the parent spec gets at least one asserting test. Backend e2e tests for the existing-but-untested collaboration endpoints land at the same time, because polishing a frontend on top of an unprotected state-machine backend is a no-go.

Test IDs are `TEST-COLLAB-NNN` so they can be referenced from commits and PRs. Where a test maps directly to a `COLLAB-NNN` requirement, the source ID is cited in the test description so a failure points at the broken spec clause.

## Problem

Collaborations Polish ships ~30 requirements, 12 edge cases, and 4 acceptance scenarios on top of a backend with **zero existing test coverage** (no `collaboration.service.spec.ts`, no `collaboration.e2e-spec.ts`). The full failure context lives in `brief.md`; the short version:

- Status transitions encode authorisation (responder-only Confirm / Reject; either-party Start / Complete; flag from any state by participant or staff). Today's only protection is the `if/else` chain in `collaboration.service.ts:124-178`. A regression here is a privilege-escalation bug.
- The `create()` role-resolution branch (`worker_id` vs `employer_id` matching `initiator`) has four legal combinations and four illegal ones; today's only protection is `BadRequestException`s in `collaboration.service.ts:36-66`.
- The frontend moves from a single-screen JSON dump to a list page + detail page + create sheet + flag dialog + read-only summary cards. The read-only-ness of the escrow summary card is **the** load-bearing scope-decision of this feature; a future PR that re-introduces the Fund button must fail loud.
- The action-bar legality matrix on `/collaborations/:id` has eight branches; one missed branch is a regression that ships.
- The flag dialog moves from free-form to a 8-category enum with a special-case rule on `OTHER`; without unit coverage, the category list silently drifts.

## Goals

- Run `npm test` and `npm run test:e2e` per package and exercise the entire Collaborations surface end-to-end.
- Make every `COLLAB-NNN` requirement and every Edge Case from the parent spec fail-loud if it regresses.
- Use the existing tests-* tooling unchanged. No new test stack.
- Mock external services (mail) so the suite stays hermetic and runs offline.
- Keep the suite local-runnable; do not couple to any CI provider in this feature.

## Non-goals

- CI / CD wiring (separate task).
- Performance / load testing of `/collaborations` listing under high pagination.
- Visual regression of the cards / pages.
- Mutation testing.
- Replacing the manual `lint:tokens` / dark-mode / 375 px smoke checklists in PR reviews.
- Tests for chat behaviour. The chat summary card's content (unread count, last message, deep-link to a specific conversation) lives in the **chat** feature folder and is covered by `tests-chat/`.
- Tests for real Stripe-Connect escrow logic (Connect onboarding, real `transfers.create` / `refunds.create` / disputes, staff confirm-deposit / release / refund). All of those live in the **escrow** feature folder and are covered by `tests-escrow/`.
- Re-testing Auth invariants (covered by `tests-auth-flow`), Profiles primitives (covered by `tests-profiles`), or Jobs primitives (covered by `tests-jobs-applications`). Collaborations tests stub or reuse them.

## User Flow

Not applicable — the "users" are developers running `npm test` and AI agents reasoning about Collaborations invariants.

## Test surfaces

Reuses the layers and tooling established by `tests-auth-flow`, `tests-profiles`, and `tests-jobs-applications`:

1. **Backend unit tests** — `*.spec.ts` colocated under `backend/src/collaboration/`. Prisma is deep-mocked with `jest-mock-extended`. No Postgres touched.
2. **Backend e2e tests** — `*.e2e-spec.ts` under `backend/test/`. Boots `AppModule` against a Postgres Testcontainer, applies migrations, drives HTTP via Supertest. Reuses the `test-app.ts` harness.
3. **Frontend unit tests** — `*.test.ts(x)` colocated under `web/src/`. Vitest + jsdom + RTL + MSW v2.
4. **Frontend e2e tests** — `*.spec.ts` under `web/e2e/`. Playwright drives Chromium against the real Vite dev server plus the real backend boot established by `tests-auth-flow`.

## Requirements

Conventions: each requirement has a stable ID `TEST-COLLAB-NNN`. **Must** = blocks shipping this feature. **Should** = strongly preferred. Cross-references to the parent spec use `COLLAB-NNN`. Cross-references to Auth / Profiles / Jobs use `AUTH-NNN` / `PROF-NNN` / `JOBS-NNN`.

### 1. Tooling

- **TEST-COLLAB-001 (Must).** No new test runners or libraries beyond what `tests-auth-flow`, `tests-profiles`, and `tests-jobs-applications` already added. If any of those have not yet landed, this feature is blocked on them (see status.md).
- **TEST-COLLAB-002 (Must).** Extend `backend/test/util/factories.ts` with:
  - `seedCollaboration(opts: { workerId, employerId, initiatedBy?, status?, projectType?, sitePostcode?, agreedAmount?, referralId?, jobPostId?, flagged?, flagReason? })` — returns the persisted row with relations expanded per the controller's include shape. Handles `confirmed_at` / `started_at` / `ended_at` based on `status`.
  - `seedEscrowTransaction(opts: { collaborationId, status?, jobAmount?, platformFee?, referralCommission?, workerPayout? })` — minimal seeder for the read-only escrow summary card scenarios. (No Stripe fields populated.)
- **TEST-COLLAB-003 (Must).** Extend `web/src/test/factories.ts` with:
  - `mockCollaboration(overrides?)` — returns a Collaboration shape compatible with `GET /collaborations/:id` and rows in `GET /collaborations/me`.
  - `mockEscrowTransaction(overrides?)` — for read-only escrow card states; one helper per status (`CREATED` / `DEPOSIT_PENDING` / `HELD` / `RELEASED` / `REFUNDED` / `DISPUTED`).
- **TEST-COLLAB-004 (Must).** Add `web/src/test/handlers/collaborations.ts` — MSW v2 handlers for `POST /collaborations`, `GET /collaborations/me`, `GET /collaborations/:id`, `PATCH /collaborations/:id/status`, `POST /collaborations/:id/flag`. Per-test override pattern matches `tests-profiles` and `tests-jobs-applications`.
- **TEST-COLLAB-005 (Should).** Add `web/src/test/handlers/escrow.ts` — MSW v2 handler for `GET /escrow/collaboration/:id` only. (No mutation handlers; the feature does not call escrow mutations.)

### 2. Backend unit tests (mocked Prisma)

- **TEST-COLLAB-010 (Must).** `collaboration.service.spec.ts` `create()` role-resolution (`COLLAB-030` parent, `collaboration.service.ts:36-66`):
  - Worker initiates with `employer_id` only → 201, `initiated_by = 'WORKER'`, `worker_id = caller`, `employer_id = body.employer_id`.
  - Employer initiates with `worker_id` only → 201 mirror.
  - Worker passes `worker_id` → `BadRequestException`.
  - Employer passes `employer_id` → `BadRequestException`.
  - Worker omits `employer_id` → `BadRequestException`.
  - Employer omits `worker_id` → `BadRequestException`.
  - `worker_id === employer_id` → `BadRequestException`.
  - All Decimal casts on `agreed_amount` / `referral_id` round-trip correctly (`Prisma.Decimal`).
- **TEST-COLLAB-011 (Must).** `collaboration.service.spec.ts` `getByIdForUser()` access control:
  - Worker-party reads → row.
  - Employer-party reads → row.
  - Non-party non-staff reads → `ForbiddenException`.
  - Staff reads → row regardless of party membership.
  - Caller without `clientProfileId` who is not staff → `ForbiddenException`.
  - Missing collaboration → `NotFoundException`.
- **TEST-COLLAB-012 (Must).** `collaboration.service.spec.ts` `updateStatus()` legality matrix (`collaboration.service.ts:124-178`):
  - `PENDING → CONFIRMED` by responder → 200, `confirmed_at` set to `now()`.
  - `PENDING → CONFIRMED` by **initiator** → `ForbiddenException`.
  - `PENDING → REJECTED` by responder → 200.
  - `PENDING → REJECTED` by initiator → `ForbiddenException`.
  - `CONFIRMED → IN_PROGRESS` by either party → 200, `started_at` set to `now()`.
  - `IN_PROGRESS → COMPLETED` by either party → 200, `ended_at` set to `now()`.
  - Any state → `DISPUTED` by either party → 200, `flagged = true`.
  - Same-status transition (e.g. `CONFIRMED → CONFIRMED`) → `BadRequestException`.
  - `PENDING → IN_PROGRESS` (skip) → `BadRequestException`.
  - `COMPLETED → IN_PROGRESS` (regression) → `BadRequestException`.
  - `REJECTED → CONFIRMED` (revival) → `BadRequestException`.
  - Caller is non-party → `ForbiddenException`.
  - Missing collaboration → `NotFoundException`.
- **TEST-COLLAB-013 (Must).** `collaboration.service.spec.ts` `flag()`:
  - Party calls → 200, `flagged = true`, `flag_reason` persisted verbatim.
  - Staff calls → 200 even if non-party.
  - Non-party non-staff → `ForbiddenException`.
  - Missing collaboration → `NotFoundException`.
  - Calling twice with different reasons → second call overwrites `flag_reason` (no append; document and lock).
- **TEST-COLLAB-014 (Must).** `collaboration.service.spec.ts` `getByUser()` (`collaboration.service.ts:100-122`):
  - Returns rows where caller is worker OR employer.
  - `status` filter narrows correctly.
  - Pagination respects `page` / `limit` (defaults 1 / 20).
  - `total` count matches the unfiltered-by-page query.
- **TEST-COLLAB-015 (Should).** `collaboration.controller.spec.ts` (or unit-level) controller-side guards (`collaboration.controller.ts:51-81`):
  - Both `worker_id` and `employer_id` → `BadRequestException`.
  - `employer_id` set but caller is not a worker → `BadRequestException`.
  - `worker_id` set but caller is not an employer → `BadRequestException`.
  - Neither set → `BadRequestException`.

### 3. Backend e2e tests (Testcontainer Postgres)

- **TEST-COLLAB-070 (Must).** `collaboration.e2e-spec.ts` happy-path lifecycle:
  - Verified employer creates a collaboration with a verified worker → 201.
  - Worker confirms (responder) → 200, status `CONFIRMED`, `confirmed_at` populated.
  - Either party starts → 200, status `IN_PROGRESS`, `started_at` populated.
  - Either party completes → 200, status `COMPLETED`, `ended_at` populated.
  - Subsequent `GET /collaborations/:id` returns the full timeline.
- **TEST-COLLAB-071 (Must).** `collaboration.e2e-spec.ts` reject path:
  - Verified worker initiates with employer → 201, status `PENDING`.
  - Employer (responder) rejects → 200, status `REJECTED`.
  - No further transitions accepted.
- **TEST-COLLAB-072 (Must).** `collaboration.e2e-spec.ts` dispute path from each non-terminal state:
  - From `PENDING` → 200, `flagged = true`, `disputed_at` not set on the collaboration row (only on escrow if any).
  - From `CONFIRMED` → 200.
  - From `IN_PROGRESS` → 200.
- **TEST-COLLAB-073 (Must).** `collaboration.e2e-spec.ts` authorisation matrix:
  - Worker-initiator tries to confirm own `PENDING` collab → 403.
  - Worker-responder tries to confirm employer-initiator's `PENDING` collab → 200.
  - Non-party employer tries to confirm someone else's collab → 403.
  - Worker tries to mutate status without `verification_state === 'ACTIVE'` → 403 (`AccountStateGuard` per Auth contract §3).
- **TEST-COLLAB-074 (Must).** `collaboration.e2e-spec.ts` AccountStateGuard:
  - `PENDING_EMAIL_VERIFICATION` worker → `403 EMAIL_NOT_VERIFIED` on `POST /collaborations` and on `PATCH /collaborations/:id/status` (which inherits the guard from the controller).
  - Same for employer.
- **TEST-COLLAB-075 (Must).** `collaboration.e2e-spec.ts` flag endpoint:
  - Party flags → 200, `flagged = true`, `flag_reason` persisted.
  - Staff flags → 200 even when non-party.
  - Non-party non-staff → 403.
- **TEST-COLLAB-076 (Must).** `collaboration.e2e-spec.ts` `GET /collaborations/me` filters:
  - Returns only rows where caller is party.
  - `status` filter narrows correctly.
  - `page` / `limit` pagination works; `total` is stable.
- **TEST-COLLAB-077 (Must).** `collaboration.e2e-spec.ts` `GET /collaborations/:id`:
  - Party reads → 200 with worker / employer / reviews / escrow_transaction / referral expanded.
  - Non-party non-staff → 403.
  - Staff → 200.
  - 404 for missing id.
- **TEST-COLLAB-078 (Should).** `collaboration.e2e-spec.ts` cross-feature seam (Jobs → Collaborations):
  - Employer accepts a job application on `tests-jobs-applications` E2E-3 path → conversion to collaboration → newly-created collaboration row is reachable via this surface's `GET /collaborations/me`.

### 4. Frontend unit tests (Vitest + RTL + MSW)

#### List page `/collaborations` (COLLAB-010..COLLAB-015)

- **TEST-COLLAB-100 (Must).** `CollaborationsPage.test.tsx` zero JSON dumps:
  - Component renders, `screen.queryByText(/JSON/)` is null.
  - No `<pre>` element with stringified JSON anywhere in the tree.
  - No "Raw list JSON" / "Last action response" / "Last mutation response" text anywhere in the tree (grep on the exact strings from the legacy page).
- **TEST-COLLAB-101 (Must).** `CollaborationsPage.test.tsx` status tabs (COLLAB-011):
  - All seven tabs render (`All` / `Pending` / `Confirmed` / `In progress` / `Completed` / `Disputed` / `Rejected`).
  - Counts match the seeded list payload.
  - Default tab is `All`.
  - Clicking a tab filters visible rows without refetching.
- **TEST-COLLAB-102 (Must).** `CollaborationsPage.test.tsx` role tab visibility (COLLAB-012):
  - User with rows only as worker → role tab not rendered.
  - User with rows only as employer → role tab not rendered.
  - User with rows on both sides → role tab rendered with `As worker` (default if more rows on worker side) / `As employer`. Switching toggles the visible set.
- **TEST-COLLAB-103 (Must).** `CollaborationsPage.test.tsx` per-row primary action (COLLAB-010):
  - `PENDING` row where caller is responder → button reads `Confirm` and calls `PATCH /collaborations/:id/status { status: 'CONFIRMED' }`.
  - `PENDING` row where caller is initiator → button reads `View` and routes to `/collaborations/:id`.
  - `CONFIRMED` row → button reads `Start work`.
  - `IN_PROGRESS` row → button reads `Mark complete`.
  - Terminal-state row (`COMPLETED` / `REJECTED`) → button reads `View`.
- **TEST-COLLAB-104 (Must).** `CollaborationsPage.test.tsx` empty state (COLLAB-014):
  - `GET /collaborations/me` returns `[]` → `<EmptyState>` with title "No collaborations yet" and the two CTAs.
- **TEST-COLLAB-105 (Must).** `CollaborationsPage.test.tsx` `New collaboration` sheet trigger (COLLAB-013):
  - Button rendered for accounts with at least one client role.
  - Click opens `<NewCollaborationSheet>`.
- **TEST-COLLAB-106 (Should).** `CollaborationsPage.test.tsx` toast on mutation success (COLLAB-015):
  - After a status mutation, `<Toast>` reads `Status updated` (or feature-final string).
  - After a successful create, `<Toast>` reads `Collaboration created`.

#### Detail page `/collaborations/:id` (COLLAB-020..COLLAB-026)

- **TEST-COLLAB-110 (Must).** `CollaborationDetailPage.test.tsx` route renders (COLLAB-002, COLLAB-020):
  - `/collaborations/123` mounts the page, calls `GET /collaborations/123`, renders header (status pill, agreed-amount, project type, postcode, dates), both party chips with `<VerificationBadge>` and `<StarRating>`.
- **TEST-COLLAB-111 (Must).** `CollaborationDetailPage.test.tsx` action-bar legality matrix (COLLAB-021). One test per row — call `useAccountMe()` mock to vary role:
  - `PENDING` + caller is responder → `Confirm` + `Reject` + `Flag dispute` buttons; nothing else.
  - `PENDING` + caller is initiator → `Flag dispute` only.
  - `PENDING` + caller is staff → `Flag dispute` only; `Confirm` / `Reject` rendered disabled with the staff-tooltip.
  - `CONFIRMED` + caller is either party → `Start work` + `Flag dispute`.
  - `IN_PROGRESS` + caller is either party → `Mark complete` + `Flag dispute`.
  - `COMPLETED` + caller is either party → no transition buttons; `Flag dispute` hidden (terminal).
  - `REJECTED` + caller is either party → no transition buttons; `Flag dispute` hidden.
  - `DISPUTED` + caller is either party → no transition buttons; `Flag dispute` button is **idempotent** — re-flagging is allowed (existing backend behaviour). Lock down whatever the implementation chooses.
- **TEST-COLLAB-112 (Must).** `CollaborationDetailPage.test.tsx` action-bar mutation (COLLAB-021):
  - Clicking each transition button calls `PATCH /collaborations/:id/status` with the right body.
  - On success, the detail refetches (or the cache updates).
  - On error, `parseApiError()` surfaces the message in a sticky alert; no raw `error.message`.
- **TEST-COLLAB-113 (Must).** `CollaborationDetailPage.test.tsx` escrow summary card read-only states (COLLAB-022):
  - `escrow_transaction === null` → card reads "No escrow yet" and the footer link to `/escrow/:id` is **not rendered** (or is replaced by a "Coming soon" hint — pick one and lock it).
  - `escrow_transaction` populated → card renders status pill, the four-row amount table (`job_amount` / `platform_fee` / `referral_commission` / `worker_payout`), the relevant timestamp, and the footer `Manage payment →` link to `/escrow/:id`.
  - **No Create-escrow button** anywhere on the page (`screen.queryByRole('button', { name: /create escrow/i })` is null).
  - **No Fund-via-Stripe button** anywhere on the page.
  - **No Confirm-deposit / Release / Refund button** anywhere on the page.
- **TEST-COLLAB-114 (Must).** `CollaborationDetailPage.test.tsx` chat summary card (COLLAB-023):
  - Card renders unconditionally with title `Conversation` and footer `Open inbox →` linking to `/inbox`.
  - **No textarea / send-button** anywhere on the page (the chat feature owns those).
- **TEST-COLLAB-115 (Must).** `CollaborationDetailPage.test.tsx` reviews summary (COLLAB-024):
  - `reviews === []` → `No reviews yet`.
  - One worker review published → `Worker review: Published`; employer side shows `Pending` or `Not yet`.
  - Mixed published / draft → both labels render correctly.
  - **No Write-review button** in this feature.
- **TEST-COLLAB-116 (Must).** `CollaborationDetailPage.test.tsx` flag history strip (COLLAB-025):
  - `flagged === true` + `flag_reason !== null` → strip renders the reason verbatim with the flag icon.
  - `flagged === true` + `flag_reason === null` → strip renders "Flagged — no reason recorded".
  - `flagged === false` → strip not rendered.
- **TEST-COLLAB-117 (Should).** `CollaborationDetailPage.test.tsx` audit timeline (COLLAB-026):
  - Skips null timestamps; renders only the populated ones.
  - Order is created → confirmed → started → ended.
- **TEST-COLLAB-118 (Must).** `CollaborationDetailPage.test.tsx` 404 state:
  - `GET /collaborations/:id` returns 404 → `<EmptyState>` with the parent-spec copy and a back-link to `/collaborations`.
- **TEST-COLLAB-119 (Must).** `CollaborationDetailPage.test.tsx` no JSON dump:
  - `screen.queryByText(/JSON/)` null.
  - No `<pre>` with stringified JSON anywhere.

#### Create-collaboration sheet `<NewCollaborationSheet>` (COLLAB-030..COLLAB-033)

- **TEST-COLLAB-130 (Must).** `NewCollaborationSheet.test.tsx` role-aware fields (COLLAB-030):
  - Worker context → `employer_id`, `project_type`, `site_postcode`, `agreed_amount`, optional `referral_id` rendered. `worker_id` not rendered.
  - Employer context → mirror.
- **TEST-COLLAB-131 (Must).** `NewCollaborationSheet.test.tsx` validation (COLLAB-031):
  - Empty `employer_id` / `worker_id` → submit disabled.
  - Non-positive id → field error, submit disabled.
  - `agreed_amount` with > 2 dp → field error "Use up to 2 decimal places".
  - `agreed_amount` negative → field error.
  - `site_postcode` failing the `PROF-015` UK-postcode regex → field error.
  - `project_type` > 100 chars → field error.
  - `site_postcode` lowercase / leading-space → form normalises to `M1 2AB` shape on submit.
- **TEST-COLLAB-132 (Must).** `NewCollaborationSheet.test.tsx` happy path (COLLAB-032):
  - Submit calls `POST /collaborations` with the role-aware body shape (worker context sends `employer_id` only; employer context sends `worker_id` only).
  - On 201, sheet closes; navigation goes to `/collaborations/:id` (the new id).
  - `<Toast>` reads `Collaboration created`.
- **TEST-COLLAB-133 (Must).** `NewCollaborationSheet.test.tsx` error mapping (COLLAB-032):
  - Backend returns `400` for `worker_id === employer_id` → field error "You can't collaborate with yourself".
  - Backend returns `400 No client profile` → banner directs to `/profile`.
  - Backend returns `403 EMAIL_NOT_VERIFIED` → `<AuthBanner kind="EMAIL_NOT_VERIFIED">` rendered above the form (Auth contract reuse).
  - All errors surface via `parseApiError()`; no raw `error.message` rendered.

#### Flag dialog `<FlagCollaborationDialog>` (COLLAB-040..COLLAB-043)

- **TEST-COLLAB-140 (Must).** `FlagCollaborationDialog.test.tsx` category list (COLLAB-040):
  - All eight categories render in the `<Select>` exactly as enumerated: `PAYMENT_LATE`, `PAYMENT_REFUSED`, `WORK_QUALITY`, `WORK_NOT_DONE`, `SAFETY_CONCERN`, `MISREPRESENTATION`, `ABUSIVE_BEHAVIOUR`, `OTHER`. Number of options is exactly 8 (regression assertion against silent additions / removals).
  - Each category renders both the code and the human label.
- **TEST-COLLAB-141 (Must).** `FlagCollaborationDialog.test.tsx` `OTHER` rule (COLLAB-041):
  - Selecting `OTHER` makes the detail field required.
  - Detail < 10 chars → submit disabled with the validation message.
  - Detail ≥ 10 chars → submit enabled.
- **TEST-COLLAB-142 (Must).** `FlagCollaborationDialog.test.tsx` submitted reason format (COLLAB-040):
  - Category + detail → body is `{ reason: "<CATEGORY>: <detail>" }`.
  - Category only (no detail, allowed for non-`OTHER`) → body is `{ reason: "<CATEGORY>" }`.
- **TEST-COLLAB-143 (Must).** `FlagCollaborationDialog.test.tsx` submit success (COLLAB-042):
  - `POST /collaborations/:id/flag` called.
  - On 200, dialog closes, refetch happens, `<Toast>` reads `Flag submitted — staff will review`.
- **TEST-COLLAB-144 (Must).** `FlagCollaborationDialog.test.tsx` submit error (COLLAB-042):
  - Backend 403 (non-party) → inline alert via `parseApiError()`; dialog stays open.

#### Placeholder `/escrow/:id` route (COLLAB-003)

- **TEST-COLLAB-150 (Must).** `EscrowPlaceholderPage.test.tsx`:
  - Route registered and gated by `<Protected>`; logged-out user is redirected to `/login?next=/escrow/123`.
  - Logged-in user sees `<EmptyState>` with title `Escrow is coming soon` and a back-link to `/collaborations/:id` (id round-tripped from the URL).

### 5. Frontend e2e tests (Playwright)

Each scenario maps to a parent-spec acceptance criterion.

- **TEST-COLLAB-200 (Must).** `collaborations.worker-confirm-start-complete.spec.ts`:
  - Verified worker on a `PENDING` collab they are the responder for → `/collaborations/:id` → clicks `Confirm` → status pill flips → clicks `Start work` → `Mark complete` → terminal state, no transition buttons remain.
- **TEST-COLLAB-201 (Must).** `collaborations.employer-create-manual.spec.ts`:
  - Verified employer opens `New collaboration` sheet → fills `worker_id`, `project_type`, `site_postcode`, `agreed_amount` → submits → routes to `/collaborations/:id`. Reload of `/collaborations` shows the row.
- **TEST-COLLAB-202 (Must).** `collaborations.flag-structured.spec.ts`:
  - Either party opens flag dialog → selects each non-`OTHER` category in turn → submits → assert backend persists `<CATEGORY>` exactly. Selects `OTHER`, types ≥ 10 chars, submits → assert backend persists `OTHER: <detail>`. Submits `OTHER` with < 10 chars → submit disabled.
- **TEST-COLLAB-203 (Must).** `collaborations.guardrails.spec.ts`:
  - Visit each route (`/collaborations`, `/collaborations/:id`, `/escrow/:id`); assert `await page.locator('pre').filter({ hasText: 'JSON' }).count()` is 0.
  - On `/collaborations/:id` (with and without an escrow row), assert no button has text matching `/create escrow/i` / `/fund/i` / `/confirm deposit/i` / `/release/i` / `/refund/i` (case-insensitive).
  - On `/collaborations/:id`, assert no `<textarea>` element exists (the chat feature owns all message-composition surfaces).
  - Assert `<input>` elements on `/collaborations` and `/collaborations/:id` have meaningful labels — none has a placeholder equal to its `name` attribute (catches the legacy `placeholder="job_amount"` pattern).
- **TEST-COLLAB-204 (Must).** `collaborations.role-gating.spec.ts`:
  - Anonymous → `/collaborations` → redirect to `/login?next=/collaborations`.
  - Anonymous → `/collaborations/:id` → redirect to `/login?next=/collaborations/:id`.
  - Anonymous → `/escrow/:id` → redirect to `/login?next=/escrow/:id`.
  - Logged-in worker who is not party → `/collaborations/:id` → 403 surface (`EmptyState` "Not allowed to view this collaboration" with back-link).
- **TEST-COLLAB-205 (Should).** `collaborations.staff.spec.ts`:
  - Staff signs into the staff host → opens `/collaborations/:id` for an arbitrary collab → sees both party chips, lifecycle action buttons disabled with the staff tooltip, flag button works, flag is recorded.
- **TEST-COLLAB-206 (Should).** `collaborations.mobile.spec.ts`:
  - Run at 375 px viewport on `/collaborations` and `/collaborations/:id`. Assert no horizontal scroll, primary CTAs are tap-target ≥ 48 px.
- **TEST-COLLAB-207 (Must).** `collaborations.cross-feature-jobs.spec.ts`:
  - Reuse the `tests-jobs-applications` E2E-3 path: employer accepts a worker application → converts to collaboration → routes to `/collaborations/:id` → the collab row is visible on `/collaborations` for both parties.

### 6. Coverage & guardrails

- **TEST-COLLAB-220 (Must).** Jest coverage thresholds in `backend/package.json` extended for `backend/src/collaboration/`: floor at 60 % statements / 35 % branches per service file; 80 % statements on `*.controller.ts`. DTOs excluded.
- **TEST-COLLAB-221 (Should).** Vitest coverage in `web/vite.config.ts` includes the new Collaborations pages and components in the report.
- **TEST-COLLAB-222 (Must).** `npm run lint:tokens` passes after this feature merges; the suite does not introduce raw hex colours into any new spec or fixture.

### 7. Follow-ups discipline

- **TEST-COLLAB-230 (Must).** Bugs surfaced by the suite are filed in `tasks/done/collaborations-polish/followups.md` (alongside the shipped parent feature) with the format used by `tasks/done/jobs-applications/followups.md` — `[COLLAB-NNN]` ID + one-line summary + reproducing test ID + recommended fix scope. The suite **does not silently fix** any bug it reveals.
- **TEST-COLLAB-231 (Must).** Tests that depend on un-shipped chat or escrow behaviour are explicitly **not written** here; they belong to `tests-chat/` and `tests-escrow/` respectively. If a Collaborations test would require those features to be present (e.g., asserting a real conversation deep-link inside the chat summary card), the test stays in this folder only as a `.skip` with a comment pointing to the future test folder.
- **TEST-COLLAB-232 (Should).** A `coverage-matrix.md` (or appendix in this spec) maps each `COLLAB-NNN` ID to the `TEST-COLLAB-NNN` IDs that cover it. Authored at the end of the implementation pass; ensures no requirement slipped through.

## Edge Cases

- **`<pre>{JSON.stringify(...)}</pre>` is reintroduced for "debugging" in a future PR.** TEST-COLLAB-100 / TEST-COLLAB-119 / TEST-COLLAB-203 fail.
- **A future PR re-wires the Fund-via-Stripe button onto the detail page "while we're here".** TEST-COLLAB-113 + TEST-COLLAB-203 fail on the case-insensitive button-text grep.
- **A future PR adds a textarea inside the chat summary card "for a quick reply".** TEST-COLLAB-114 + TEST-COLLAB-203 fail.
- **A 9th flag category is added without updating the test list.** TEST-COLLAB-140 fails on the exact-count assertion.
- **The placeholder `/escrow/:id` route is deleted while the escrow feature is mid-build.** TEST-COLLAB-150 + TEST-COLLAB-204 fail.
- **The action-bar tooltip on staff is removed.** TEST-COLLAB-111 (staff branch) + TEST-COLLAB-205 fail.
- **`updateStatus()` quietly starts allowing initiator → confirm.** TEST-COLLAB-012 + TEST-COLLAB-073 fail — privilege escalation caught.
- **The `same-status` 400 is loosened to a no-op 200.** TEST-COLLAB-012 fails.
- **Backend `flag()` starts appending to `flag_reason` instead of overwriting.** TEST-COLLAB-013 fails — locked down behaviour either way.
- **`agreed_amount` precision drifts to 4 dp on the form.** TEST-COLLAB-131 fails.
- **The structured-reason format changes from `<CATEGORY>: <detail>` to `<CATEGORY> | <detail>`.** TEST-COLLAB-142 fails — staff tooling that parses these strings would have silently broken otherwise.

## Acceptance Criteria

- `cd backend && npm test` runs the new unit specs green.
- `cd backend && npm run test:e2e` runs the new e2e specs green against the Testcontainer Postgres.
- `cd web && npm test` runs the new Vitest specs green.
- `cd web && npm run test:e2e` runs the new Playwright specs green.
- Mentally re-introduce a `<pre>{JSON.stringify(...)}</pre>` block on `CollaborationsPage`: at least one of TEST-COLLAB-100 / TEST-COLLAB-119 / TEST-COLLAB-203 goes red. Mentally re-add a "Fund via Stripe" button to the escrow summary card: TEST-COLLAB-113 + TEST-COLLAB-203 go red. Mentally let the worker-initiator confirm their own `PENDING` collab: TEST-COLLAB-012 + TEST-COLLAB-073 go red.
- Production code under `backend/src/collaboration/` and `web/src/pages/Collaboration*` is **not modified** by this feature; bugs found are filed as follow-ups (TEST-COLLAB-230).
- A coverage matrix exists (TEST-COLLAB-232) showing every `COLLAB-NNN` requirement maps to ≥ 1 `TEST-COLLAB-NNN` test.

## Open Questions

- **TEST-COLLAB-OQ-1.** Should the Playwright suite cover the "two browser tabs racing on Confirm" scenario (parent spec Edge Case "Status conflict")? Recommend: no — the unit test (TEST-COLLAB-012) already locks the backend behaviour; the frontend's optimistic-revert is covered by TEST-COLLAB-112.
- **TEST-COLLAB-OQ-2.** Where does `tests-collaborations-polish/` live during the test-feature life cycle — `tasks/product/` (alongside the parent feature, where it currently sits) or `tasks/in-progress/` from day one? Recommend: opens in `tasks/in-progress/` the same week Collaborations Polish implementation begins, per repo `CLAUDE.md` "Tests are not optional"; lives in `tasks/done/` (nested under the parent) once green alongside the shipped feature — matching `tests-jobs-applications`.
- **TEST-COLLAB-OQ-3.** Should TEST-COLLAB-078 (cross-feature seam Jobs → Collaborations) live here or in `tests-jobs-applications`? Recommend: here — it asserts the Collaborations side of the seam, and `tests-jobs-applications` already asserts the Jobs side stops at "URL routes to `/collaborations/:id`" (TEST-JOBS-202).
- **TEST-COLLAB-OQ-4.** When the chat feature ships, does its test folder absorb TEST-COLLAB-114 (chat summary card existence), or does this folder keep it as a "the entry point still exists" smoke test even after chat replaces the card content? Recommend: keep here — the card is part of the Collaborations surface contract; chat tests cover the card's *content*, this spec covers its *existence and link*.

## Decisions Log

- **2026-05-06 — TEST-COLLAB-OQ-1 resolved.** The "two browser tabs racing on Confirm" Playwright scenario is **not** added. The unit test (TEST-COLLAB-012) locks the backend behaviour and TEST-COLLAB-112 covers the frontend's optimistic-revert via MSW; a Playwright reproduction would add wall-clock flakiness without surfacing a separate class of bug.
- **2026-05-06 — TEST-COLLAB-OQ-2 resolved.** Test-feature folder lifecycle: opens nested in `tasks/in-progress/<parent>/tests-<parent>/` the same week implementation begins, lives nested in `tasks/done/<parent>/tests-<parent>/` once green alongside the shipped feature. Mirrors `tasks/done/jobs-applications/tests-jobs-applications/`.
- **2026-05-06 — TEST-COLLAB-OQ-3 resolved.** TEST-COLLAB-078 (cross-feature seam Jobs → Collaborations) lives **here**, not in `tests-jobs-applications/`. It asserts the Collaborations side of the seam (collab row reachable on `GET /collaborations/me` for both parties); `tests-jobs-applications` already asserts the Jobs side stops at "URL routes to `/collaborations/:id`" (TEST-JOBS-202).
- **2026-05-06 — TEST-COLLAB-OQ-4 deferred.** When the chat feature ships, this folder retains TEST-COLLAB-114 as the "entry-point exists" smoke test on the Collaborations surface; the chat test folder owns assertions about the card's *content* (unread count, deep-link to a specific conversation). No edit needed here when chat lands; chat tests author their own surface assertions.
