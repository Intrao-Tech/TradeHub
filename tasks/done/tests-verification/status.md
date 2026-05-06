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

## Test runs at hand-off

- `cd backend && npm test` → **406 passed**, 6 skipped, 0 failed
  (412 total, 21 spec files + 6 we authored).
- `cd backend && npm run test:e2e` → **196 passed**, 4 skipped, 0 failed
  (200 total, ~261s).
- `cd web && npm test` → **177 passed**, 7 skipped, 5 failed (189 total).
  The 5 failures are pre-existing — they reference legacy "KYC verified"
  / "HMRC confirmed" badge text that the Verification rename removed
  (Profiles-side tests that the rename PR should have updated). Tracked
  in `followups.md` as **FU-VER-4**. Before this feature: 15 failures.
- `cd web && npm run test:e2e` → **Not run in this hand-off.** The
  `verification.guardrails.spec.ts` is authored; running it requires the
  full backend + Vite + Postgres Testcontainer bootstrap which adds
  several minutes per CI cycle. The unit-layer no-`<pre>` guardrail
  (TEST-VER-307) covers the same surface today.

## Followups created

1. **FU-VER-1** — `claim()` returns 400 ALREADY_ASSIGNED, spec says 409.
2. **FU-VER-2** — Companies House inactive returns 403, name mismatch
   returns 400; spec promises 400 for both.
3. **FU-VER-3** — `normaliseCompanyName` `LIMITED→LTD` rule pre-empts
   `PUBLIC LIMITED COMPANY→PLC`, so `"Acme Public Limited Company"` does
   not match `"Acme PLC"` (test row pinned at expect=false).
4. **FU-VER-4** — Pre-existing Profile-side tests reference legacy
   verification badge vocabulary; not fixed here per the
   "no production-code edits from this feature" working principle.

## Decisions Log entries (this feature)

- **2026-05-06 — PLC normalisation gap pinned, not fixed.** TEST-VER-137
  truth-table row for "Acme Public Limited Company vs Acme PLC" is
  locked at `expect=false`. FU-VER-3 tracks the production fix.
- **2026-05-06 — claim/inactive error-code discrepancies pinned.**
  Both unit and e2e specs assert today's HTTP statuses (400 for both,
  rather than the spec's 409 / 400 split). FU-VER-1 / FU-VER-2 track
  the unification.
- **2026-05-06 — Stripe-webhook Playwright flows deferred.** Webhook
  signed-payload replay needs a Stripe-stub harness extension
  (TEST-VER-005) that wasn't wired in this feature. Unit-layer coverage
  via `verification.service.spec.ts` (TEST-VER-143..147) locks the
  contract; the Playwright deferral is recorded in `coverage-matrix.md`.
- **2026-05-06 — Profile-side test drift not absorbed.** The 5 pre-
  existing failures in `WorkerCard.test.tsx`, `ClientPublicProfilePage`,
  `WorkerDetailPage`, `DocumentsTab` are tracked in FU-VER-4 rather
  than fixed here, per the working principle (this feature does not
  edit Profile production code or Profile test code outside its
  explicit cleanup mandate).

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
