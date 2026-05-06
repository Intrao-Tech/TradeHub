# Brief — tests-verification

## Why this exists

The Verification feature shipped to `tasks/done/verification/` on 2026-05-05 (branch `feature/identity-and-doc-verif`, merged via PR #9) without a regression-guarding test counterpart. The repo `CLAUDE.md` "Tests are not optional" working principle and the parent `status.md` explicitly call out the missing companion suite:

> **Test counterpart required**: per `tasks/GUIDE.md` working principles, every shipped feature must have a `tests-<feature>/` companion. Open `tests-verification` brief same week — coverage targets in priority order: (a) promotion-engine truth tables, (b) document-review state machine + assignee gating, (c) workload-balanced assignment + race-free claim, (d) Stripe Identity webhook idempotency, (e) Companies House mismatch / not-found / upstream paths, (f) public `/verification/levels/:id` flag projection.

This brief opens that companion. The spec.md author maps every `VER-NNN` requirement to ≥1 `TEST-VER-NNN` test ID and follows the conventions established by `tests-auth-flow/`, `tests-profiles/`, and `tests-jobs-applications/` (already in `tasks/done/`).

## What's actually covered today

A full audit of `backend/src/verification/`, `backend/test/`, and `web/src/` against the VER-NNN contract finds the following live tests **and only the following**:

| File | What it covers | Verdict |
|---|---|---|
| `web/src/components/VerificationBadge.test.tsx` | `verificationFromLevel()` vocabulary mapping + 4-state render | Live and passes (covers VER-090, partially VER-091) |
| `web/src/components/profile/TrustLadderPanel.test.tsx` | TrustLadderPanel rungs + microcopy | All 4 cases `.skip` — component doesn't even exist as a `.tsx`; was `.skip`'ed pending Verification, never unblocked |
| `web/src/components/profile/RightToWorkSection.test.tsx` | Share-code regex + DOB picker + document fallback | All 3 cases `.skip` — same story; component file doesn't exist |
| `backend/test/right-to-work.e2e-spec.ts` | RTW upload via the `OTHER` fallback | Live but **stale** — TEST-PROF-201 `.skip`'ed RTW-specific assertions; share-code path is now shipped under `RIGHT_TO_WORK_SHARE_CODE` doc_type but the test still claims "BLOCKED on Verification" |
| `backend/test/documents.e2e-spec.ts` | Generic document upload + delete (PROF-028..030) | Live — covers Profiles, **does not** cover the new staff review surface |

**That's it.** Everything else in the VER-NNN spec is unguarded:

- Zero `*.spec.ts` files exist anywhere under `backend/src/verification/` for **`promotion-engine.service.ts` (175 LOC, pure-ish predicate truth table), `document-review.service.ts` (191 LOC, state machine + assignee gating), `document-assignment.service.ts` (239 LOC, workload algorithm + race-free claim), `companies-house.service.ts` (245 LOC, registry client + name normalisation), `queue.service.ts` (208 LOC, visibility scoping), `verification.service.ts` (528 LOC, Stripe Identity + the 3 read endpoints + ladder computation), or `validators/document-metadata.validator.ts` (108 LOC, share-code / UTR / NI regex + OTHER title)**.
- Zero e2e specs exist under `backend/test/` for any of the new `/verification/*` endpoints — `identity/start`, `identity/status`, `queue`, `queue/:id`, `documents/:id/review`, `documents/:id/assign`, `documents/:id/claim`, `me`, `levels/:id`, `ladder/:id`, `providers`, `employer/companies-house-verify`. Nor for the new `POST /staff/me/duty` endpoint.
- Zero unit tests for `MilestonesStrip.tsx` (rendered on every public profile and on every conversation row per VER-094) or `VerificationQueueTab.tsx` (the entire staff decision surface, ~386 LOC).
- Zero Playwright specs that drive the verification flow end to end — Stripe Identity round-trip, staff approve→promotion chain, reject-with-reason → user sees reason, share-code submission, Companies House check, HMRC CIS submission.

## So: did the teammate add tests?

**No.** Two test files (`TrustLadderPanel.test.tsx`, `RightToWorkSection.test.tsx`) and one e2e file (`right-to-work.e2e-spec.ts`) were authored by the **Profiles** owner before Verification shipped, with `.skip`'d test bodies tagged "BLOCKED on Verification." Verification has now shipped, but those skips were never removed and no new tests were authored. `VerificationBadge.test.tsx` is the only live test that touches the new vocabulary and it predates this feature too (TEST-PROF-108).

The shipped Verification surface — promotion engine, document review state machine, workload-balanced assignment, Stripe Identity webhook idempotency, Companies House client, public flag projection, RTW share-code submission, HMRC CIS structured submission, on-duty toggle, staff queue with admin override — has **no test coverage**.

## Logic that needs verification (does the existing code do the right thing?)

A walk-through of the shipped code against the VER-NNN spec turns up the following items the test suite must lock down. Each is a real product invariant the spec promises and that today's code either satisfies but doesn't prove, or that the test suite must establish on first run. (Items where this brief flags a possible discrepancy with the spec are marked **⚠** so the implementing engineer triple-checks.)

1. **Promotion engine — VER-010..014.**
   - `evaluate()` truth table for worker (UNVERIFIED → BASIC via Identity → CERTIFIED via any approved cert → PREMIUM blocked because Reviews not shipped).
   - `evaluate()` truth table for employer (UNVERIFIED → BASIC → CERTIFIED requires INSURANCE **AND** COMPANY_LETTERHEAD → PREMIUM additionally requires COMPANY_HOUSE_VERIFIED **AND** ≥5 reviews — both fail today, so MVP cap is CERTIFIED). ⚠ The shipped code's Premium predicate is `verifiedReviewsCount >= 5`, hard-zeroed; spec VER-005 says "promotion engine never writes PREMIUM in MVP" — confirmed by the predicate.
   - Idempotency: running `runPromotion` twice on the same evidence yields the same level and the second call writes nothing.
   - Demotion path: if the only `IDENTITY_VERIFIED` milestone is removed, next run downgrades to UNVERIFIED. (Spec VER-004 says implemented but not exposed; lock the predicate.)
   - **Deactivated guard**: `runPromotion` no-ops when `account.status !== 'ACTIVE'` (this matters because Stripe webhooks still fire for deactivated users).
   - **`LEVEL_PROMOTED` milestone shape**: `evidence_ref` carries comma-joined milestone IDs (or null on empty), `notes` carries the new level string.

2. **Document review — VER-032 / 033.**
   - REJECT without reason → `400 REJECTION_REASON_REQUIRED`; reason `<10` chars trimmed → same; reason `>500` chars (controller DTO `Length` validator) → 400.
   - APPROVE with a reason → `400 VALIDATION` (the spec is explicit: `reason` forbidden on approve).
   - Already-terminal document (APPROVED / REJECTED) → `409 INVALID_TRANSITION`.
   - Non-admin staff who is not the assignee → `403 NOT_ASSIGNEE`. Admin override succeeds and writes `admin_override: true` into the audit metadata. ⚠ The spec says non-admin staff "cannot review a document where `assigned_to !== self`" — the code enforces this; tests must lock both branches.
   - Approving an `OTHER` (or any non-milestone-mapped) doc type writes the document update + audit log but **does not** write a milestone or run the promotion engine. Approving a `*_CERT` / `INSURANCE` / `COMPANY_LETTERHEAD` / `RIGHT_TO_WORK_*` / `HMRC_CIS_DOCUMENT` writes the corresponding milestone and runs the engine.
   - On both decisions, `reviewed_by` and `reviewed_at` are populated; on REJECT, `rejection_reason` is set and persists for the user-side Documents tab.

3. **Document assignment — VER-125 / 126 / 127.**
   - `pickNextAssignee()` returns the on-duty + active staff with the lowest `assigned_documents` count where status ∈ (PENDING, IN_REVIEW). Tie-break by earliest `created_at`.
   - Returns `null` when no on-duty + active staff exists; uploads land in the unassigned bucket.
   - `assignToStaff()` rejects targets that are missing / deactivated / off-duty with the structured error code (`STAFF_NOT_FOUND` / `STAFF_DEACTIVATED` / `STAFF_OFF_DUTY`).
   - `claim()` is race-safe: a conditional `updateMany` against `assigned_to: null` returns `count = 0` for already-claimed rows and surfaces `400 ALREADY_ASSIGNED`. ⚠ The spec text in VER-137 says "409 ALREADY_ASSIGNED" but the implementation throws `BadRequestException` (HTTP 400). This is a spec/code discrepancy the test must record — either the implementation is changed to 409 (preferred per spec) or the spec is amended via Decisions Log. Either way the test makes the discrepancy visible.
   - `reassignFromStaff()` redistributes a leaving staff's open queue and never returns rows to the same staff (the "only one on-duty" edge case — fall back to unassigned bucket).
   - Terminal documents (APPROVED / REJECTED) are never reassigned. Reassignment scans `status: { in: ['PENDING', 'IN_REVIEW'] }` only.

4. **Stripe Identity — VER-020..025.**
   - `startIdentitySession()` returns 409 `ALREADY_VERIFIED` for non-UNVERIFIED users — **this trips for any user already at BASIC or higher**, including ones who accidentally retry. ⚠ The spec VER-022 says "Already-Basic-or-higher accounts" — code is consistent.
   - Stripe not configured → `503 STRIPE_NOT_CONFIGURED`.
   - Webhook handler for `identity.verification_session.verified` is idempotent: a second call with the same `session.id` finds the existing milestone with the same `evidence_ref` and no-ops. (No second milestone, no second mail send, no second promotion run.)
   - Webhook handler for `requires_input` writes the audit row with the Stripe error code, fires `MailService.sendVerificationFailed` fire-and-forget, and does **not** promote.
   - Mail failures must not break the webhook (`void this.mail.sendVerificationVerified(...)` — a rejected promise is dropped).

5. **Companies House — VER-140..145.**
   - Not configured → 503 `COMPANIES_HOUSE_NOT_CONFIGURED`.
   - Missing `company_number` or `company_name` on the EmployerProfile → 400 `COMPANY_DETAILS_MISSING`.
   - Registry returns 404 → 404 `COMPANIES_HOUSE_NOT_FOUND`.
   - Registry returns 5xx or fetch throws → 503 `COMPANIES_HOUSE_UPSTREAM`.
   - Registry `company_status !== 'active'` → 403 `COMPANIES_HOUSE_MISMATCH` with `registry_response.status` populated. ⚠ The spec VER-142 says 400 for mismatch; the code throws `ForbiddenException` (HTTP 403) on inactive status and `BadRequestException` (HTTP 400) on name mismatch. Tests must assert what ships **and** flag the inconsistency in `followups.md` so the team picks one shape.
   - Name normalisation: `Limited`/`Ltd`, punctuation, whitespace; bidirectional `includes` (registry name contains submitted name OR vice versa). Pin the predicate in unit tests so future "we'll just lower-case it" PRs trip a guardrail.
   - On match: writes `COMPANY_HOUSE_VERIFIED` milestone with `evidence_ref = company_number`, runs promotion engine.

6. **Public read VER-060 / 060a.**
   - `/verification/levels/:id` returns 404 for accounts where `account.status !== 'ACTIVE'` (deactivated leak prevention).
   - `flags.identity_verified` / `insurance_approved` / `company_house_verified` / `company_letterhead_approved` / `right_to_work_verified` / `hmrc_cis_verified` map 1:1 to milestone presence.
   - `flags.certification_doc_types` is the deduplicated set of approved cert doc-types reached via the `CERTIFICATION_APPROVED` milestone's `evidence_ref → Document.id → doc_type` lookup. ⚠ This is two joins deep and is the only "interesting" projection in the public read; it's the most likely place for a future PR to leak doc IDs or include rejected docs.
   - `reviews.{count, average}` reads from `worker_profile` first then `employer_profile`.

7. **`/verification/me` and `/verification/ladder/:id` — VER-053 / 061.**
   - `getMe` groups documents by status (pending / in_review / approved / rejected) and returns the next-action computed by the same `computeLadder` used by `getLadder`.
   - `getLadder` enforces "owner OR staff" — non-staff non-owner gets 403 `FORBIDDEN`.
   - Ladder rungs: UNVERIFIED always DONE (account exists), BASIC depends on `IDENTITY_VERIFIED` milestone, CERTIFIED uses approved-cert document presence (worker) or insurance + letterhead (employer), PREMIUM is always `COMING_SOON` in MVP.
   - `next_action` is `null` for currentLevel ≥ CERTIFIED (the user has no further steps until Reviews ships).

8. **Queue scoping — VER-130 / 131.**
   - Moderator passing `assignment=all` → `403 FORBIDDEN`.
   - Moderator default scope: `mine` (`assigned_to = self.staffMemberId`).
   - Admin default scope: `all`. Admin can switch to `mine` / `unassigned` / a specific filter.
   - Default status filter is `PENDING + IN_REVIEW`. Sort is `created_at ASC` (oldest-first fairness per VER-070).

9. **Document metadata validator — VER-040 / 041 / 092 / 146.**
   - `RIGHT_TO_WORK_SHARE_CODE`: regex `^[A-Z0-9]{3} [A-Z0-9]{3} [A-Z0-9]{3}$` after trim+upper. Hyphen-separated form (`W12-ABC-345`) → `400 INVALID_SHARE_CODE`.
   - `HMRC_CIS_DOCUMENT`: UTR `^\d{10}$`, NI `^[A-Z]{2}\d{6}[A-Z]$` after upper+strip-spaces.
   - `OTHER`: `metadata.title` required, 3–100 chars after trim. Missing title → `400 INVALID_TITLE` (or `400 METADATA_REQUIRED` if metadata is absent altogether).
   - `CSCS_CARD`/`GAS_SAFE_CERT`/`NICEIC_CERT`/`FIRAS_CERT`/`INSURANCE`: optional structured capture, no enforcement; pass-through if object, null otherwise.

10. **Frontend surfaces — VER-070..075, 090..094.**
    - `VerificationQueueTab` calls `GET /verification/queue?status=PENDING,IN_REVIEW&assignment=all&limit=50` on mount and re-runs on filter change. Approve sends `{ decision: 'APPROVE' }`; Reject opens the textarea, blocks Confirm until reason ≥10 chars, then sends `{ decision: 'REJECT', reason }`. Claim button visible only when `assignee == null`.
    - `MilestonesStrip` renders one `Badge` per truthy flag plus one badge per approved trade-cert doc_type plus a Reviews chip when count > 0; emits nothing when all flags are false and reviews count = 0.
    - `verificationFromLevel` already locked by TEST-PROF-108 — keep, don't re-test.

11. **End-to-end product invariants — VER-acceptance.**
    - Approving a Stripe-Identity webhook lifts the user from UNVERIFIED to BASIC and writes both `IDENTITY_VERIFIED` and `LEVEL_PROMOTED(notes='BASIC')` milestones.
    - Approving a CSCS for a Basic worker promotes to CERTIFIED with `CERTIFICATION_APPROVED` + `LEVEL_PROMOTED(notes='CERTIFIED')`.
    - Rejecting a document populates `Document.rejection_reason` and surfaces in the user's `/verification/me` rejected bucket.
    - RTW share code `W12 ABC 345` accepted; `W12-ABC-345` rejected.
    - Premium predicate currently returns false for any user who would otherwise qualify. This is the "Coming soon" guarantee.

## Out of scope

- Re-testing Auth's `verificationState` (account state) — the column name collision with `verification_level` is unfortunate but Auth's state machine is locked by `tests-auth-flow`.
- Re-testing Profiles' `verificationFromLevel` (TEST-PROF-108).
- Real Stripe API calls — Stripe Identity uses the test mode hosted-session URL plus a webhook fixture replay; we never call the real API in CI.
- Real Companies House calls — `fetch` is mocked at the module boundary; live API is documented in the spec for manual smoke checks only.
- Loading-state visual regression of the queue / strip components.
- HMRC CIS gateway round-trip — the real path is staff visual confirmation of the gov.uk lookup; the test surface is the structured submission path through `validateDocumentMetadata` + the staff approval flow.

## Risk if we don't ship this

- **Promotion engine drift** — the truth table is the trust-ladder contract. A future "let's add a HMRC rung" PR could silently change the order or break idempotency. Without truth-table tests, a regression here is invisible until a customer notices.
- **Assignee gating regression** — VER-132 ("non-assignee staff cannot decide") is the load-bearing access-control guarantee; without an e2e test, a refactor could open a privilege-escalation path where any moderator can approve any document.
- **Webhook idempotency loss** — Stripe re-delivers events on transient SMTP failures; a regression in the duplicate-detection branch double-promotes the user and double-fires the mail. This bug is invisible in dev (no Stripe events) and only appears in prod.
- **Companies House upstream-error masking** — a 5xx silently swallowed becomes a "looks like the registry rejected your company" UX bug. The error-mapping path is the part of the registry client most likely to bit-rot.
- **Public `flags` projection drift** — a future PR that adds a new milestone type to the `has()` lookup could accidentally expose internal-only milestones to the public endpoint. Tests pin the exact public flag set.
- **RTW share-code regex erosion** — gov.uk format changes are rare but happen; the test pins the contract so a refactor doesn't accept hyphen-separated forms.

## What this brief unlocks

- The spec.md author can map every VER-NNN to ≥1 TEST-VER-NNN test ID without re-deriving the audit.
- The implementer knows exactly which test files are `.skip`'ed waiting for unblocking (RTW, TrustLadder) and which need fresh authoring.
- The follow-up flagger has a list of code-vs-spec discrepancies (assignment claim 400 vs spec 409, Companies House mismatch 400 vs spec 400 + inactive 403) to file in `followups.md` on first run.
