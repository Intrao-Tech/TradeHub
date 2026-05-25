# Spec — tests-verification

## Summary

Lock the Verification feature (`tasks/done/verification/`) behind an automated regression suite. Covers backend unit tests against `PromotionEngine` / `DocumentReviewService` / `DocumentAssignmentService` / `CompaniesHouseService` / `QueueService` / `VerificationService` / `validateDocumentMetadata`; backend e2e tests against a real Postgres in a Testcontainer for every `/verification/*` endpoint plus the `POST /staff/me/duty` surface; frontend unit tests for `VerificationQueueTab`, `MilestonesStrip`, and the ProfilePage Identity-CTA branches; and Playwright e2e for the full flows (Stripe Identity round-trip via webhook fixture, staff approve→promote chain, reject-with-reason, RTW share-code submission, Companies House test mode).

Test IDs are `TEST-VER-NNN` so they can be cited in commits and PRs. Where a test maps directly to a `VER-NNN` requirement from `tasks/done/verification/spec.md`, the source ID is named in the test description so a failure points at the broken contract clause.

## Problem

Verification shipped on 2026-05-05 (PR #9, merge `629f9ad`) without a test counterpart. The full audit lives in `brief.md`; the short version:

- The promotion engine (`backend/src/verification/promotion-engine.service.ts`) is the trust-ladder contract — a pure-ish predicate truth table that's easy to test and easy to break, with **zero coverage**.
- Document review is a multi-branch state machine with assignee gating and admin override (`document-review.service.ts`); regressions here are privilege-escalation bugs.
- Workload-balanced assignment (`document-assignment.service.ts`) is a deterministic algorithm with edge cases (no on-duty staff, single on-duty staff reassigning their own work, race-free claim) that only tests can lock down.
- Stripe Identity webhook idempotency is invisible in dev (no Stripe events) and breaks loudly in prod when events get re-delivered.
- Companies House client is a small but error-rich registry path (4xx, 5xx, fetch errors, name normalisation) — the kind of code that silently rots.
- The public `/verification/levels/:id` projection has a two-join lookup for `certification_doc_types` that's the most likely place for a future PR to leak doc IDs.
- Two `.skip`'d test files (`TrustLadderPanel.test.tsx`, `RightToWorkSection.test.tsx`) and one stale e2e (`right-to-work.e2e-spec.ts`) were authored by the Profiles owner before Verification shipped and never unblocked. They sit as anti-fixtures: lint-green tests that don't actually assert anything.

The result is a trust-feature with no regression net. Any of the items in `brief.md` "Logic that needs verification" can quietly break and ship — the customer notices first.

## Goals

- Run `npm test` and `npm run test:e2e` per package and exercise the entire Verification surface end-to-end.
- Make every `VER-NNN` requirement (and the parent feature's Acceptance Criteria) fail-loud if it regresses.
- Reuse the `tests-auth-flow` + `tests-profiles` + `tests-jobs-applications` tooling unchanged. No new test stack, no new test runners.
- Mock external services (Stripe, Companies House, mail, Resend) so the suite stays hermetic and runs offline.
- Unblock the `.skip`'d Profiles test scaffolding by either porting / adapting / deleting it; never leave a `.skip` referencing "BLOCKED on Verification" once this feature lands.
- Keep the suite local-runnable; do not couple to any CI provider in this feature.

## Non-goals

- CI / CD wiring (separate task).
- Performance / load testing of the staff queue.
- Visual regression of the verification badge / milestones strip / queue table.
- Mutation testing.
- Replacing the manual `lint:tokens` / dark-mode / 375 px smoke checklists in PR reviews.
- Re-testing Profiles primitives (`<VerificationBadge>`, `verificationFromLevel`) — those live in `tests-profiles` (TEST-PROF-108) and are reused, not duplicated.
- Re-testing Auth invariants (`verificationState`, account-state guard) — those live in `tests-auth-flow`.
- Real Stripe Identity HTTP traffic, real Companies House traffic, real Resend traffic. All three are mocked at module boundaries.
- HMRC CIS gateway round-trip — staff visually confirm the gov.uk page in production; we test the structured-submission path (UTR/NI validator + staff approval) only.
- Cross-feature scenarios that belong to Reviews / Referrals (Premium predicate stays at "always false" until Reviews ships; we lock that, we don't try to reach Premium).

## User Flow

Not applicable — the "users" are developers running `npm test` and AI agents reasoning about Verification invariants.

## Test surfaces

Reuses the layers and tooling established by `tests-auth-flow`, `tests-profiles`, and `tests-jobs-applications`:

1. **Backend unit tests** — `*.spec.ts` colocated under `backend/src/verification/` (and `backend/src/staff/` for the duty-toggle endpoint). Prisma is deep-mocked with `jest-mock-extended`. Stripe client is a typed mock (`Mocked<Stripe>`). `fetch` is mocked at module boundary for the Companies House client. No Postgres touched.
2. **Backend e2e tests** — `*.e2e-spec.ts` under `backend/test/`. Boots `AppModule` against a Postgres Testcontainer, applies migrations, drives HTTP via Supertest. Reuses the `test-app.ts` harness.
3. **Frontend unit tests** — `*.test.ts(x)` colocated under `web/src/`. Vitest + jsdom + RTL + MSW v2.
4. **Frontend e2e tests** — `*.spec.ts` under `web/e2e/`. Playwright drives Chromium against the real Vite dev server plus the real backend boot established by `tests-auth-flow`.

## Requirements

Conventions: each requirement has a stable ID `TEST-VER-NNN`. **Must** = blocks shipping this feature. **Should** = strongly preferred. Cross-references to the Verification spec use `VER-NNN`. Cross-references to Auth / Profiles / Jobs use `AUTH-NNN` / `PROF-NNN` / `JOBS-NNN`.

### 1. Tooling

- **TEST-VER-001 (Must).** No new test runners or libraries beyond what `tests-auth-flow` / `tests-profiles` / `tests-jobs-applications` already added. If any of those have not yet landed, this feature is blocked on them (see status.md).
- **TEST-VER-002 (Must).** Extend `backend/test/util/factories.ts` with:
  - `seedVerifiedWorker(opts?)` — active worker at `verification_level = 'BASIC'` with one `IDENTITY_VERIFIED` milestone seeded.
  - `seedVerifiedEmployer(opts?)` — same for an employer with company name + number set.
  - `seedDocumentForReview(opts: { ownerId, docType, status?, assignedTo?, metadata? })` — persists a row with the metadata column populated (used by review and assignment specs).
  - `seedOnDutyStaff(opts: { role: 'ADMIN' | 'MODERATOR', isOnDuty?: boolean, assignedDocCount?: number })` — handles the `staff_member.is_on_duty` toggle and seeds N existing assigned documents so the workload algorithm has a meaningful tie-breaker test.
  - `seedMilestone(opts: { clientProfileId, type, evidenceRef?, staffMemberId? })` — direct insert into `verification_milestone`, bypassing the promotion engine (used by `getMe` / `getPublicLevel` projection tests).
- **TEST-VER-003 (Must).** Extend `web/src/test/factories.ts` with:
  - `mockVerificationLevels(overrides?)` — returns a `GET /verification/levels/:id` response with `flags` + `reviews`.
  - `mockVerificationMe(overrides?)` — returns `{ verification_level, milestones, documents: { pending, in_review, approved, rejected }, next_action }`.
  - `mockVerificationLadder(overrides?)` — returns `{ current_level, rungs }` for the trust-ladder panel.
  - `mockQueueResponse(overrides?)` — returns a `GET /verification/queue` payload with N items at varying status/assignee combinations.
  - `mockProviders(overrides?)` — returns `{ stripe_identity: bool, companies_house: bool }`.
- **TEST-VER-004 (Must).** Add `web/src/test/handlers/verification.ts` — MSW v2 handlers for `GET /verification/me`, `GET /verification/levels/:id`, `GET /verification/ladder/:id`, `GET /verification/queue`, `GET /verification/queue/:id`, `POST /verification/identity/start`, `GET /verification/identity/status`, `POST /verification/documents/:id/review`, `POST /verification/documents/:id/assign`, `POST /verification/documents/:id/claim`, `POST /verification/employer/companies-house-verify`, `GET /verification/providers`, `POST /staff/me/duty`. Per-test override pattern matches `tests-profiles`.
- **TEST-VER-005 (Should).** Extend `backend/test/util/test-app.ts` with a `mockStripeIdentity` helper that lets specs inject a fake `verificationSessions.create` / `verificationSessions.retrieve` and that lets specs replay webhook payloads. The harness today already wires a Stripe client; this helper makes per-test mocking ergonomic.
- **TEST-VER-006 (Must).** Add `backend/test/util/companies-house-fixtures.ts` with canned registry payloads (active match, inactive, name mismatch, 404, 5xx). Specs swap them via a `globalThis.fetch` mock without leaking across tests.

### 2. Stale-test cleanup (do this first)

The Profiles cut left three test files in a "BLOCKED on Verification" state. Verification shipped, so they need to be unblocked, ported, or deleted **before** the new tests are authored. This avoids the situation where two test files claim ownership of the same surface.

- **TEST-VER-010 (Must).** `web/src/components/profile/TrustLadderPanel.test.tsx` — the component file itself does not exist (only the `.test.tsx`). **Decision needed**: does the trust ladder UI ship as a dedicated `<TrustLadderPanel>` component, or is the rendering inlined into `ProfilePage.tsx`? Inspect `web/src/pages/ProfilePage.tsx` to confirm. **If inlined**: delete `TrustLadderPanel.test.tsx` and let the new TEST-VER-3xx series (ProfilePage tests) cover it. **If dedicated**: rewrite the four `.skip`'d tests against the actual component.
- **TEST-VER-011 (Must).** `web/src/components/profile/RightToWorkSection.test.tsx` — same disposition. The RTW UI today is part of the DocumentsTab + share-code metadata flow, not a dedicated section. **Likely action**: delete the file and let TEST-VER-2xx (Documents / metadata validator) plus a Playwright share-code spec cover it.
- **TEST-VER-012 (Must).** `backend/test/right-to-work.e2e-spec.ts` — the live "PROF-053 fallback" test asserts uploading as `OTHER` works; that's still a valid Profiles invariant but no longer the RTW path. The two `.skip`'d tests for `RIGHT_TO_WORK_SHARE_CODE` / `RIGHT_TO_WORK_DOCUMENT` doc-types **must be replaced** with live tests under `backend/test/verification.right-to-work.e2e-spec.ts` (per TEST-VER-080 below). Either delete the original file (recommended — it was a Profiles fixture) or convert it into a thin re-export of the new spec.

### 3. Backend unit tests (mocked Prisma + Stripe + fetch)

#### Promotion engine (`promotion-engine.service.ts`) — VER-010..014

- **TEST-VER-100 (Must).** `promotion-engine.service.spec.ts` `evaluate()` truth table — worker:
  - No identity → `UNVERIFIED`.
  - Identity only → `BASIC`.
  - Identity + one of {`CSCS_CARD`, `GAS_SAFE_CERT`, `NICEIC_CERT`, `FIRAS_CERT`} approved → `CERTIFIED`.
  - Identity + cert + `verifiedReviewsCount = 4` → `CERTIFIED` (Premium predicate fails).
  - Identity + cert + `verifiedReviewsCount = 5` → `PREMIUM` (the predicate path; production never sets this in MVP, but the predicate must be correct so the day Reviews ships, removing the hard-zero unblocks Premium without further engine changes).
- **TEST-VER-101 (Must).** `promotion-engine.service.spec.ts` `evaluate()` truth table — employer:
  - Identity only → `BASIC`.
  - Identity + INSURANCE only → `BASIC` (employer needs **both**).
  - Identity + COMPANY_LETTERHEAD only → `BASIC`.
  - Identity + INSURANCE + COMPANY_LETTERHEAD → `CERTIFIED`.
  - Identity + INSURANCE + COMPANY_LETTERHEAD + `verifiedReviewsCount = 5` + `hasCompanyHouseVerified = false` → `CERTIFIED` (employer Premium needs CH).
  - Identity + INSURANCE + COMPANY_LETTERHEAD + `verifiedReviewsCount = 5` + `hasCompanyHouseVerified = true` → `PREMIUM`.
- **TEST-VER-102 (Must).** `promotion-engine.service.spec.ts` `runPromotion()` writes the `LEVEL_PROMOTED` milestone with `evidence_ref = milestoneIds.join(',')`, `notes = newLevel`, `staff_member_id = evidence.staffMemberId`. Empty `milestoneIds` → `evidence_ref = null`.
- **TEST-VER-103 (Must).** `promotion-engine.service.spec.ts` idempotency: running `runPromotion` twice on identical evidence returns `null` on the second call and writes nothing extra.
- **TEST-VER-104 (Must).** `promotion-engine.service.spec.ts` deactivated-account guard: `account.status !== 'ACTIVE'` → returns `null`, writes nothing, no audit row.
- **TEST-VER-105 (Must).** `promotion-engine.service.spec.ts` audit row: every actual transition writes `verification.level_changed` with `{ from, to, evidence_milestones }`. No-op runs (same level) do not write the audit row (per VER-014 "from === to skipped to avoid noise").
- **TEST-VER-106 (Should).** `promotion-engine.service.spec.ts` demotion path (VER-004): seed CERTIFIED with one CSCS approved, manually delete the cert document, run `runPromotion` → level drops to BASIC; delete the IDENTITY_VERIFIED milestone too → level drops to UNVERIFIED. Locks the predicate even though the production trigger surface is intentionally minimal in MVP.
- **TEST-VER-107 (Should).** `promotion-engine.service.spec.ts` `gatherEvidence` excludes documents in non-APPROVED states from the `approvedDocTypes` set (PENDING / IN_REVIEW / REJECTED rows must not promote). Single guard against a refactor that flips the where-clause.

#### Document review (`document-review.service.ts`) — VER-032 / 033 / 037

- **TEST-VER-110 (Must).** `document-review.service.spec.ts` REJECT happy path: `decision='REJECT'`, reason 10 chars → updates document to `status='REJECTED'`, `rejection_reason=trimmed`, `reviewed_by`, `reviewed_at`. Audit row `verification.document.reviewed { decision: 'REJECT', reason }`. Returns `{ document, level_changed: null, milestones_written: [] }`.
- **TEST-VER-111 (Must).** `document-review.service.spec.ts` REJECT validation:
  - Missing reason → `400 REJECTION_REASON_REQUIRED`.
  - Reason `<10` chars after trim (`'   short  '`) → `400 REJECTION_REASON_REQUIRED`.
  - Reason `>500` chars → 400 from the `Length` validator on `ReviewDocumentDto` (e2e covers this since DTO validation runs in the pipeline).
- **TEST-VER-112 (Must).** `document-review.service.spec.ts` APPROVE happy path for a milestone-mapped doc type (`CSCS_CARD`): writes `Document.status='APPROVED'`, audit row, `CERTIFICATION_APPROVED` milestone, calls `promotionEngine.runPromotion` with the new milestone ID, returns the promotion result in `level_changed`.
- **TEST-VER-113 (Must).** `document-review.service.spec.ts` APPROVE for non-milestone doc type (`OTHER`): updates document, writes audit row, **does not** create a milestone, **does not** call promotion engine. Returns `level_changed: null`, `milestones_written: []`.
- **TEST-VER-114 (Must).** `document-review.service.spec.ts` APPROVE rejects `reason` parameter: `decision='APPROVE'`, `reason='whatever'` → `400 VALIDATION` ("Approval cannot include a rejection reason").
- **TEST-VER-115 (Must).** `document-review.service.spec.ts` terminal-status guard: document already `APPROVED` → `409 INVALID_TRANSITION`. Document already `REJECTED` → same. Spec error code locked.
- **TEST-VER-116 (Must).** `document-review.service.spec.ts` assignee gating (VER-132):
  - Non-admin staff, doc.assigned_to = self → succeeds.
  - Non-admin staff, doc.assigned_to = null (unassigned) → `403 NOT_ASSIGNEE` with copy "Claim it before reviewing."
  - Non-admin staff, doc.assigned_to = other staff → `403 NOT_ASSIGNEE` with copy "assigned to another staff member."
  - Admin, doc.assigned_to = other staff → succeeds; audit row carries `admin_override: true`.
  - Admin, doc.assigned_to = self → succeeds; audit row does **not** carry `admin_override`.
- **TEST-VER-117 (Must).** `document-review.service.spec.ts` milestone mapping per doc type (per VER-051 + `constants.ts:milestoneForDocType`):
  - `CSCS_CARD` / `GAS_SAFE_CERT` / `NICEIC_CERT` / `FIRAS_CERT` → `CERTIFICATION_APPROVED`.
  - `INSURANCE` → `INSURANCE_APPROVED`.
  - `COMPANY_LETTERHEAD` → `COMPANY_LETTERHEAD_APPROVED`.
  - `RIGHT_TO_WORK_SHARE_CODE` / `RIGHT_TO_WORK_DOCUMENT` → `RIGHT_TO_WORK_VERIFIED`.
  - `HMRC_CIS_DOCUMENT` → `HMRC_CIS_VERIFIED`.
  - `OTHER` / `ID_PHOTO` / `SELFIE` → `null` (no milestone).
  - **Goal**: any future addition to the doc-type enum without a milestone-mapping update either lights up an explicit "no milestone" assertion or trips the test. Exhaustive `test.each` table.

#### Document assignment (`document-assignment.service.ts`) — VER-125..128

- **TEST-VER-120 (Must).** `document-assignment.service.spec.ts` `pickNextAssignee()`:
  - No on-duty staff → `null`.
  - Single on-duty staff with N open docs → that staff's id.
  - Two on-duty staff, one with 2 open / one with 5 open → returns the 2-open one.
  - Two on-duty staff, both with 3 open → returns the one with the earliest `created_at` (deterministic tie-breaker).
  - One on-duty staff but `account.status = 'DEACTIVATED'` → excluded; `null`.
  - Off-duty staff (regardless of account status) → excluded.
- **TEST-VER-121 (Must).** `document-assignment.service.spec.ts` `assignNext()` calls `pickNextAssignee` then `setAssignment` with reason `'auto'`. When `pickNextAssignee` returns `null`, the assignment row stays at `null` and audit fires with `to: null`.
- **TEST-VER-122 (Must).** `document-assignment.service.spec.ts` `setAssignment()` no-op: when `doc.assigned_to === nextAssignee`, returns `{ changed: false }` and writes no audit row. Single guard against a refactor that always writes.
- **TEST-VER-123 (Must).** `document-assignment.service.spec.ts` `assignToStaff()` validation:
  - Target not found → `400 STAFF_NOT_FOUND`.
  - Target deactivated → `400 STAFF_DEACTIVATED`.
  - Target off-duty → `400 STAFF_OFF_DUTY`.
  - Target null → clears assignment, writes audit with `to: null`, reason `admin_reassign`.
- **TEST-VER-124 (Must).** `document-assignment.service.spec.ts` `claim()` race-safety:
  - Doc is unassigned → succeeds, audit `verification.document.assigned { from: null, to: claimer, reason: 'claim' }`.
  - Doc is already assigned to someone else → throws `ALREADY_ASSIGNED`. ⚠ The implementation throws `BadRequestException` (HTTP 400). Spec VER-137 says 409. Lock today's behaviour and file a follow-up against VER-137 so the team chooses one (recommended: change code to 409 to match spec).
  - Doc not found → `404 DOCUMENT_NOT_FOUND`.
- **TEST-VER-125 (Must).** `document-assignment.service.spec.ts` `reassignFromStaff()`:
  - With other on-duty staff: redistributes the leaving staff's open docs to the next-best assignee; returns the count of changed rows.
  - Single on-duty staff who is the one going off-duty: docs are reassigned to `null` (unassigned bucket), not back to the same staff.
  - Only PENDING + IN_REVIEW docs are touched; APPROVED / REJECTED stay untouched (terminal pointer per VER-127).
  - Each reassignment writes the audit row with `reason: 'duty_off'` (or `'admin_reassign'` per the calling parameter).

#### Companies House (`companies-house.service.ts`) — VER-140..145

- **TEST-VER-130 (Must).** `companies-house.service.spec.ts` `verifyEmployer` not-configured: API key empty → `503 COMPANIES_HOUSE_NOT_CONFIGURED`.
- **TEST-VER-131 (Must).** `companies-house.service.spec.ts` employer details missing: empty `company_number` or `company_name` → `400 COMPANY_DETAILS_MISSING`.
- **TEST-VER-132 (Must).** `companies-house.service.spec.ts` registry not found: fetch returns 404 → `404 COMPANIES_HOUSE_NOT_FOUND`.
- **TEST-VER-133 (Must).** `companies-house.service.spec.ts` registry inactive: fetch returns 200 with `company_status='dissolved'` → `403 COMPANIES_HOUSE_MISMATCH` with `registry_response.status='dissolved'`. Audit row `verification.companies_house.checked { result: 'INACTIVE' }`. ⚠ Spec VER-142 says 400; code throws 403. **Lock today's behaviour, file follow-up.**
- **TEST-VER-134 (Must).** `companies-house.service.spec.ts` name mismatch: fetch returns active company with name "Acme Holdings Ltd" while the employer claims "FooBar Builders" → `400 COMPANIES_HOUSE_MISMATCH`. Audit row `result: 'NAME_MISMATCH'`.
- **TEST-VER-135 (Must).** `companies-house.service.spec.ts` registry 5xx → `503 COMPANIES_HOUSE_UPSTREAM`. Fetch throws (network error) → `503 COMPANIES_HOUSE_UPSTREAM`. Registry 401/403 → `503 COMPANIES_HOUSE_NOT_CONFIGURED` (auth misconfigured).
- **TEST-VER-136 (Must).** `companies-house.service.spec.ts` happy path: registry returns `{ company_name: 'Acme Limited', company_status: 'active', company_number: '12345678' }` and employer claims "Acme Ltd" → match. Writes `COMPANY_HOUSE_VERIFIED` milestone with `evidence_ref = company_number`, `notes = JSON.stringify(company)`. Calls promotion engine. Returns `{ matched: true, milestone_id, registry_company_name }`.
- **TEST-VER-137 (Must).** `companies-house.service.spec.ts` name-normalisation table:
  - `Acme Limited` ≈ `Acme Ltd` → match.
  - `acme  limited.` ≈ `Acme Ltd` → match (whitespace + punctuation collapsed).
  - `Acme Public Limited Company` ≈ `Acme PLC` → match.
  - `Foo & Bar Ltd` ≈ `Foo Bar Limited` → match.
  - `FooBar Ltd` ≈ `Foo Bar Ltd` → **mismatch** (different word boundaries).
  Pin the predicate so future "let's just lower-case it" PRs trip a guardrail.
- **TEST-VER-138 (Should).** `companies-house.service.spec.ts` bidirectional `includes`: registry name "Acme" + submitted "Acme Ltd" → match (registry contains submitted is okay too). Lock the spec's bidirectional rule.

#### Stripe Identity (`verification.service.ts`) — VER-020..025

- **TEST-VER-140 (Must).** `verification.service.spec.ts` `startIdentitySession` with `STRIPE_SECRET_KEY` unset → `503 STRIPE_NOT_CONFIGURED`.
- **TEST-VER-141 (Must).** `verification.service.spec.ts` `startIdentitySession` for already-BASIC user → `409 ALREADY_VERIFIED` (also for CERTIFIED / PREMIUM / anything ≠ UNVERIFIED).
- **TEST-VER-142 (Must).** `verification.service.spec.ts` `startIdentitySession` happy path: calls `stripe.identity.verificationSessions.create` with `type='document'`, `options.document.allowed_types=['driving_license','passport','id_card']`, `require_matching_selfie=true`, `metadata.account_id` and `metadata.client_profile_id` set. Writes audit `verification.identity.started { session_id }`. Returns `{ verification_url, session_id, status }`.
- **TEST-VER-143 (Must).** `verification.service.spec.ts` webhook `verified` happy path:
  - Writes `IDENTITY_VERIFIED` milestone with `evidence_ref=session.id`.
  - Writes audit `verification.identity.verified`.
  - Calls `promotionEngine.runPromotion`.
  - Calls `mail.sendVerificationVerified(email, displayName)` fire-and-forget (assert via spy).
- **TEST-VER-144 (Must).** `verification.service.spec.ts` webhook `verified` idempotency: replaying the same `session.id` finds the existing milestone, logs the dup, and exits early — no second milestone, no second mail send, no second promotion run.
- **TEST-VER-145 (Must).** `verification.service.spec.ts` webhook `requires_input`:
  - Writes audit `verification.identity.failed { session_id, reason: session.last_error.code ?? 'unknown' }`.
  - Calls `mail.sendVerificationFailed(email, displayName, reason)` fire-and-forget.
  - **Does not** write a milestone, **does not** promote.
- **TEST-VER-146 (Must).** `verification.service.spec.ts` webhook missing `metadata.account_id`: logs warning, returns silently, writes nothing.
- **TEST-VER-147 (Should).** `verification.service.spec.ts` mail fire-and-forget: `mail.sendVerificationVerified` rejects → webhook still completes (the rejection is swallowed via `void`). Single guard against accidentally `await`'ing the mail call and tripping Stripe redelivery.
- **TEST-VER-148 (Should).** `verification.service.spec.ts` `getIdentityStatus` falls back to `{ session_id: null, status: null }` when the user has never started a session (no audit row). When an audit row exists, calls `stripe.identity.verificationSessions.retrieve(sessionId)` and returns the live status.

#### Read endpoints (`verification.service.ts`) — VER-053 / 060 / 061

- **TEST-VER-150 (Must).** `verification.service.spec.ts` `getMe`:
  - Profile not found → `404 PROFILE_NOT_FOUND`.
  - Returns the full grouped shape: `{ verification_level, milestones, documents: { pending, in_review, approved, rejected }, next_action }`.
  - Documents are grouped correctly across all four statuses (assert with a 4-doc fixture).
  - `next_action` matches the ladder computation for the current level (UNVERIFIED → "Verify identity"; BASIC → "Upload a trade certification" / "Upload insurance and company letterhead"; CERTIFIED → null; PREMIUM → null).
- **TEST-VER-151 (Must).** `verification.service.spec.ts` `getPublicLevel`:
  - Profile with `account.status = 'DEACTIVATED'` → `404 NOT_FOUND` (deactivation leak prevention).
  - `flags.identity_verified` true iff an `IDENTITY_VERIFIED` milestone exists. Same for the other 5 boolean flags.
  - `flags.certification_doc_types` is the dedup'd set of `Document.doc_type` reached via `CERTIFICATION_APPROVED.evidence_ref`. Rejected docs do not appear (the where-clause carries `status: 'APPROVED'`).
  - `reviews.{count, average}` reads from `worker_profile` first, then `employer_profile`; both null → `{ count: 0, average: null }`.
- **TEST-VER-152 (Must).** `verification.service.spec.ts` `getPublicLevel` does **not** leak doc IDs, milestone IDs, staff actor IDs, or document `metadata`. Assert by serialising the response and grepping for substrings that must not appear (doc id pattern, milestone id pattern, `staff_member_id`, `metadata`).
- **TEST-VER-153 (Must).** `verification.service.spec.ts` `getLadder` ownership: non-staff non-owner → `403 FORBIDDEN`. Owner → success. Staff → success.
- **TEST-VER-154 (Must).** `verification.service.spec.ts` `computeLadder` truth table:
  - UNVERIFIED rung is always `DONE`.
  - BASIC rung: `hasIdentity` → `DONE` with `completed_at`. Otherwise `NOT_STARTED` with the "Usually takes 2–5 minutes" copy.
  - CERTIFIED rung (worker): approved cert → `DONE`; pending/in-review cert → `IN_PROGRESS`; otherwise `NOT_STARTED` with `next_doc_types = ['CSCS_CARD', 'GAS_SAFE_CERT', 'NICEIC_CERT', 'FIRAS_CERT']`.
  - CERTIFIED rung (employer): approved INSURANCE + COMPANY_LETTERHEAD → `DONE`; otherwise `NOT_STARTED` / `IN_PROGRESS`.
  - PREMIUM rung is always `COMING_SOON` per VER-005.
  - `next_action` is `null` for currentLevel ≥ CERTIFIED.

#### Queue (`queue.service.ts`) — VER-035 / 036 / 130 / 131

- **TEST-VER-160 (Must).** `queue.service.spec.ts` `list` default scoping:
  - Moderator with no `assignment` query → `where.assigned_to = self.staffMemberId`.
  - Admin with no `assignment` query → no `assigned_to` filter.
  - Moderator passing `assignment='all'` → `403 FORBIDDEN { code: 'FORBIDDEN' }`.
  - Anyone passing `assignment='unassigned'` → `where.assigned_to = null`.
- **TEST-VER-161 (Must).** `queue.service.spec.ts` default status filter is `['PENDING', 'IN_REVIEW']`. Passing `status='APPROVED'` → only APPROVED. Passing `status='PENDING,IN_REVIEW,APPROVED'` → those three. Passing an invalid value (`status='FOO'`) → falls back to no status filter (per `parseStatusFilter` returning `null`). Pin this so a refactor doesn't accidentally include / exclude statuses.
- **TEST-VER-162 (Must).** `queue.service.spec.ts` sort and pagination: default `orderBy: { created_at: 'asc' }` (oldest-first fairness). `page=2 limit=10` → `skip=10 take=10`. `total` reflects the full count without skip/take.
- **TEST-VER-163 (Must).** `queue.service.spec.ts` response shape: `items[].document.id` is a string (BigInt-serialised). `items[].uploader.role` is `'WORKER'` / `'EMPLOYER'` / `'UNKNOWN'` based on which sub-profile exists. `items[].assignee` is null when unassigned.
- **TEST-VER-164 (Must).** `queue.service.spec.ts` `getOne`:
  - Doc not found → `404 DOCUMENT_NOT_FOUND`.
  - Includes `uploader.verification_level`.
  - Includes `history` of same-uploader same-doc-type rows (excluding self), sorted ascending by `created_at`.
  - History rows carry only `id`, `status`, `rejection_reason`, `created_at`, `reviewed_at` (no `metadata`, no `file_url`).

#### Metadata validator (`validators/document-metadata.validator.ts`) — VER-040 / 041 / 092 / 146

- **TEST-VER-170 (Must).** `document-metadata.validator.spec.ts` RTW share code:
  - `'W12 ABC 345'` → `{ share_code: 'W12 ABC 345' }`.
  - `'w12 abc 345'` → uppercased to `'W12 ABC 345'`.
  - `'W12-ABC-345'` (hyphenated) → `400 INVALID_SHARE_CODE`.
  - `'W12ABC345'` (no spaces) → `400 INVALID_SHARE_CODE`.
  - `'W1 ABC 345'` (8 chars) → `400 INVALID_SHARE_CODE`.
  - Missing `share_code` field → `400 INVALID_SHARE_CODE`.
  - Missing metadata altogether → `400 METADATA_REQUIRED`.
- **TEST-VER-171 (Must).** `document-metadata.validator.spec.ts` HMRC CIS:
  - UTR `'1234567890'` + NI `'AB123456C'` → returns normalised pair.
  - NI `'ab 123 456 c'` → upper-cased + spaces stripped to `'AB123456C'`.
  - UTR `'123456789'` (9 digits) → `400 INVALID_UTR`.
  - UTR `'12345678901'` (11 digits) → `400 INVALID_UTR`.
  - NI `'AB1234567'` (no trailing letter) → `400 INVALID_NI`.
  - Missing either field → 400 with the matching code.
- **TEST-VER-172 (Must).** `document-metadata.validator.spec.ts` OTHER:
  - `{ title: 'Plumbing license' }` → returns `{ title: 'Plumbing license' }`.
  - `{ title: 'AB' }` (2 chars) → `400 INVALID_TITLE`.
  - `{ title: 'A'.repeat(101) }` → `400 INVALID_TITLE`.
  - `{ title: '   ' }` (whitespace only) → `400 INVALID_TITLE`.
  - Missing `title` → `400 INVALID_TITLE`.
  - Missing metadata → `400 METADATA_REQUIRED`.
- **TEST-VER-173 (Should).** `document-metadata.validator.spec.ts` optional capture: `CSCS_CARD` with `{ certificate_number: 'X12345' }` → returns `{ certificate_number: 'X12345' }`. With no metadata → `null`. With non-object metadata (`'string'`) → `null`. Pin the "no enforcement" contract so a refactor doesn't accidentally start validating cert numbers.
- **TEST-VER-174 (Should).** `document-metadata.validator.spec.ts` unknown doc type: `validateDocumentMetadata('SOMETHING_NEW', { foo: 'bar' })` → `null` (default branch). Single guard against a future enum addition silently bypassing validation.

### 4. Backend e2e tests (Testcontainer Postgres)

#### Stripe Identity & promotion chain

- **TEST-VER-200 (Must).** `verification.identity.e2e-spec.ts` `POST /verification/identity/start`:
  - UNVERIFIED user with stub Stripe client → 201 with `verification_url`.
  - BASIC user → `409 ALREADY_VERIFIED`.
  - Stripe client missing → `503 STRIPE_NOT_CONFIGURED`.
  - PENDING_EMAIL_VERIFICATION account → `403 EMAIL_NOT_VERIFIED` (AccountStateGuard).
- **TEST-VER-201 (Must).** `verification.identity.e2e-spec.ts` `GET /verification/identity/status`:
  - Never-started → `{ session_id: null, status: null }`.
  - Started → calls Stripe stub, returns `{ session_id, status }`.
- **TEST-VER-202 (Must).** `verification.webhook.e2e-spec.ts` Stripe webhook `verified` end-to-end:
  - Replay a fixture event for an UNVERIFIED user → user's `verification_level` flips to `BASIC`. `IDENTITY_VERIFIED` milestone exists with `evidence_ref=session.id`. `LEVEL_PROMOTED(notes='BASIC')` milestone exists. Audit rows `verification.identity.verified` + `verification.level_changed` exist.
  - Replay the same event a second time → no new milestones, no new audit rows for `verified` (the dup-detect path).
- **TEST-VER-203 (Must).** `verification.webhook.e2e-spec.ts` Stripe webhook `requires_input`:
  - User stays UNVERIFIED. Audit row `verification.identity.failed { session_id, reason }` exists.
  - No milestone written. Mail spy assertion: `sendVerificationFailed` called once with the Stripe `last_error.code`.

#### Document review (the staff decision endpoint)

- **TEST-VER-210 (Must).** `verification.review.e2e-spec.ts` happy approve → promotion chain:
  - Worker uploads CSCS, status PENDING. Staff (assigned via the upload-assign hook) calls `POST /verification/documents/:id/review { decision: 'APPROVE' }` → 200, body has `document.status='APPROVED'`, `level_changed: { from: 'BASIC', to: 'CERTIFIED' }`, `milestones_written: [{ type: 'CERTIFICATION_APPROVED', id }]`.
  - Worker's `verification_level` flips to CERTIFIED. `LEVEL_PROMOTED` milestone exists.
- **TEST-VER-211 (Must).** `verification.review.e2e-spec.ts` happy reject:
  - Reason "Card photo is too blurry to verify the registration number" → 200, document REJECTED, `rejection_reason` populated. `level_changed: null`, `milestones_written: []`.
  - User's `GET /verification/me` shows the rejected doc in the `rejected` bucket with the reason.
- **TEST-VER-212 (Must).** `verification.review.e2e-spec.ts` validation errors:
  - REJECT without reason → `400 REJECTION_REASON_REQUIRED`.
  - REJECT with 9-char reason → `400 REJECTION_REASON_REQUIRED`.
  - REJECT with 501-char reason → `400` (Length validator).
  - APPROVE with reason → `400 VALIDATION`.
  - Already-APPROVED doc → `409 INVALID_TRANSITION`.
- **TEST-VER-213 (Must).** `verification.review.e2e-spec.ts` assignee gating:
  - Moderator A reviewing Moderator B's assignment → `403 NOT_ASSIGNEE`.
  - Moderator A reviewing an unassigned doc → `403 NOT_ASSIGNEE` ("Claim it before reviewing.").
  - Admin reviewing Moderator B's assignment → 200, audit row carries `admin_override: true`.
  - Worker (non-staff) hitting the endpoint → `403` from `RolesGuard`.
- **TEST-VER-214 (Should).** `verification.review.e2e-spec.ts` employer Certified path: employer uploads INSURANCE + COMPANY_LETTERHEAD; first approval keeps level at BASIC, second approval promotes to CERTIFIED. Locks VER-012 employer predicate at the integration layer.

#### Document assignment

- **TEST-VER-220 (Must).** `verification.assignment.e2e-spec.ts` upload-time auto-assign:
  - One on-duty active staff exists → upload immediately sets `assigned_to`. Audit row `verification.document.assigned { from: null, to, reason: 'auto' }`.
  - Two on-duty staff with N=0 / N=2 open docs → newest upload goes to N=0 staff.
  - No on-duty staff exists → upload's `assigned_to` is null. Audit row still fires with `to: null`.
- **TEST-VER-221 (Must).** `verification.assignment.e2e-spec.ts` `POST /verification/documents/:id/claim`:
  - Unassigned doc → 200 `{ ok: true, assigned_to }`. Audit row reason `'claim'`.
  - Already-assigned-to-someone-else → 400 `ALREADY_ASSIGNED` (matches today's behaviour; followup filed against VER-137).
  - Already-assigned-to-self (claiming again) → 400 `ALREADY_ASSIGNED`.
  - Doc not found → `404 DOCUMENT_NOT_FOUND`.
  - Race: two parallel `claim` calls → exactly one succeeds with 200, the other with 400. Use `Promise.all` over Supertest agents to surface a serialisation failure if the conditional-update is removed.
- **TEST-VER-222 (Must).** `verification.assignment.e2e-spec.ts` `POST /verification/documents/:id/assign` (admin-only):
  - Admin assigns to on-duty staff → 200, audit row reason `'admin_reassign'`.
  - Admin assigns to off-duty staff → `400 STAFF_OFF_DUTY`.
  - Admin assigns to deactivated staff → `400 STAFF_DEACTIVATED`.
  - Admin assigns to non-existent staff id → `400 STAFF_NOT_FOUND`.
  - Admin clears assignment with `staff_member_id: null` → 200, doc becomes unassigned.
  - Moderator hitting the endpoint → `403` from `RolesGuard('ADMIN')`.
- **TEST-VER-223 (Must).** `verification.assignment.e2e-spec.ts` duty-off reassignment:
  - Staff with 2 open assigned docs toggles off-duty via `POST /staff/me/duty { on_duty: false }` → both docs reassigned (to next-best on-duty staff or to null bucket if none). Audit rows reason `'duty_off'`. `staff.duty_off { reassigned_count: 2 }` audit row exists.
  - Staff with 0 open docs toggles off → `staff.duty_off { reassigned_count: 0 }`.
  - Staff toggles ON → `staff.duty_on { reassigned_count: 0 }`.
- **TEST-VER-224 (Should).** `verification.assignment.e2e-spec.ts` admin deactivation triggers reassignment:
  - Admin deactivates Moderator B (`PATCH /staff/:id { is_active: false }` or whatever the lifecycle endpoint is) → B's open docs are reassigned, audit rows reason `'admin_reassign'`. Cite the exact endpoint per `staff.lifecycle.e2e-spec.ts` for naming consistency.
- **TEST-VER-225 (Must).** `verification.assignment.e2e-spec.ts` terminal docs not reassigned: APPROVED / REJECTED docs assigned to a staff member who toggles off-duty → those docs' `assigned_to` stays put (historical pointer per VER-127).

#### Companies House

- **TEST-VER-230 (Must).** `verification.companies-house.e2e-spec.ts` happy path:
  - Mock `globalThis.fetch` to return active match → 200 `{ matched: true, milestone_id, registry_company_name }`. `COMPANY_HOUSE_VERIFIED` milestone exists with `notes` containing the registry response. Promotion engine ran (assert level didn't change for an UNVERIFIED user since they need Identity first; assert it ran for a BASIC employer to keep them at CERTIFIED if no INSURANCE — i.e. ran but no-op'd).
- **TEST-VER-231 (Must).** `verification.companies-house.e2e-spec.ts` registry not found → `404 COMPANIES_HOUSE_NOT_FOUND`. No milestone written. Audit row reflects `result: 'NOT_FOUND'` (or document the actual code if different).
- **TEST-VER-232 (Must).** `verification.companies-house.e2e-spec.ts` inactive status → 403 `COMPANIES_HOUSE_MISMATCH`. Audit row `result: 'INACTIVE'`.
- **TEST-VER-233 (Must).** `verification.companies-house.e2e-spec.ts` name mismatch → 400 `COMPANIES_HOUSE_MISMATCH` with `registry_response.{name, status}` populated. Audit row `result: 'NAME_MISMATCH'`.
- **TEST-VER-234 (Must).** `verification.companies-house.e2e-spec.ts` upstream error → 503 `COMPANIES_HOUSE_UPSTREAM` on `fetch` 500 / network throw. **No audit row** for the failed registry call (we only audit completed checks today; if this changes, the test pins it).
- **TEST-VER-235 (Must).** `verification.companies-house.e2e-spec.ts` not configured → 503 `COMPANIES_HOUSE_NOT_CONFIGURED`. Endpoint hit with `COMPANIES_HOUSE_API_KEY` unset.
- **TEST-VER-236 (Should).** `verification.companies-house.e2e-spec.ts` rate limiting (VER-144): 6th hit within 1 hour → `429`. Throttler is global per IP; the per-employer cap (3/hour) is `Should` and may be `.skip` if not yet shipped.

#### RTW share code & HMRC CIS

- **TEST-VER-240 (Must).** `verification.right-to-work.e2e-spec.ts` happy share-code path:
  - Worker uploads `RIGHT_TO_WORK_SHARE_CODE` with `metadata={share_code: 'W12 ABC 345'}` → 201, doc PENDING, metadata persisted with normalised case.
  - Staff approves → `RIGHT_TO_WORK_VERIFIED` milestone exists. Worker's `verification_level` does **not** advance to CERTIFIED on RTW alone (RTW is auxiliary per VER-043; only CSCS-family promotes).
- **TEST-VER-241 (Must).** `verification.right-to-work.e2e-spec.ts` invalid share code → `400 INVALID_SHARE_CODE`. Hyphenated form (`W12-ABC-345`) is the canonical fail case from the spec.
- **TEST-VER-242 (Must).** `verification.right-to-work.e2e-spec.ts` happy document path: `RIGHT_TO_WORK_DOCUMENT` with empty metadata → 201. Staff approves → `RIGHT_TO_WORK_VERIFIED` milestone.
- **TEST-VER-243 (Must).** `verification.hmrc-cis.e2e-spec.ts` happy CIS submission:
  - Worker submits `HMRC_CIS_DOCUMENT` with `metadata={utr: '1234567890', ni_number: 'AB123456C'}` → 201, doc PENDING, `file_url='(structured-only)'` per VER-146.
  - Audit row contains **only** `document_id` — never UTR or NI (VER-149 sensitive-data rule). Assert by serialising the audit row metadata and grepping for `1234567890` and `AB123456C`; the substring **must not appear**.
- **TEST-VER-244 (Must).** `verification.hmrc-cis.e2e-spec.ts` invalid credentials:
  - UTR 9 chars → `400 INVALID_UTR`.
  - NI bad format → `400 INVALID_NI`.
- **TEST-VER-245 (Must).** `verification.hmrc-cis.e2e-spec.ts` happy approve: staff approves → `HMRC_CIS_VERIFIED` milestone written. Worker's `verification_level` does **not** advance to CERTIFIED on HMRC alone (auxiliary per VER-006).

#### Reads

- **TEST-VER-250 (Must).** `verification.reads.e2e-spec.ts` `GET /verification/me`:
  - Returns the full grouped shape. Documents are present in the right buckets (verify with one row per status).
  - `next_action` matches the user's level.
  - Auth required → 401 unauthenticated.
- **TEST-VER-251 (Must).** `verification.reads.e2e-spec.ts` `GET /verification/levels/:id`:
  - Public (no auth) → 200.
  - Deactivated account → 404.
  - Flags map 1:1 to seeded milestones (assert the truth table for all 6 booleans).
  - `certification_doc_types` includes only APPROVED cert docs reachable via the `CERTIFICATION_APPROVED` milestone.
  - Response **does not** include `metadata`, doc IDs, or staff actor IDs (TEST-VER-152's e2e analogue).
- **TEST-VER-252 (Must).** `verification.reads.e2e-spec.ts` `GET /verification/ladder/:id`:
  - Owner → 200.
  - Other user → 403.
  - Staff → 200.
  - Rungs match the truth table for the seeded state.
- **TEST-VER-253 (Must).** `verification.reads.e2e-spec.ts` `GET /verification/providers`:
  - Stripe configured → `stripe_identity: true`. Unconfigured → false.
  - Companies House configured → `companies_house: true`. Unconfigured → false.
- **TEST-VER-254 (Should).** `verification.reads.e2e-spec.ts` deprecated endpoints (VER-020 backward compat):
  - `POST /verification/start` still returns the same shape as `/identity/start` (one-release deprecation).
  - `GET /verification/status` returns `{ verification_level }` from `/me`.
  - Both log a deprecation warning (assert via Nest logger spy if practical; otherwise smoke-only).

#### Queue

- **TEST-VER-260 (Must).** `verification.queue.e2e-spec.ts` `GET /verification/queue` scoping:
  - Moderator with no `assignment` → only their assigned docs.
  - Moderator with `assignment=all` → 403.
  - Moderator with `assignment=unassigned` → only unassigned docs.
  - Admin with no `assignment` → all docs.
  - Worker (non-staff) → 403 from `RolesGuard`.
- **TEST-VER-261 (Must).** `verification.queue.e2e-spec.ts` filters and sort:
  - `status=APPROVED` → only approved.
  - `doc_type=CSCS_CARD` → only CSCS.
  - Default sort oldest-first.
  - Pagination `page/limit` works.
- **TEST-VER-262 (Must).** `verification.queue.e2e-spec.ts` `GET /verification/queue/:id`:
  - Includes `uploader.verification_level`.
  - Includes `history` of prior submissions of same doc_type by same uploader, excluding self.
  - Doc not found → 404.

#### Documents upload (the validator's e2e surface)

- **TEST-VER-270 (Must).** `verification.documents.e2e-spec.ts` `POST /api/documents/upload` integrates the validator:
  - `OTHER` without `metadata.title` → 400 `INVALID_TITLE` / `METADATA_REQUIRED`.
  - `RIGHT_TO_WORK_SHARE_CODE` with hyphenated code → 400 `INVALID_SHARE_CODE`.
  - `HMRC_CIS_DOCUMENT` with bad UTR → 400 `INVALID_UTR`.
  - Happy paths normalise metadata (uppercased share code, stripped NI spaces).
- **TEST-VER-271 (Should).** `verification.documents.e2e-spec.ts` confirms `documents.e2e-spec.ts` (PROF-028..030) still passes — Verification's review surface coexists with the legacy upload surface.

### 5. Frontend unit tests (Vitest + RTL + MSW)

#### Verification queue (admin)

- **TEST-VER-300 (Must).** `VerificationQueueTab.test.tsx` initial load: mounts, calls `GET /verification/queue?status=PENDING,IN_REVIEW&assignment=all&limit=50`, renders one row per item with uploader, doc_type, status, assignee, file link, action buttons.
- **TEST-VER-301 (Must).** `VerificationQueueTab.test.tsx` filter binding: changing `Status` Select re-fetches with the new query string. Same for Assignment.
- **TEST-VER-302 (Must).** `VerificationQueueTab.test.tsx` Approve happy path: click Approve → `POST /verification/documents/:id/review { decision: 'APPROVE' }` → re-fetches the queue. No `<pre>` JSON dumps in the response handling.
- **TEST-VER-303 (Must).** `VerificationQueueTab.test.tsx` Reject flow:
  - Click Reject → opens reason textarea (the inline panel, not a modal — match shipped UI).
  - Confirm button is disabled when reason `<10` chars.
  - Submit with valid reason → `POST .../review { decision: 'REJECT', reason }` → panel closes, queue re-fetches.
  - Server returns `400 REJECTION_REASON_REQUIRED` → user sees the parsed error message in the alert region.
- **TEST-VER-304 (Must).** `VerificationQueueTab.test.tsx` Claim button:
  - Visible only when `assignee == null`.
  - Click → `POST /verification/documents/:id/claim` → re-fetches.
  - Server returns 400 `ALREADY_ASSIGNED` → alert region shows the message.
- **TEST-VER-305 (Must).** `VerificationQueueTab.test.tsx` terminal status: APPROVED / REJECTED docs render Approve and Reject buttons disabled (per VER-072).
- **TEST-VER-306 (Should).** `VerificationQueueTab.test.tsx` OTHER doc-type label: row carries the `metadata.title` suffix per VER-092. Missing title → no suffix.
- **TEST-VER-307 (Must).** `VerificationQueueTab.test.tsx` no JSON dumps: `screen.queryByText(/JSON/)` is null. No `<pre>` element with stringified JSON anywhere.

#### MilestonesStrip

- **TEST-VER-310 (Must).** `MilestonesStrip.test.tsx` renders one badge per truthy flag:
  - `flags.identity_verified=true` → "Identity verified" badge.
  - `flags.insurance_approved=true` → "Insurance" badge.
  - `flags.company_house_verified=true` → "Companies House" badge.
  - `flags.company_letterhead_approved=true` → "Letterhead" badge.
  - `flags.right_to_work_verified=true` → "Right to work" badge.
  - `flags.hmrc_cis_verified=true` → "HMRC CIS" badge.
  - `flags.certification_doc_types=['CSCS_CARD']` → "CSCS" badge.
- **TEST-VER-311 (Must).** `MilestonesStrip.test.tsx` reviews chip: `reviews.count > 0` → renders the chip with `★ avg (count reviews)`. `count = 0` → no chip.
- **TEST-VER-312 (Must).** `MilestonesStrip.test.tsx` empty state: all flags false, count = 0 → renders nothing (no whitespace-only wrapper that takes vertical space; assert via `container.firstChild === null` or matching the empty-state copy if the component renders one).
- **TEST-VER-313 (Should).** `MilestonesStrip.test.tsx` doc-type label table: each `certification_doc_types` enum maps to the right badge label (CSCS_CARD → "CSCS", GAS_SAFE_CERT → "Gas Safe", NICEIC_CERT → "NICEIC", FIRAS_CERT → "FIRAS"). `test.each` table.

#### ProfilePage Identity-CTA branches (VER-026 + the "fix-CTA-visibility" Decisions Log row)

- **TEST-VER-320 (Must).** `ProfilePage.test.tsx` Identity CTA visibility table (per the 2026-05-05 "CTA visibility: hide ONLY while Stripe is `processing`" decision):
  - `verification_level='UNVERIFIED'` + identity status `null` → CTA visible, label "Verify identity".
  - `verification_level='UNVERIFIED'` + identity status `requires_input` → CTA visible, label "Try again".
  - `verification_level='UNVERIFIED'` + identity status `processing` → CTA hidden, "Verifying..." copy or skeleton.
  - `verification_level='BASIC'` (or higher) → CTA hidden, "Identity verified" success state.
  - Stripe provider unconfigured (`/verification/providers` returns `stripe_identity: false`) → CTA hidden, fallback copy from VER-080.
- **TEST-VER-321 (Must).** `ProfilePage.test.tsx` Identity CTA click: hits `POST /verification/identity/start` → redirects to the returned `verification_url` (assert `window.location.assign` spy or `window.location.href` mutation).
- **TEST-VER-322 (Should).** `ProfilePage.test.tsx` Companies House CTA (employer): visible only when role=EMPLOYER + `providers.companies_house=true` + employer profile has `company_number`. Click → `POST /verification/employer/companies-house-verify` → success or error path renders banner.

#### Trust signals on every contact surface (VER-094)

- **TEST-VER-330 (Should).** `ConversationListItem.test.tsx` (or whichever inbox row component the implementation uses): row renders `<VerificationBadge>` reading `other_participant.verification_level` from the fixture. Pin VER-094 — the "trust info one glance away" guarantee in the inbox.
- **TEST-VER-331 (Should).** `WorkerCard.test.tsx` / `EmployerCard.test.tsx` / `ApplicantCard.test.tsx`: each card renders the badge + (where applicable) the milestones strip. May already pass via TEST-PROF-* — confirm before authoring duplicates; if covered, mark as `.skip` with citation.

### 6. Frontend e2e tests (Playwright)

Each Acceptance Criteria scenario from `tasks/done/verification/spec.md` "Acceptance Criteria" maps 1:1 to a Playwright spec. Stripe Identity is mocked at the network layer (the `/verification/identity/start` response returns a fixture URL the test never visits; the webhook is replayed via the backend's `/api/webhooks/stripe` endpoint with a signed test fixture).

- **TEST-VER-400 (Must).** `verification.staff-clear-queue.spec.ts`: admin opens AdminPage → Verification tab → sees a paginated list of pending docs oldest-first → clicks into a row → sees uploader info and file link → approves → row disappears from the active filter. Asserts the parent feature's first Acceptance bullet ("A staff member can clear the queue without SQL").
- **TEST-VER-401 (Must).** `verification.identity-promote-basic.spec.ts`: brand-new worker registers → verifies email → lands on `/profile` UNVERIFIED → clicks "Verify identity" → backend stub returns the test session URL → Playwright fires the `identity.verification_session.verified` webhook against `/api/webhooks/stripe` → page refresh shows BASIC badge → `<MilestonesStrip>` shows "Identity verified" chip.
- **TEST-VER-402 (Must).** `verification.cscs-promote-certified.spec.ts`: BASIC worker uploads a CSCS card → admin approves it from the Verification tab → user's profile flips to CERTIFIED → MilestonesStrip shows "CSCS" badge in addition to "Identity verified".
- **TEST-VER-403 (Must).** `verification.reject-with-reason.spec.ts`: admin rejects a worker's CSCS upload with reason "Image is too blurry to verify CSCS card number" → user opens `/profile` → DocumentsTab shows the rejected row with the reason text rendered.
- **TEST-VER-404 (Must).** `verification.share-code-submission.spec.ts`: worker enters share code `W12 ABC 345` in the RTW form → 201, row appears in the user's pending docs. Worker enters `W12-ABC-345` → inline validation message; no API call fires.
- **TEST-VER-405 (Must).** `verification.companies-house.spec.ts`: employer fills `company_name` + `company_number` on profile → clicks "Verify on Companies House" → backend hits the mocked registry endpoint (canned active-match fixture) → success banner appears, MilestonesStrip gains "Companies House" chip.
- **TEST-VER-406 (Should).** `verification.companies-house-mismatch.spec.ts`: same flow but registry returns a different name → UI shows the diff with the exact mismatch copy from VER-142.
- **TEST-VER-407 (Must).** `verification.premium-coming-soon.spec.ts`: a BASIC + CSCS-approved worker visits their own ladder → Premium rung renders with "Coming soon" copy. Admin manually sets `verification_level='PREMIUM'` via direct DB write (out-of-band, in the test setup) → public profile renders Premium badge but the user's own ladder still shows the "Coming soon" copy on the Premium rung (per the Edge Case in `tasks/done/verification/spec.md`).
- **TEST-VER-408 (Must).** `verification.staff-assignee-gating.spec.ts`: Moderator A logs in to AdminPage → sees only their assigned docs by default → tries to switch to "All" filter → backend returns 403, UI shows the error region (matches VER-130). Admin logs in → can switch to All. Admin opens a doc assigned to Moderator B → can approve, audit row carries `admin_override`.
- **TEST-VER-409 (Should).** `verification.duty-toggle.spec.ts`: on-duty Moderator A with 2 open docs toggles off-duty via the Members tab UI → confirmation dialog warns about reassignment → on confirm, the 2 docs flip to a different on-duty Moderator B (or to unassigned if no other on-duty staff exists). Audit rows assert.
- **TEST-VER-410 (Must).** `verification.guardrails.spec.ts`:
  - Visit `/admin` → no `<pre>` JSON dumps in the Verification tab.
  - Visit `/profile` → no `<pre>` JSON dumps in the verification surfaces.
  - `/api/docs` shape includes the documented Verification endpoints (Swagger smoke).

### 7. Coverage & guardrails

- **TEST-VER-500 (Must).** Jest coverage thresholds in `backend/package.json` extended for `backend/src/verification/`: floor at 80 % statements / 60 % branches per service file (the engine and review services are pure-ish and easy to cover; raise floors aggressively because the trust-ladder is load-bearing). DTOs excluded.
- **TEST-VER-501 (Should).** Vitest coverage in `web/vite.config.ts` includes `web/src/components/MilestonesStrip.tsx`, `web/src/components/admin/VerificationQueueTab.tsx`, and the verification-relevant slices of `ProfilePage.tsx` in the report.
- **TEST-VER-502 (Must).** `npm run lint:tokens` passes after this feature merges; the suite does not introduce raw hex colours into any new spec or fixture.
- **TEST-VER-503 (Must).** All new e2e specs reset between tests via the existing `h.reset()` truncation helper. No `beforeAll`-shared state across tests (race + flake risk).

### 8. Follow-ups discipline

- **TEST-VER-600 (Must).** Bugs surfaced by the suite are filed in `tasks/in-progress/tests-verification/followups.md` (created on first finding) with the format used by `tasks/done/tests-auth-flow/followups.md` — `[VER-NNN]` ID + one-line summary + reproducing test ID + recommended fix scope. The suite **does not silently fix** any bug it reveals.
- **TEST-VER-601 (Must).** Code-vs-spec discrepancies already known from the audit (filed pre-emptively as TEST-VER day-one entries):
  - **VER-137 claim error code**: spec says 409, code throws 400 `ALREADY_ASSIGNED`. Recommended fix: change code to `ConflictException` to match spec.
  - **VER-142 mismatch error code**: spec says 400, code throws 403 for inactive status (and 400 for name mismatch). Recommended: pick one — either both 400 or both 409 — and update the spec or the code accordingly.
  - **TrustLadderPanel / RightToWorkSection**: components don't exist as standalone files; the test scaffolding from `tests-profiles` was never deleted. TEST-VER-010 / 011 own the cleanup.
- **TEST-VER-602 (Must).** Tests that depend on un-shipped backend prerequisites (Reviews-driven Premium predicate, Resend webhook for mail-bounce handling, the Right-to-Work Online API once partnership lands) are written but `.skip`'d with a comment citing the prerequisite. Removing the skip is the unblocker when the prerequisite ships.
- **TEST-VER-603 (Should).** A `tasks/in-progress/tests-verification/coverage-matrix.md` (or appendix here) maps each `VER-NNN` ID to the `TEST-VER-NNN` IDs that cover it. Authored at the end of the implementation pass; ensures no requirement slipped through.

## Edge Cases

- **A `<pre>{JSON.stringify(...)}</pre>` is reintroduced for "debugging" in a future PR.** TEST-VER-307 / TEST-VER-410 fail.
- **A future refactor moves the assignee guard from `DocumentReviewService` to a NestJS interceptor and forgets the admin override branch.** TEST-VER-116 / TEST-VER-213 fail.
- **A future refactor changes the public flag projection to include doc IDs "for richer cards".** TEST-VER-152 / TEST-VER-251 fail (the substring grep over the response).
- **Stripe Identity webhook becomes non-idempotent (someone moves the `existing` lookup outside the milestone-write branch).** TEST-VER-144 / TEST-VER-202 fail.
- **`MailService.sendVerificationVerified` is accidentally `await`'ed in the webhook handler.** TEST-VER-147 fails — the swallowed-rejection guarantee is gone.
- **Companies House client starts lower-casing names without the bidirectional `includes` check.** TEST-VER-137 / TEST-VER-138 fail on the `Foo & Bar Ltd` vs `Foo Bar Limited` case.
- **The promotion engine's worker-vs-employer branch flips (someone tries to "unify" the predicate).** TEST-VER-100 / TEST-VER-101 fail because employer no longer needs INSURANCE + LETTERHEAD.
- **`POST /verification/documents/:id/claim` is "simplified" to a non-conditional update.** TEST-VER-221's race test serialises a 200/200 instead of 200/400; assertion fails.
- **Auth's `verificationState` is renamed and accidentally swept into Verification's `verification_level`.** TEST-VER-200's `PENDING_EMAIL_VERIFICATION` branch fails (the AccountStateGuard layer breaks).
- **VER-094 trust signals are removed from the inbox row.** TEST-VER-330 fails.

## Acceptance Criteria

- `cd backend && npm test` runs the new unit specs green, with un-shipped-prerequisite tests `.skip`'d (citing the prerequisite ID).
- `cd backend && npm run test:e2e` runs the new e2e specs green against the Testcontainer Postgres.
- `cd web && npm test` runs the new Vitest specs green.
- `cd web && npm run test:e2e` runs the new Playwright specs green; the Acceptance scenarios from `tasks/done/verification/spec.md` map 1:1 to a passing test.
- The two `.skip`'d Profiles test files (TrustLadderPanel.test.tsx, RightToWorkSection.test.tsx) are either deleted or rewritten — no `.skip` referencing "BLOCKED on Verification" remains anywhere in the repo after this lands.
- The stale `right-to-work.e2e-spec.ts` is either deleted or replaced with the new `verification.right-to-work.e2e-spec.ts` from TEST-VER-240..242.
- Mentally re-introduce a JSON-dump on `VerificationQueueTab`: TEST-VER-307 / TEST-VER-410 go red. Mentally drop the assignee gate in `DocumentReviewService.review()`: TEST-VER-116 / TEST-VER-213 go red. Mentally drop the dup-detect branch in `handleWebhookEvent`: TEST-VER-144 / TEST-VER-202 go red.
- Production code under `backend/src/verification/` and `web/src/components/admin/VerificationQueueTab.tsx` / `web/src/components/MilestonesStrip.tsx` is **not modified** by this feature; bugs found are filed as follow-ups (TEST-VER-600, TEST-VER-601).
- A coverage matrix exists (TEST-VER-603) showing every `VER-NNN` requirement maps to ≥ 1 `TEST-VER-NNN` test.

## Open Questions

- **TEST-VER-OQ-1.** Do we replay Stripe webhook fixtures through the real signed-payload path or shortcut into `verification.service.handleWebhookEvent` directly? Recommend: the real signed path, so the signature-verification + idempotency-key handling in `webhooks.controller.ts` is also covered. The fixture sample lives next to the test and a helper signs it with the test's fake `STRIPE_WEBHOOK_SECRET`.
- **TEST-VER-OQ-2.** Should TEST-VER-330 (inbox VerificationBadge) be authored here or in `tests-conversations` once that feature opens? Recommend: here, since VER-094 is a Verification-spec deliverable; it can be moved later.
- **TEST-VER-OQ-3.** Does the Companies House cap of "3/hour per employer" (VER-144) ship today or is it `Should` skipped? Inspect `verification.controller.ts:131` — only the per-IP cap is wired via `@Throttle({ default: { limit: 5, ttl: 1h } })`; the per-employer cap is **not implemented**. Recommend: file as a followup against VER-144, `.skip` TEST-VER-236's per-employer assertion until shipped.
- **TEST-VER-OQ-4.** The `/verification/start` and `/verification/status` deprecated endpoints (TEST-VER-254) still pass through. Should we remove them in this test feature's scope or just lock the back-compat? Recommend: lock back-compat (one release of overlap per VER-020); deletion is a separate ticket once the SPA is fully migrated.

## Decisions Log

- **2026-05-06 — Folder created.** `tasks/in-progress/tests-verification/` opened the day after Verification merged, per repo `CLAUDE.md` "Every shipped feature has tests" and the precedent set by `tests-auth-flow/`, `tests-profiles/`, `tests-jobs-applications/`.
- **2026-05-06 — Reuse-only stack.** Vitest + RTL + MSW v2 (frontend unit), Playwright (frontend e2e), Jest + Supertest + Testcontainers (backend) — all already present in the repo via the three prior `tests-*` features. No new test runners.
- **2026-05-06 — Skip-and-unblock for un-shipped prerequisites.** Tests for Reviews-driven Premium / per-employer Companies House throttle / Right-to-Work Online API are written and `.skip`'d with citations; removing the skip is the unblocker when each prerequisite ships (TEST-VER-602). Mirrors the `tests-jobs-applications` pattern.
- **2026-05-06 — No production-code edits from this feature.** Bugs surfaced get filed in `tasks/in-progress/tests-verification/followups.md` (TEST-VER-600). Two day-one followups are pre-filed (TEST-VER-601): VER-137 claim error code (spec 409 vs code 400) and VER-142 mismatch error code (spec 400 vs code 403 for inactive). Mirrors `tests-profiles` discipline.
- **2026-05-06 — Cleanup before authoring.** TEST-VER-010 / 011 / 012 explicitly require deleting / unblocking the three stale `.skip`'d Profiles fixtures before the new tests are authored, so no two test files claim ownership of the same surface.
- **2026-05-06 — Stripe and Companies House mocked at module boundary.** No real network calls in CI. Stripe via `Mocked<Stripe>` typed mock for unit + the existing test-app harness's stub for e2e; Companies House via `globalThis.fetch` mock with canned fixtures (TEST-VER-006). Real-API smoke checks documented in the parent feature's status.md, run by humans on demand.
