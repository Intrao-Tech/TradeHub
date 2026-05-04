# Spec

## Summary

Lock the Profiles feature (`tasks/in-progress/profiles/`) behind an
automated test suite. Covers backend unit tests, backend e2e tests
against a real Postgres in a Testcontainer, and frontend unit + e2e
tests for every Profiles screen, hook, and component. Each
`PROF-NNN` requirement, each `BE-PROF-N` backend prerequisite, and
each `E2E-N` acceptance scenario from the Profiles spec gets at
least one asserting test.

Test IDs are `TEST-PROF-NNN` so they can be referenced from commits
and PRs. Where a test maps directly to an existing `PROF-NNN`
requirement or `E2E-N` scenario, the source ID is cited in the test
description so a failure points at the broken spec clause.

## Problem

The Profiles surface is large (55+ requirements, 8 backend
prerequisites, 14 routes, 8 acceptance scenarios) and is currently
regression-protected only by manual smoke checks. The full failure
context is in `brief.md`; the short version:

- file uploads (avatar / portfolio media / documents) cross
  multiple silent-failure boundaries (Multer / Sharp / Prisma /
  disk)
- the Trust Ladder must render the product-spec vocabulary
  *verbatim* — drifting back to legacy enum values is a regression
- public-profile pages must be reachable without auth but redact
  contact actions
- AccountStateGuard exempts profile editors so PENDING users can
  still edit — easy to break by adding a guard to a controller
- Verification's contract is unsealed; Profiles tests must keep the
  Profiles-side surface stable while Verification iterates
- Profiles ships in parallel with Verification, Reviews, and
  Stripe Connect — without tests, every refactor in those tracks
  risks silently breaking Profiles

## Goals

- Run `npm test` and `npm run test:e2e` per package and exercise
  the entire Profiles surface end-to-end.
- Make every `PROF-NNN` requirement and every `E2E-N` acceptance
  scenario from the Profiles spec fail-loud if it regresses.
- Use the tests-auth-flow tooling unchanged. No new test stack.
- Mock external services (Stripe, Verification's staff queue,
  optional mail) so the suite stays hermetic and runs offline.
- Keep the suite local-runnable; do not couple to any CI provider
  in this feature.

## Non-goals

- CI / CD wiring (separate task).
- Performance / load testing of upload endpoints.
- Visual regression of profile pages.
- Mutation testing.
- Replacing the manual lint-tokens / dark-mode / 375 px smoke
  checklists in PR reviews. The suite asserts behaviour and basic
  layout, not aesthetics.
- Writing tests for Verification-owned surfaces (staff document
  queue, ladder promotion logic, vocabulary reconciliation).
  Profiles' contribution is consumption-only: tests assert that
  Profiles renders whatever Verification ships.
- Real Stripe traffic, real S3 / object-store traffic, real
  document scanning.
- Re-testing Auth invariants — those live in `tests-auth-flow`.

## User Flow

Not applicable — see the tests-auth-flow spec for the rationale.
The "users" are developers running `npm test` and AI agents
reasoning about Profiles invariants.

## Test surfaces

This feature reuses the layers and tooling established by
tests-auth-flow:

1. **Backend unit tests** — `*.spec.ts` colocated under
   `backend/src/{client-profile,worker-profile,employer-profile,
   portfolio,document,specialisation,stripe}/`. Prisma is
   deep-mocked with `jest-mock-extended`. No Postgres touched.
2. **Backend e2e tests** — `*.e2e-spec.ts` under `backend/test/`.
   Boots `AppModule` against a Postgres Testcontainer, applies
   migrations, drives HTTP via Supertest. Reuses the
   `test-app.ts` harness from tests-auth-flow.
3. **Frontend unit tests** — `*.test.ts(x)` colocated under
   `web/src/`. Vitest + jsdom + RTL + MSW v2.
4. **Frontend e2e tests** — `*.spec.ts` under `web/e2e/`.
   Playwright drives Chromium against the real Vite dev server
   plus the real backend boot established by tests-auth-flow.

## Requirements

Conventions: each requirement has a stable ID `TEST-PROF-NNN`.
**Must** = blocks shipping this feature. **Should** = strongly
preferred. Cross-references to the Profiles spec use `PROF-NNN`,
`BE-PROF-N`, `E2E-N`. Cross-references to Auth use `AUTH-NNN`.

### 1. Tooling

- **TEST-PROF-001 (Must).** No new test runners or libraries
  beyond what tests-auth-flow already added. If tests-auth-flow has
  not yet landed, this feature is blocked on it (see status.md).
- **TEST-PROF-002 (Must).** A new helper
  `backend/test/util/upload.ts` that builds a deterministic
  multipart body for image / PDF uploads (so tests do not pull
  arbitrary fixtures off disk). Uses `sharp` to generate fixed-size
  buffers in-memory: a 512×512 PNG (avatar happy path), a
  100×100 PNG (avatar dimension-floor failure), a >5 MiB PNG (size
  cap failure for avatar), a >10 MiB PNG (size cap failure for
  portfolio media), a 1-page minimal PDF (document happy path).
- **TEST-PROF-003 (Must).** A new helper
  `web/src/test/render.tsx` that wraps `render()` from RTL with
  the Profiles-relevant providers: `<BrowserRouter>`,
  `<MarketplaceRouter>` route tree (or staff equivalent) when
  needed, the toast (`sonner`) provider, and a default
  `useAccountMe` mock. Tests can pass overrides for the account
  shape.

### 2. Backend unit tests (mocked Prisma)

#### Client / Worker / Employer profiles

- **TEST-PROF-010 (Must).** `client-profile.service.spec.ts`
  `updateMe()` (PROF-011): rejects oversized fields per Prisma
  schema constraints, normalises `postcode_area` casing, persists
  `display_name`, `bio`, `city`, `postcode_area`. Slug is **not**
  re-issued on update.
- **TEST-PROF-011 (Must).** `client-profile.service.spec.ts`
  avatar upload (PROF-017 / PROF-018, BE-PROF-1):
  - rejects non-whitelisted MIME (`application/zip`)
  - rejects >5 MiB
  - rejects <256×256 dimension floor
  - on success writes file under `./uploads/{uuid}.{ext}` and
    updates `client_profile.avatar_url`
  - removes the prior file if any
- **TEST-PROF-012 (Must).** `worker-profile.service.spec.ts`
  `updateMe()` (PROF-012): persists `years_experience`,
  `day_rate_min`, `day_rate_max`, `available_from`,
  `is_available`. Validates `day_rate_max >= day_rate_min`
  (PROF-014).
- **TEST-PROF-013 (Must).** `employer-profile.service.spec.ts`
  `updateMe()` (PROF-013): persists `company_name`,
  `company_number`, `team_size`. Length / format constraints from
  Prisma schema honoured.
- **TEST-PROF-014 (Must).** `worker-profile.service.spec.ts`
  specialisation linkage (BE-PROF-3, PROF-036): `attach()` and
  `detach()` create / delete `worker_specialisations` rows.
  Attaching a non-existent specialisation returns 404.
- **TEST-PROF-015 (Should).** `worker-profile.service.spec.ts`
  language list (PROF-055, BE-PROF-6): persists ISO 639-1 codes,
  rejects invalid codes.

#### Portfolio

- **TEST-PROF-020 (Must).** `portfolio.service.spec.ts` discriminated
  edits:
  - `PATCH /portfolio/:id` updates only common fields (PROF-021)
  - `PATCH /portfolio/:id/experience` only on EXPERIENCE items
  - `PATCH /portfolio/:id/project` only on PROJECT items
  - `PATCH /portfolio/:id/certification` only on CERTIFICATION
    items
  - mismatched item-type calls return 400 with a structured code
- **TEST-PROF-021 (Must).** `portfolio.service.spec.ts` `sort_order`
  re-sequencing (PROF-022 edge case): editing an item to a
  sort_order that collides with another item shifts the other
  items rather than rejecting.
- **TEST-PROF-022 (Must).** `portfolio.service.spec.ts` media
  upload (BE-PROF-2, PROF-024):
  - happy path returns the row
  - rejects MIME outside `image/jpeg|image/png|image/webp`
  - rejects >10 MiB
  - rejects >20 media items per item (product spec §3.1 cap)
- **TEST-PROF-023 (Must).** `portfolio.service.spec.ts`
  document linkage (PROF-026):
  - `POST /portfolio/:id/documents/:documentId` requires the
    document to be `APPROVED` and owned by the same `client_profile`
  - `DELETE /portfolio/:id/documents/:documentId` unlinks
  - linking a `PENDING` / `REJECTED` document → 400
  - linking another user's document → 403

#### Documents

- **TEST-PROF-030 (Must).** `document.service.spec.ts` upload
  (PROF-029):
  - rejects MIME outside `application/pdf|image/*`
  - rejects >10 MiB
  - persists `doc_type`, status starts at `PENDING`
- **TEST-PROF-031 (Must).** `document.service.spec.ts` deletion
  (PROF-030): only the owner can delete; only when
  `status === 'PENDING'`.
- **TEST-PROF-032 (Should).** Right-to-Work submission (PROF-052,
  PROF-053):
  - share-code path: validates `^W[A-Z0-9]{8}$` regex, persists
    `metadata = { share_code, dob }`
  - document path: persists `doc_type =
    RIGHT_TO_WORK_DOCUMENT`
  - if Verification has not yet shipped the new `doc_type` enum
    values, fall back to `OTHER` and assert the metadata is still
    captured (PROF-053 fallback)

#### Stripe Connect

- **TEST-PROF-040 (Should).** `stripe.service.spec.ts`
  onboarding-link (BE-PROF-7, PROF-041):
  - returns `{ url, expires_at }` for a worker without
    `stripe_connect_account_id`
  - returns the same for a worker with an incomplete account
  - returns 400 for an already-complete account
  - **Skipped with a citation** if BE-PROF-7 has not landed yet.

#### Multer config

- **TEST-PROF-050 (Must).** `document.controller.spec.ts` /
  `client-profile.controller.spec.ts` /
  `portfolio.controller.spec.ts` (BE-PROF-8): Multer config caps
  enforced — 5 MiB on avatar route, 10 MiB on document and
  portfolio-media routes; MIME whitelist active. Verified by
  posting an oversized buffer and asserting the structured 4xx
  response, not a stack trace.

### 3. Backend e2e tests (Testcontainers Postgres)

- **TEST-PROF-070 (Must).** `client-profile.e2e-spec.ts`
  (PROF-010, PROF-011, AccountStateGuard exemption): a
  PENDING_EMAIL_VERIFICATION user can `PATCH /client-profiles/me`
  successfully (Auth contract §3 allow-list). An ACTIVE user can
  also patch. The endpoint mirrors the previously persisted
  fields back on the next `GET /account/me`.
- **TEST-PROF-071 (Must).** `worker-profile.e2e-spec.ts`
  (PROF-012, PROF-014, PROF-015): worker-only fields persist;
  cross-role access (employer → worker fields) is rejected.
- **TEST-PROF-072 (Must).** `employer-profile.e2e-spec.ts`
  (PROF-013): employer-only fields persist; cross-role access
  rejected.
- **TEST-PROF-073 (Must).** `avatar.e2e-spec.ts` (PROF-017,
  PROF-018, BE-PROF-1, BE-PROF-8): full happy path with the
  TEST-PROF-002 fixture. Replace + remove paths covered. Rejected
  uploads return structured error bodies the SPA can map to copy.
- **TEST-PROF-074 (Must).** `portfolio.crud.e2e-spec.ts`
  (PROF-020, PROF-021, PROF-022): create + edit (per
  discriminator) + delete + re-order. Mount on a worker account;
  reject from an employer account.
- **TEST-PROF-075 (Must).** `portfolio.media.e2e-spec.ts`
  (PROF-023…PROF-025, BE-PROF-2, BE-PROF-8): upload via
  `POST /portfolio/:id/media/upload`, list, delete. Programmatic
  URL-only upload via `POST /portfolio/:id/media` still works.
  Cap of 20 media items enforced.
- **TEST-PROF-076 (Must).** `portfolio.documents.e2e-spec.ts`
  (PROF-026): link an APPROVED document to a CERTIFICATION item;
  unlink. Cross-user link attempts rejected.
- **TEST-PROF-077 (Must).** `documents.e2e-spec.ts` (PROF-028,
  PROF-029, PROF-030, BE-PROF-8): upload, list (auto-loaded),
  delete only when PENDING.
- **TEST-PROF-078 (Should).** `right-to-work.e2e-spec.ts`
  (PROF-052): share-code path persists metadata; document path
  uploads file. Skipped citing PROF-053 if Verification has not
  shipped the enum extension.
- **TEST-PROF-079 (Should).** `stripe-connect.e2e-spec.ts`
  (PROF-041, BE-PROF-7): onboarding-link endpoint returns the
  stubbed Stripe response; idempotent on a re-call. Skipped
  citing BE-PROF-7 if absent.
- **TEST-PROF-080 (Must).** `public-profiles.e2e-spec.ts`
  (PROF-001…PROF-008): `GET /worker-profiles/:id`,
  `GET /employer-profiles/:id`, `GET /client-profiles/:slug`,
  `GET /client-profiles` reachable without auth; portfolio reads
  reachable without auth; deactivated profiles return 404
  (PROF-258 edge case).
- **TEST-PROF-081 (Must).** `account-me.e2e-spec.ts` (PROF-051):
  `GET /account/me` returns the shape `useAccountMe` consumes —
  `account`, `clientProfile`, role flags, `verificationState`. The
  shape is stable across PENDING / ACTIVE accounts and across
  worker / employer / multi-role accounts.

### 4. Frontend unit tests (Vitest + RTL + MSW)

- **TEST-PROF-100 (Must).** `useAccountMe.test.tsx` is owned by
  tests-auth-flow (TEST-AUTH-084); this feature adds a
  Profiles-side test asserting that the hook surfaces
  `clientProfile` / `workerProfile` / `employerProfile` shapes
  used by Profiles editors (PROF-051).
- **TEST-PROF-101 (Must).** `ProfilePage.test.tsx`:
  - PROF-010: no `<pre>{JSON.stringify(...)}</pre>` block in the
    DOM (`screen.queryByText(/raw account data/i)` returns null)
  - Account section surfaces email, verification chip, phone
    (with verified indicator)
  - "Manage security" link points to `/settings/security`
  - On `verification_state === 'PENDING_EMAIL_VERIFICATION'`,
    `<AuthBanner kind="EMAIL_NOT_VERIFIED">` is rendered (Auth
    contract §10 reuse)
  - PENDING user can still interact with editor inputs
    (TEST-PROF-070 surface from the UI side)
- **TEST-PROF-102 (Must).** `ProfilePage` worker editor
  (PROF-011, PROF-012):
  - day-rate validation (min ≤ max) blocks submit
  - submit calls `PATCH /worker-profiles/me` and `PATCH
    /client-profiles/me` with the right diffs
  - region picker is constrained to the London-borough preset
    (PROF-015)
- **TEST-PROF-103 (Must).** `ProfilePage` employer editor
  (PROF-013):
  - company-name + company-number + team-size persist
  - validation messages reflect Prisma schema constraints
- **TEST-PROF-104 (Must).** `AvatarUpload.test.tsx` (PROF-016,
  PROF-019):
  - drag-and-drop fires the same handler as click-to-browse
  - oversize / wrong-MIME files surface friendly copy
  - keyboard reachability: Tab → Enter opens the picker;
    `aria-live` announces upload state
- **TEST-PROF-105 (Must).** Portfolio editor tests:
  - `PortfolioItemDialog.test.tsx`: branches by `item_type` and
    submits to the right endpoint (PROF-021)
  - `PortfolioMediaGrid.test.tsx`: drag-drop, captions, delete
    (PROF-023, PROF-025)
  - `PortfolioDocumentLinker.test.tsx`: only APPROVED documents
    appear in the picker (PROF-026)
  - Verified portfolio items render the "Verified by TradeHub"
    indicator (PROF-027)
- **TEST-PROF-106 (Must).** `DocumentList.test.tsx` (PROF-028,
  PROF-030):
  - auto-loads on mount when `client_profile` exists
  - status badges use the existing
    `bg-success-subtle / bg-warning-subtle / bg-info-subtle /
    bg-danger-subtle` token mapping (`lint:tokens` would catch
    raw colours, but the test asserts the status → class mapping
    directly)
  - delete only available on `status === 'PENDING'`
  - rejected documents render the staff-provided reason and a
    "Re-upload" CTA (PROF-033 user-side surface)
- **TEST-PROF-107 (Must).** `TrustLadderPanel.test.tsx`
  (PROF-033, PROF-034):
  - renders the four levels in order — Unverified, Basic,
    Certified, Premium — with the product-spec text *verbatim*
  - the user's current level is highlighted
  - the "next concrete action" CTA is the right one for each
    level (e.g., "Upload one trade certification" for
    Basic → Certified)
  - the Premium row renders the requirement copy but cannot
    resolve to "Done" until Reviews ships (caps at Certified)
  - microcopy "Usually takes 90 seconds" is present on the
    relevant cards (Decisions Log 2026-05-03 surf alignment)
- **TEST-PROF-108 (Must).** `VerificationBadge.test.tsx`
  (PROF-032): `verificationFromLevel()` maps every legacy /
  current backend value into a renderable badge without throwing;
  unknown values fall through to "Unverified" (the spec's
  consume-don't-translate boundary).
- **TEST-PROF-109 (Must).** `ProfileCompleteness.test.tsx`
  (PROF-035, PROF-036, PROF-037):
  - worker required-section list matches the spec exactly
    (avatar, display_name, bio, city + postcode_area, ≥1
    specialisation, day-rate min+max, ≥1 portfolio item, ≥1
    document, RTW submission)
  - employer required-section list matches
  - completeness percent reflects the count of completed
    sections
  - each card's primary CTA scrolls / opens the right editor
    (assert `Element.scrollIntoView` was called on the right
    target)
  - the specialisation card is render-only when BE-PROF-3 is
    absent
- **TEST-PROF-110 (Must).** `WorkerDetailPage.test.tsx`
  (PROF-001, PROF-006, PROF-007, PROF-008, E2E-4):
  - renders without auth
  - header shows avatar, display name, role chip, location,
    `VerificationBadge`, `StarRating`
  - tabs (About / Portfolio / Certifications / Reviews
    placeholder) render
  - "Send message" CTA replaced with auth-gate CTA when
    unauthenticated
- **TEST-PROF-111 (Must).** `EmployerDetailPage.test.tsx`
  (PROF-002, E2E-3) mirrors TEST-PROF-110 for employers.
- **TEST-PROF-112 (Must).** `ClientPublicProfilePage.test.tsx`
  (PROF-003) and `ClientDirectoryPage.test.tsx` (PROF-004).
- **TEST-PROF-113 (Must).** `WorkerSearchPage.test.tsx` /
  `EmployerSearchPage.test.tsx` (PROF-005, PROF-044, PROF-045,
  PROF-046):
  - card click navigates via `WorkerCard.onSelect` /
    `EmployerCard.onSelect`
  - no `<pre>{JSON.stringify(...)}</pre>` in the DOM
  - cards render verification badge per PROF-032
- **TEST-PROF-114 (Should).** `RightToWorkSection.test.tsx`
  (PROF-052):
  - share-code path validates `^W[A-Z0-9]{8}$` client-side
  - DOB picker accepts DD-MM-YYYY
  - document path renders the file picker fallback
- **TEST-PROF-115 (Should).** `StripeConnectStatus.test.tsx`
  (PROF-041, PROF-042, PROF-043):
  - "Set up payouts" CTA when `stripe_onboarding_complete ===
    false`
  - "Payouts ready" with masked id when complete
  - read-only state with no CTA when BE-PROF-7 not yet
    available

### 5. Frontend e2e tests (Playwright)

These map 1:1 to the `E2E-N` scenarios already defined in the
Profiles spec. Where the Profiles spec already wrote the script,
this feature implements it.

- **TEST-PROF-140 (Must).** `e2e/profile.worker-first-run.spec.ts`
  (E2E-1): worker registers → verifies via mailbox → uploads
  avatar → fills client + worker editors → picks a specialisation
  → adds a Project portfolio item with two media → uploads ID
  document → submits RTW share-code → staff approves the ID via
  the Verification stub → user reloads → verification chip flips
  to `Basic` and completeness shows 100 %.
- **TEST-PROF-141 (Must).** `e2e/profile.worker-certified.spec.ts`
  (E2E-2): from E2E-1, add a CSCS certification portfolio item +
  CSCS_CARD document, link them, staff approves, ladder advances
  to `Certified`.
- **TEST-PROF-142 (Must).** `e2e/profile.employer-first-run.spec.ts`
  (E2E-3): employer registers → verifies → uploads logo → fills
  company info → optionally uploads INSURANCE document →
  `/employers/:id` reachable, no Send-message affordance for
  anonymous viewers.
- **TEST-PROF-143 (Must).**
  `e2e/profile.public-discovery.spec.ts` (E2E-4): anonymous user
  lands on `/workers`, applies a filter, navigates to
  `/workers/:id`. Reload at 375 px width and assert no
  horizontal scroll (`page.evaluate(() =>
  document.documentElement.scrollWidth <= viewport.width)`),
  tap targets ≥ 48 px (sample three).
- **TEST-PROF-144 (Must).** `e2e/profile.unverified-edits.spec.ts`
  (E2E-6): a PENDING user hits `/profile`, the
  `EMAIL_NOT_VERIFIED` banner is visible, every editor is
  interactive, save calls succeed.
- **TEST-PROF-145 (Should).** `e2e/profile.multi-role.spec.ts`
  (E2E-7): a staff-seeded multi-role account renders both worker
  and employer editors (PROF-038). Skipped if multi-role
  seeding is not yet wired (Profiles spec Open Questions).
- **TEST-PROF-146 (Must).** `e2e/profile.guardrails.spec.ts`
  (E2E-8): scripted Playwright guardrails — every page above
  rendered in light + dark, screenshot diff allowed but not
  enforced; assert the absence of any `<pre>` block in the DOM
  on `ProfilePage`, `WorkerSearchPage`, `EmployerSearchPage`,
  `AdminPage`'s Documents tab. Hits `/api/docs` to confirm every
  Profiles endpoint surfaces in OpenAPI (PROF-049).

### 6. Fixtures and factories

- **TEST-PROF-160 (Must).** Extend
  `backend/test/util/factories.ts` (added by tests-auth-flow):
  `seedWorkerWithPortfolio()`,
  `seedWorkerWithApprovedDocuments()`,
  `seedEmployer()`,
  `seedDeactivatedAccount()`. Each returns the IDs the e2e tests
  need.
- **TEST-PROF-161 (Must).** Extend `web/src/test/factories.ts`:
  `mockClientProfile()`, `mockWorkerProfile()`,
  `mockEmployerProfile()`, `mockPortfolioItem()`,
  `mockDocument({ status })`, `mockTrustLadderState({ level })`.
  Used by component tests via `web/src/test/render.tsx`.

### 7. Coverage and reporting

- **TEST-PROF-180 (Must).** Backend coverage floor for
  `backend/src/{client-profile,worker-profile,employer-profile,
  portfolio,document,specialisation}/` set to 60 % statements /
  50 % branches via the same Jest config as tests-auth-flow.
  `stripe/` excluded until BE-PROF-7 lands.
- **TEST-PROF-181 (Should).** Web Vitest coverage captured but
  not threshold-enforced in this feature.
- **TEST-PROF-182 (Must).** Failure messages cite the
  `TEST-PROF-NNN` ID and the source `PROF-NNN` / `E2E-N` ID via
  `describe()` / `test()` labels.

### 8. Cross-cutting

- **TEST-PROF-200 (Must).** No production Profiles code is
  changed in this feature. If a test reveals a bug, file a
  follow-up in `tasks/in-progress/profiles/followups.md`. The
  spec at `tasks/in-progress/profiles/spec.md` is unchanged.
- **TEST-PROF-201 (Must).** Tests that depend on a backend
  prerequisite which has not yet shipped (`BE-PROF-3`,
  `BE-PROF-6`, `BE-PROF-7`, RTW enum from Verification) are
  written as `test.skip(...)` with a TODO citing the open
  prerequisite ID. They become live tests as the prerequisites
  land — no rewrite needed.
- **TEST-PROF-202 (Must).** When Verification ships its enum
  reconciliation, this feature adds (in a follow-up commit) the
  vocabulary update inside `VerificationBadge.test.tsx` and
  removes the `verificationFromLevel()` legacy-translation
  expectation. Tracked separately so Verification can ship
  without coordinating a same-PR change here.

## Edge Cases

- A Multer-rejected upload must produce a structured error body
  (`{ code, message }`) rather than a stack trace; the test asserts
  `code` exists, not the human message.
- React 19 StrictMode mounts effects twice — the
  Documents and Portfolio "auto-load on mount" behaviour
  (PROF-020, PROF-028) must use a `useRef` guard or React 19
  cancellation pattern; tests mount inside `<StrictMode>` to
  exercise it.
- `useAccountMe` caches in module state — tests must reset it in
  `afterEach` (the tests-auth-flow setup file already does this).
- Avatar tests must clean up the `./uploads/` directory between
  e2e runs to avoid disk bloat. The `test-app.ts` close hook
  truncates the directory.
- Public profile tests run with no auth header at all. Assert
  this by setting Playwright's `extraHTTPHeaders` to `{}` and
  clearing storage state.
- A worker profile with `rating_count = 0` must render "No
  reviews yet" rather than `0.0 ★` (PROF-259).
- A deactivated worker profile fetched by id returns 404, not
  a 410 / "deactivated" copy (PROF-258 — privacy).
- Slug collisions on client profiles must surface a friendly
  error, not a stack trace (Profiles Open Question; tests assert
  the friendly path).
- Admin Documents queue tests live in the Verification spec, not
  here. This feature only asserts the *user-side* document list
  reads the rejection_reason field once Verification provides
  it; if the field is absent, the user-side panel falls back to
  the placeholder copy described in Profiles spec.
- `lint:tokens` is run as part of the existing `web` CI gate /
  manual smoke; this suite does not re-run it. If a test file
  is added inside `components/**`, exclude `**/*.test.tsx` in
  `lint-tokens.mjs` (a one-line addition shared with
  tests-auth-flow).

## Acceptance Criteria

- `cd backend && npm test` passes including all Profiles unit
  specs.
- `cd backend && npm run test:e2e` passes including all Profiles
  e2e specs on a clean machine where only Docker is running.
- `cd web && npm test` passes including all Profiles unit specs;
  no real network requests escape (MSW
  `onUnhandledRequest: 'error'`).
- `cd web && npm run test:e2e` passes including the `E2E-1`
  through `E2E-8` Playwright scripts (`E2E-5` skipped — owned
  by Verification).
- Every `PROF-NNN` requirement that has shipped has at least one
  test that fails when the requirement regresses. Verified by
  spot-reverting one requirement (e.g., the JSON-dump removal in
  PROF-010) on a scratch branch and confirming red.
- Every `BE-PROF-N` prerequisite that has shipped has a contract
  test asserting its endpoint shape.
- `tasks/in-progress/profiles/spec.md` is unchanged.
- `web/scripts/lint-tokens.mjs` still passes; no production
  Profiles source file changed in this feature.

## Open Questions

- **Test seam for the Verification staff queue.** The Profiles
  e2e tests E2E-1 / E2E-2 require a way to flip a document to
  `APPROVED` from outside the Profiles surface. Option (a):
  Verification ships its own admin endpoint and the Profiles
  e2e suite calls it. Option (b): the test harness exposes a
  thin admin helper that writes directly via Prisma (bypasses
  Verification's promotion logic). MVP recommendation: (b) until
  Verification's contract is sealed; switch to (a) the moment
  `tasks/product/verification/contract.md` lands.
- **Right-to-Work fallback path.** If Verification scopes RTW
  out, TEST-PROF-032 / TEST-PROF-078 / TEST-PROF-114 fall back
  to asserting the generic `OTHER` upload (PROF-053 fallback).
  Tracked here so the test owner does not need to chase
  Verification.
- **Stripe Connect e2e.** Until BE-PROF-7 lands, TEST-PROF-079
  is `.skip`. Open question: do we want a real Stripe test mode
  call, or a stubbed Stripe SDK? Recommendation: stub the SDK
  for unit + e2e; reserve real Stripe test mode for a separate
  manual verification step.
- **Mobile viewport assertions.** TEST-PROF-143 asserts no
  horizontal scroll and 48 px tap targets at 375 px. Should we
  also add an iPhone-15-class device fixture (375×812 + DPR 3)?
  Default: just 375×667; revisit if mobile UX bugs slip
  through.
- **Snapshot tests for VerificationBadge / TrustLadderPanel.**
  Profiles' rendering of these components is largely pure-input;
  snapshot tests would catch unintended DOM diffs. Avoided in
  this spec by default — token-driven design system means
  snapshots rot on theme tweaks. Reconsider if rendering bugs
  show up.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-03 | Reuse the tests-auth-flow stack unchanged (Jest+Supertest+Testcontainers BE; Vitest+RTL+MSW v2+Playwright FE) | Owner-approved upstream. Two parallel stacks would double maintenance with zero gain. |
| 2026-05-03 | CI/CD intentionally out of scope | Owner instruction. Local-runnable suite; CI wiring is a separate task. |
| 2026-05-03 | Tests must not change Profiles production code | Mirrors tests-auth-flow rationale. Test feature must surface bugs, not silently fix them. |
| 2026-05-03 | Verification-owned surfaces (staff queue, ladder promotion logic, vocabulary reconciliation) are excluded | Profiles consumes Verification's contract; testing Verification is Verification's job. Profiles tests assert the *consumption* surface only. |
| 2026-05-03 | Tests for unsealed prerequisites (BE-PROF-3 / BE-PROF-6 / BE-PROF-7 / RTW enum) start as `.skip` | Lets the suite ship now without blocking on backend work; tests become live as prerequisites land. |
| 2026-05-03 | E2E document-approval seam goes through a Prisma-direct admin helper for now (Open Question (b)) | Lets Profiles e2e ship independently of Verification's contract. Switch to Verification's real admin endpoint when its contract is sealed. |
