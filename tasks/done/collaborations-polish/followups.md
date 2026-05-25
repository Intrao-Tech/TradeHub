# Follow-ups — Collaborations Polish

Production drifts and missing-protections surfaced by the
`tests-collaborations-polish/` suite (TEST-COLLAB-230). Format mirrors
`tasks/done/jobs-applications/followups.md`: `[COLLAB-NNN]` ID +
one-line summary + reproducing test ID + landed fix.

---

## ✅ [COLLAB-073-001] `PATCH /collaborations/:id/status` and `POST /collaborations/:id/flag` were missing `AccountStateGuard` / `RequiresVerifiedEmail`

**Closed 2026-05-06.**

**Original**: `backend/src/collaboration/collaboration.controller.ts:109-126`
bound only `JwtAuthGuard` to `@Patch(':id/status')`; the same gap existed
on `@Post(':id/flag')` (line 128). A worker / employer with an unverified
email could drive lifecycle transitions and write flags, in violation of
the parent spec's "Sealed Auth dependencies" clause
(`tasks/done/collaborations-polish/spec.md` §1) which assumes
`AccountStateGuard` covers every state-mutating endpoint on the surface.

**Fix**: both endpoints now bind
`@UseGuards(JwtAuthGuard, AccountStateGuard)` plus
`@RequiresVerifiedEmail()`, matching the pattern on `@Post()` (line 38).
The previously `.skip`'d assertion in `backend/test/collaboration.e2e-spec.ts`
("PENDING_EMAIL_VERIFICATION worker on PATCH → 403 EMAIL_NOT_VERIFIED")
is now live, and a sibling assertion was added covering the flag
endpoint. The collaboration e2e suite now runs 23 / 23 with no skips.

---

## ✅ [COLLAB-203-001] / [COLLAB-200-001] / [COLLAB-202-001] / [COLLAB-204-001] / [COLLAB-206-001] Five Playwright `test.fixme` specs unblocked

**Closed 2026-05-07.**

**Original**: `web/e2e/collaborations.scenarios.spec.ts`
(TEST-COLLAB-200 lifecycle, TEST-COLLAB-202 flag dialog, TEST-COLLAB-206
375 px viewport), `web/e2e/collaborations.guardrails.spec.ts:77`
(TEST-COLLAB-203 authed half), and
`web/e2e/collaborations.role-gating.spec.ts:32` (TEST-COLLAB-204
non-party). All blocked on a missing `registerEmployer()` helper +
test-only collab-seed seam.

**Fix**: helpers shipped via the `tests-chat` pass — `registerEmployer()`
in `web/e2e/util.ts` and `POST /test/seed/collab-conversation` in
`backend/src/test-only/test-seed.controller.ts` (gated by `NODE_ENV ===
'test'`, mirrors the existing `POST /test/seed/admin`). Five COLLAB
specs are now active and green:

- TEST-COLLAB-200 — worker confirms → starts → completes a PENDING
  collab; status pill flips Confirmed → In progress → Completed; no
  transition buttons remain in the terminal state.
- TEST-COLLAB-202 — flag dialog: OTHER + < 10 chars detail keeps Submit
  disabled; valid OTHER persists `flag_reason` verbatim as
  `OTHER: <detail>`.
- TEST-COLLAB-203 (authed half) — `/collaborations/:id` has zero `<pre>`
  JSON dumps, zero escrow mutation buttons, and zero `<textarea>`.
- TEST-COLLAB-204 (non-party) — logged-in worker A who is NOT a party
  sees the "Collaboration not found" EmptyState + back-link.
- TEST-COLLAB-206 — `/collaborations` and `/collaborations/:id` have no
  horizontal scroll at 375 px viewport.

TEST-COLLAB-201 (employer creates manual collab via the New collaboration
sheet) and TEST-COLLAB-205 (staff host) stay `test.fixme` — they need
follow-on UI infrastructure (worker-id lookup component, staff host
route registration) that is independent of the auth/seed seam. TEST-
COLLAB-207 (Jobs → Collaborations seam) is covered indirectly by
TEST-JOBS-202 in `tests-jobs-applications`.
