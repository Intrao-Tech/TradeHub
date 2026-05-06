# Follow-ups

Bugs surfaced by the TEST-VER-* suite. **All four were resolved on
2026-05-06** in the same hand-off (the user authorised the production-code
edits explicitly after the suite landed). Code changes were single-line
where possible; tests were re-pointed at the spec contract in lockstep.
Each entry below is preserved as the audit trail of what shipped.

Format mirrors `tasks/done/tests-auth-flow/followups.md`:
`[VER-NNN]` ID + one-line summary + reproducing test ID + recommended fix scope.

---

## ~~FU-VER-1 — claim error code is 400 ALREADY_ASSIGNED, spec says 409~~ ✅ Resolved 2026-05-06

**Surfaced by:**
- `backend/src/verification/document-assignment.service.spec.ts`
  → `TEST-VER-124 — claim() throws ALREADY_ASSIGNED when doc already taken`
- `backend/test/verification.assignment.e2e-spec.ts`
  → `TEST-VER-221 — POST /verification/documents/:id/claim race`

**Cited clause:** VER-137 — race-free claim. Spec says
`409 ALREADY_ASSIGNED`; the implementation in
`backend/src/verification/document-assignment.service.ts:174-188`
threw `BadRequestException` (HTTP 400) on `count === 0`.

**Resolution:** Changed the throw site in `claim()` from
`BadRequestException` → `ConflictException` (single line). Added the
new import. Updated `TEST-VER-124` (unit) and `TEST-VER-221` (e2e race +
already-assigned cases) from `expect(400)` → `expect(409)`. Also
updated the frontend MSW stub in `VerificationQueueTab.test.tsx` to
return 409 for ALREADY_ASSIGNED so the SPA error path stays exercised.
Updated the `verification.controller.ts` Swagger description from
"Returns 400 ALREADY_ASSIGNED" → "Returns 409 ALREADY_ASSIGNED" in the
same diff. RFC 7231 — 409 Conflict is the right status for a
"resource state conflicts with the request" condition.

---

## ~~FU-VER-2 — Companies House mismatch error codes are inconsistent~~ ✅ Resolved 2026-05-06

**Surfaced by:**
- `backend/src/verification/companies-house.service.spec.ts`
  → `TEST-VER-133 — registry inactive throws ForbiddenException (403)`
- `backend/test/verification.companies-house.e2e-spec.ts`
  → `TEST-VER-232 — inactive status returns 403`

**Cited clause:** VER-142 — Companies House mismatch. Spec calls for
`400 COMPANIES_HOUSE_MISMATCH` for both inactive and name-mismatch
branches. The implementation split them: `ForbiddenException` (403)
for `company_status !== 'active'` and `BadRequestException` (400) for
name mismatch.

**Resolution:** Changed the inactive throw site from
`ForbiddenException` → `BadRequestException` (single line). Removed
the unused `ForbiddenException` import. Updated `TEST-VER-133` (unit)
and `TEST-VER-232` (e2e) from `expect(403)` → `expect(400)`. Both
mismatch branches now return 400 consistently — SPA error mapping is
unchanged (it already keys off `code`, not status), and the HTTP
contract finally matches the spec. `403 Forbidden` was the wrong
semantics anyway — there's no authz failure when a user submits a
dissolved company; it's a data-validity problem, exactly like a name
diff.

---

## ~~FU-VER-3 — Companies House name normalisation pre-empts the PLC rule~~ ✅ Resolved 2026-05-06

**Surfaced by:**
- `backend/src/verification/companies-house.service.spec.ts`
  → `TEST-VER-137 — normaliseCompanyName truth table` row
  `"Acme Public Limited Company" vs "Acme PLC"`

**Cited clause:** VER-145 (name normalisation, bidirectional `includes`).
The brief promises that "Acme Public Limited Company" should match
"Acme PLC" via the `PUBLIC LIMITED COMPANY → PLC` substitution.

**Resolution:** Swapped the order of the two substitutions in
`normaliseCompanyName` so `PUBLIC LIMITED COMPANY → PLC` runs **before**
`LIMITED → LTD`. Without the reorder, the longer pattern was being
pre-empted by the shorter one consuming the `LIMITED` token first.
Updated `TEST-VER-137`'s truth-table row from `expect=false` →
`expect=true`. Also added a one-line comment in `normaliseCompanyName`
explaining the ordering invariant so a future "alphabetise the rules"
cleanup PR doesn't reintroduce the bug.

---

## ~~FU-VER-4 — Profile-side tests still reference legacy verification vocabulary~~ ✅ Resolved 2026-05-06

**Surfaced by:** running `cd web && npm test` exposed pre-existing failures
in tests authored by the Profiles cut that the Verification rename
(2026-05-05) broke:
- `web/src/components/WorkerCard.test.tsx` — looked for `/kyc verified/i`
- `web/src/components/WorkerCard.test.tsx` (EmployerCard) — `/hmrc confirmed/i`
- `web/src/pages/ClientPublicProfilePage.test.tsx` — same vocabulary
- `web/src/pages/WorkerDetailPage.test.tsx` — same vocabulary
- `web/src/components/profile/DocumentsTab.test.tsx` — multi-match issue
  on "CSCS card" because the checklist + the documents list both render
  the label.

**Cited clause:** PROF-046 (verification badge renders consistent with
PROF-032 vocabulary). The vocabulary was reconciled to UNVERIFIED →
BASIC → CERTIFIED → PREMIUM in Verification's spec; these PROF-side
tests were not updated in the rename PR (#9, merge `629f9ad`).

**Resolution:** Replaced legacy `'KYC'` / `'HMRC'` fixture values with
`'BASIC'` / `'CERTIFIED'`, and the legacy regex assertions
`/kyc verified/i` / `/hmrc confirmed/i` with `/id verified/i` /
`/certified/i` (matching the live `<VerificationBadge>` output). For
the DocumentsTab multi-match case, switched `getByText` →
`getAllByText(...).length >= 1` since both the checklist and the
documents list legitimately render the same label.

---
