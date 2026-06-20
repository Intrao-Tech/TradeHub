# Tests — Project Handoff

Guards the `HANDOFF-NNN` acceptance criteria in
`../spec.md`. IDs: `TEST-HANDOFF-NNN`.

## Backend unit — `backend/src/handoff/handoff.service.spec.ts`

Deep-mocked Prisma, no DB. Covers the guard/branch logic of `HandoffService`.

| ID | Guards | Asserts |
|----|--------|---------|
| TEST-HANDOFF-001 | HANDOFF-010 | createHandoff refuses a non-OPEN job |
| TEST-HANDOFF-002 | HANDOFF-010 | createHandoff rejects self-target |
| TEST-HANDOFF-003 | HANDOFF-010 | createHandoff rejects unknown target worker |
| TEST-HANDOFF-004 | HANDOFF-010 | open-link create returns link, commission defaults on |
| TEST-HANDOFF-005 | HANDOFF-013 | claim rejects the hander taking their own |
| TEST-HANDOFF-006 | HANDOFF-013 | claim rejects a non-target on a targeted handoff |
| TEST-HANDOFF-007 | HANDOFF-013 | claim rejects an expired handoff |
| TEST-HANDOFF-008 | HANDOFF-013 | claim sets CLAIMED + claimed_by |
| TEST-HANDOFF-009 | HANDOFF-015 | revoke owner-only + refuses APPLIED |
| TEST-HANDOFF-010 | HANDOFF-020 | consumeForApplication scoping (actor/job/open/not-expired) |
| TEST-HANDOFF-011 | HANDOFF-012 | getByToken unknown token → 404 |

## Backend e2e — `backend/test/cr.handoff.e2e-spec.ts`

Real Postgres (Testcontainer). Full route + DB effects.

| ID | Guards | Asserts |
|----|--------|---------|
| TEST-HANDOFF-020 | HANDOFF-010 | worker creates handoff for open job → token + PENDING row |
| TEST-HANDOFF-021 | HANDOFF-010 | cannot hand off a non-OPEN job (400) |
| TEST-HANDOFF-022 | HANDOFF-012 | landing read is public, shows hander + job + employer |
| TEST-HANDOFF-023 | HANDOFF-013 | targeted handoff rejects a stranger's claim (403) |
| TEST-HANDOFF-024 | HANDOFF-020/021/032 | claim → apply stamps handoff_id + W2W commission; employer sees provenance |
| TEST-HANDOFF-025 | HANDOFF-021 | commission waived → handoff_id set, project_referrer null |
| TEST-HANDOFF-026 | HANDOFF-020 | expired handoff is not consumed at apply |
| TEST-HANDOFF-027 | HANDOFF-015 | revoke is owner-only (403 stranger, 201 owner) |

## Frontend — `web/src/pages/HandoffLandingPage.test.tsx`

Vitest + RTL + MSW.

| ID | Guards | Asserts |
|----|--------|---------|
| TEST-HANDOFF-040 | HANDOFF-031 | shows hander + job + employer |
| TEST-HANDOFF-041 | HANDOFF-031 | logged out → log in / sign up, no Take button |
| TEST-HANDOFF-042 | HANDOFF-031 | eligible worker → "Take this job" + "Pass" |
| TEST-HANDOFF-043 | HANDOFF-031 | consumed handoff → terminal message, no Take button |

## Known gaps / follow-ups

- No FE test for `HandoffButton` create flow (covered indirectly by e2e create).
- No seed data for handoffs yet (see `../status.md` checklist).
- Logged-out → register → land-back-on-token path relies on the existing
  `?next=` redirect (covered by auth tests, not re-tested here).
