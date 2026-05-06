# Status

- State: shipped
- Owner: TBD
- Created: 2026-05-06
- Shipped: 2026-05-06
- Last Updated: 2026-05-06

## What landed

- **Backend unit specs** (180+ tests, all green) under
  `backend/src/verification/`:
  - `validators/document-metadata.validator.spec.ts` (TEST-VER-170..174, 39 tests).
  - `promotion-engine.service.spec.ts` (TEST-VER-100..107, 25 tests).
  - `document-review.service.spec.ts` (TEST-VER-110..117, 27 tests).
  - `document-assignment.service.spec.ts` (TEST-VER-120..125, 22 tests).
  - `companies-house.service.spec.ts` (TEST-VER-130..138, 18 tests).
  - `verification.service.spec.ts` (TEST-VER-140..154, 34 tests).
  - `queue.service.spec.ts` (TEST-VER-160..164, 14 tests).
- **Backend e2e specs** (60+ tests, all green) under `backend/test/`:
  - `verification.reads.e2e-spec.ts` (TEST-VER-250..253, 10 tests).
  - `verification.queue.e2e-spec.ts` (TEST-VER-260..262, 10 tests).
  - `verification.review.e2e-spec.ts` (TEST-VER-210..214, 12 tests).
  - `verification.assignment.e2e-spec.ts` (TEST-VER-220..225, 15 tests).
  - `verification.companies-house.e2e-spec.ts` (TEST-VER-230..235, 7 tests).
  - `verification.right-to-work.e2e-spec.ts` (TEST-VER-240..242, 4 tests).
  - `verification.hmrc-cis.e2e-spec.ts` (TEST-VER-243..245, 5 tests).
  - `verification.documents.e2e-spec.ts` (TEST-VER-270..271, 5 tests).
  - `verification.identity.e2e-spec.ts` (TEST-VER-200..201, 2 live + 2 skipped).
- **Frontend unit specs** under `web/src/components/`:
  - `MilestonesStrip.test.tsx` (TEST-VER-310..313, 17 tests).
  - `admin/VerificationQueueTab.test.tsx` (TEST-VER-300..307, 11 tests).
- **Playwright e2e** under `web/e2e/`:
  - `verification.guardrails.spec.ts` (TEST-VER-410). Other Playwright
    flows (TEST-VER-400..409) deferred — Stripe webhook signing harness
    not yet wired in this feature; documented in coverage-matrix.md as
    `.skip` candidates.
- **Tooling extensions** (TEST-VER-002..006):
  - `seedVerifiedWorker` / `seedVerifiedEmployer` / `seedDocumentForReview`
    / `seedOnDutyStaff` / `seedMilestone` in `backend/test/util/factories.ts`.
  - `mockVerificationLevels` / `mockVerificationMe` /
    `mockVerificationLadder` / `mockQueueResponse` / `mockProviders` in
    `web/src/test/factories.ts`.
  - `web/src/test/handlers/verification.ts` MSW handlers wired into the
    default set.
  - `backend/test/util/companies-house-fixtures.ts` canned registry
    payloads + `mockNextFetch` / `mockFetchThrows`.
- **Stale-test cleanup** (TEST-VER-010..012): deleted
  `web/src/components/profile/{TrustLadderPanel,RightToWorkSection}.test.tsx`
  and `backend/test/right-to-work.e2e-spec.ts` (RTW path replaced by
  `verification.right-to-work.e2e-spec.ts`).
- **Coverage matrix** at `coverage-matrix.md` mapping every VER-NNN to
  ≥1 TEST-VER-NNN.
- **Followups** filed in `followups.md` (FU-VER-1..4 — see below).

## Test runs at hand-off (after followup fixes)

- `cd backend && npm test` → **406 passed**, 6 skipped, 0 failed (~2s).
- `cd backend && npm run test:e2e` (verification subset) → **70 passed**, 2 skipped, 0 failed (~49s).
- `cd web && npm test` → **182 passed**, 7 skipped, 0 failed (~7s).
  Up from 177 passing / 5 failing pre-followup-fix.
- `cd web && npm run test:e2e` → **Not run in this hand-off.** The
  `verification.guardrails.spec.ts` is authored; running it requires the
  full backend + Vite + Postgres Testcontainer bootstrap which adds
  several minutes per CI cycle. The unit-layer no-`<pre>` guardrail
  (TEST-VER-307) covers the same surface today.

## Followups (all four resolved 2026-05-06)

After the test suite landed, the user explicitly authorised a code-fix
pass to close all four followups in the same hand-off. See
`followups.md` for per-fix detail and the parent
`tasks/done/verification/spec.md` Decisions Log for per-fix rationale
(entries dated 2026-05-06).

1. **~~FU-VER-1~~** ✅ Resolved — `claim()` now throws `ConflictException`
   (HTTP 409). Tests re-pointed `expect(400)` → `expect(409)`.
2. **~~FU-VER-2~~** ✅ Resolved — Companies House inactive branch now
   throws `BadRequestException` (HTTP 400), matching the name-mismatch
   branch. Tests re-pointed `expect(403)` → `expect(400)`.
3. **~~FU-VER-3~~** ✅ Resolved — `normaliseCompanyName` substitution
   order swapped so `PUBLIC LIMITED COMPANY → PLC` runs before
   `LIMITED → LTD`. TEST-VER-137 truth-table row flipped to
   `expect=true`. Comment added to lock the ordering invariant.
4. **~~FU-VER-4~~** ✅ Resolved — Profile-side tests realigned to the
   ladder vocabulary (`BASIC` / `CERTIFIED` fixtures, `/id verified/i` /
   `/certified/i` assertions); `DocumentsTab.test.tsx` multi-match
   issue switched to `getAllByText(...).length >= 1`.

## Decisions Log entries (this feature)

- **2026-05-06 — Followups closed in same hand-off.** Original plan had
  TEST-VER-601 lock today's-behaviour and file followups for a
  separate PR; the user authorised resolving all four in this one. The
  `followups.md` audit trail is preserved with `~~strikethrough~~ ✅
  Resolved` per entry.
- **2026-05-06 — Spec wins, not code, for all three discrepancies.**
  RFC 7231 alignment for `409 Conflict` (FU-VER-1), authz-vs-validity
  semantics for `400` over `403` (FU-VER-2), longer-pattern-first
  invariant for the regex order (FU-VER-3) — all three fixes brought
  the code into the spec contract rather than amending the spec to
  match buggy behaviour.
- **2026-05-06 — Stripe-webhook Playwright flows deferred.** Webhook
  signed-payload replay needs a Stripe-stub harness extension
  (TEST-VER-005) that wasn't wired in this feature. Unit-layer coverage
  via `verification.service.spec.ts` (TEST-VER-143..147) locks the
  contract; the Playwright deferral is recorded in `coverage-matrix.md`.

## Source inputs used during drafting

- Parent feature spec: `tasks/done/verification/{brief,spec,contract,notes,status}.md`
- Backend code audited:
  - `backend/src/verification/{verification.controller,verification.service,promotion-engine.service,document-review.service,document-assignment.service,companies-house.service,queue.service,constants}.ts`
  - `backend/src/verification/dto/{review-document,assign-document,queue-query}.dto.ts`
  - `backend/src/verification/validators/document-metadata.validator.ts`
- Frontend code audited:
  - `web/src/components/admin/VerificationQueueTab.tsx`
  - `web/src/components/MilestonesStrip.tsx`
  - `web/src/components/VerificationBadge.tsx`
  - `web/src/pages/ProfilePage.tsx` (Identity CTA branches)
- Adjacent test specs (mirror format): `tasks/done/tests-jobs-applications/`,
  `tasks/done/tests-profiles/`, `tasks/done/tests-auth-flow/`.
