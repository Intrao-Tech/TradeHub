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
