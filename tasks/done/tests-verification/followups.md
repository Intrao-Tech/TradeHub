# Follow-ups

Bugs surfaced by the TEST-VER-* suite that this feature must NOT fix
(per the working principle: tests do not change Verification production code).
Each entry cites the failing test and the VER-NNN clause it broke against.

Format mirrors `tasks/done/tests-auth-flow/followups.md`:
`[VER-NNN]` ID + one-line summary + reproducing test ID + recommended fix scope.

---

## FU-VER-1 — claim error code is 400 ALREADY_ASSIGNED, spec says 409

**Surfaced by:**
- `backend/src/verification/document-assignment.service.spec.ts`
  → `TEST-VER-124 — claim() throws ALREADY_ASSIGNED when doc already taken`
- `backend/test/verification.assignment.e2e-spec.ts`
  → `TEST-VER-221 — POST /verification/documents/:id/claim race`

**Cited clause:** VER-137 — race-free claim. Spec says
`409 ALREADY_ASSIGNED`; the implementation in
`backend/src/verification/document-assignment.service.ts:174-188`
throws `BadRequestException` (HTTP 400) on `count === 0`.

**What the test sees:** A second `claim()` call against an already-assigned
document returns HTTP 400 with `{ code: 'ALREADY_ASSIGNED' }`. The spec
contract is HTTP 409 (resource-conflict semantics). The current behaviour
is locked into the test (`expect(...).toBe(400)`) so the suite ships
green; this followup tracks the bring-into-line work.

**Recommended fix:** Change the throw site from `BadRequestException` to
`ConflictException` in `claim()`. Update both unit and e2e specs from
`expect(400)` → `expect(409)` in the same PR. Single-call-site change,
no downstream consumers parse the status code beyond the JSON body.

**Status:** Open as of 2026-05-06. Not fixed by tests-verification.

---

## FU-VER-2 — Companies House mismatch error codes are inconsistent

**Surfaced by:**
- `backend/src/verification/companies-house.service.spec.ts`
  → `TEST-VER-133 — registry inactive throws ForbiddenException (403)`
  → `TEST-VER-134 — name mismatch throws BadRequestException (400)`
- `backend/test/verification.companies-house.e2e-spec.ts`
  → `TEST-VER-232 — inactive status returns 403`
  → `TEST-VER-233 — name mismatch returns 400`

**Cited clause:** VER-142 — Companies House mismatch. Spec calls for
`400 COMPANIES_HOUSE_MISMATCH` for both inactive and name-mismatch
branches. The implementation in
`backend/src/verification/companies-house.service.ts:91-135`
splits them: `ForbiddenException` (403) for `company_status !== 'active'`
and `BadRequestException` (400) for name mismatch.

**What the test sees:** Calling the endpoint with a dissolved company
returns HTTP 403; calling with a name diff returns HTTP 400. Both carry
`{ code: 'COMPANIES_HOUSE_MISMATCH' }` so SPA error mapping isn't broken,
but the HTTP status disagrees with the spec for half the cases. The
current behaviour is locked in the tests; this followup tracks the
unification.

**Recommended fix:** Pick one shape — either both 400 or both 409 — and
update the spec or the code accordingly. Recommended: change the inactive
branch from `ForbiddenException` to `BadRequestException` so the two
error paths agree at 400, matching the spec verbatim. Then update the
test expectations from `expect(403)` → `expect(400)` in the same PR.

**Status:** Open as of 2026-05-06. Not fixed by tests-verification.

---

## FU-VER-3 — Companies House name normalisation pre-empts the PLC rule

**Surfaced by:**
- `backend/src/verification/companies-house.service.spec.ts`
  → `TEST-VER-137 — normaliseCompanyName truth table` row
  `"Acme Public Limited Company" vs "Acme PLC"`

**Cited clause:** VER-145 (name normalisation, bidirectional `includes`).
The brief promises that "Acme Public Limited Company" should match
"Acme PLC" via the `PUBLIC LIMITED COMPANY → PLC` substitution.

**What the test sees:** `normaliseCompanyName` in
`backend/src/verification/companies-house.service.ts:236-244`
applies `\bLIMITED\b → LTD` **before**
`\bPUBLIC LIMITED COMPANY\b → PLC`. The first replacement consumes the
`LIMITED` token, leaving the second pattern unable to match. So
`Acme Public Limited Company → ACME PUBLIC LTD COMPANY` while
`Acme PLC → ACME PLC`, and the bidirectional `includes` returns false.
The user gets a mismatch error for what is, in reality, the same
company under two equivalent legal-entity spellings.

**Recommended fix:** Reorder the substitutions so the
`PUBLIC LIMITED COMPANY` rule runs first, OR collapse both forms to a
common token (`PLC`) before the `LIMITED` rule fires. Single-call-site
change in `normaliseCompanyName`. Add the row back to the
TEST-VER-137 truth table with `expect=true` once shipped.

**Status:** Open as of 2026-05-06. Not fixed by tests-verification.

---

## FU-VER-4 — Profile-side tests still reference legacy verification vocabulary

**Surfaced by:** running `cd web && npm test` exposes pre-existing failures
in tests authored by the Profiles cut that the Verification rename
(2026-05-05) broke:
- `web/src/components/WorkerCard.test.tsx` — looks for `/kyc verified/i`
- `web/src/components/WorkerCard.test.tsx` (EmployerCard) — `/hmrc confirmed/i`
- `web/src/pages/ClientPublicProfilePage.test.tsx` — same vocabulary
- `web/src/pages/WorkerDetailPage.test.tsx` — same vocabulary
- `web/src/components/profile/DocumentsTab.test.tsx` — status mapping drift

**Cited clause:** PROF-046 (verification badge renders consistent with
PROF-032 vocabulary). The vocabulary was reconciled to UNVERIFIED →
BASIC → CERTIFIED → PREMIUM in Verification's spec; these PROF-side
tests were not updated in the rename PR (#9, merge `629f9ad`).

**What the test sees:** badge text that used to be "KYC verified" /
"HMRC confirmed" now renders as "Basic — ID verified" / "Certified" /
etc. (per `verificationFromLevel` + `<VerificationBadge>`).

**Recommended fix:** Update the regex in each broken test from the
legacy phrase to the current ladder vocabulary. Single-file edits, no
production-code change required. Out of scope for tests-verification —
this work belongs in a `tests-profiles` followup PR or a one-off
"sync Profiles tests with the new vocabulary" cleanup.

**Status:** Open as of 2026-05-06. Not fixed by tests-verification.
The `tests-verification` suite itself is green (`MilestonesStrip`,
`VerificationQueueTab`, all backend specs). The failures here pre-date
this feature.

---
