# Coverage Matrix — Collaborations Polish tests

TEST-COLLAB-232: every `COLLAB-NNN` requirement and every relevant Edge
Case from `tasks/done/collaborations-polish/spec.md` maps to ≥ 1
`TEST-COLLAB-NNN` test in this feature. Each test description cites the
`COLLAB-NNN` it protects so a failure points the developer at the broken
clause.

Legend: **U** = backend unit (`backend/src/**/*.spec.ts`), **E2E-B** =
backend e2e (`backend/test/**/*.e2e-spec.ts`), **F** = frontend unit
(`web/src/**/*.test.tsx`), **PW** = Playwright (`web/e2e/**`).

## COLLAB-NNN → TEST-COLLAB-NNN

| COLLAB | Clause                                        | Test(s)                              | Layer        |
| ------ | --------------------------------------------- | ------------------------------------ | ------------ |
| 001    | Delete `<pre>{JSON.stringify(...)}</pre>`     | TEST-COLLAB-100 / 119 / 203          | F + PW       |
| 002    | `/collaborations/:id` route registered        | TEST-COLLAB-077 / 110 / 204          | E2E-B + F + PW |
| 003    | `/escrow/:id` placeholder route               | TEST-COLLAB-150 / 204                | F + PW       |
| 004    | Private nav label "Work" stays                | (no-op; locked by negative absence)  | -            |
| 010    | List grid + counterparty chip + per-row CTA   | TEST-COLLAB-103                      | F            |
| 011    | Status tabs (7) + counts                      | TEST-COLLAB-014 / 076 / 101          | U + E2E-B + F |
| 012    | Role tab visibility                           | TEST-COLLAB-102                      | F            |
| 013    | "New collaboration" button                    | TEST-COLLAB-105                      | F            |
| 014    | Empty state                                   | TEST-COLLAB-104                      | F            |
| 015    | Optimistic refresh + toast                    | TEST-COLLAB-112 (refetch) / 132 / 143 | F           |
| 020    | Detail header                                 | TEST-COLLAB-077 / 110                | E2E-B + F    |
| 021    | Lifecycle action bar (PENDING / CONFIRMED / IN_PROGRESS / DISPUTED) | TEST-COLLAB-012 / 070 / 071 / 072 / 073 / 111 / 112 | U + E2E-B + F |
| 022    | Escrow summary card read-only                 | TEST-COLLAB-113 / 203                | F + PW       |
| 023    | Chat summary card                             | TEST-COLLAB-114 / 203                | F + PW       |
| 024    | Reviews summary                               | TEST-COLLAB-115                      | F            |
| 025    | Flag history strip                            | TEST-COLLAB-116                      | F            |
| 026    | Audit timeline                                | TEST-COLLAB-117                      | F            |
| 030    | NewCollaborationSheet role-aware fields       | TEST-COLLAB-010 / 015 / 130          | U + F        |
| 031    | Validation (id / amount / postcode)           | TEST-COLLAB-131                      | F            |
| 032    | Submit + happy path + error mapping           | TEST-COLLAB-132 / 133                | F            |
| 033    | "Browse profiles" link inside sheet           | TEST-COLLAB-130 (helper rendered)    | F            |
| 040    | Flag dialog 8-category enum + reason format   | TEST-COLLAB-013 / 075 / 140 / 142 / 202 | U + E2E-B + F + PW |
| 041    | OTHER requires ≥ 10 chars                     | TEST-COLLAB-141                      | F            |
| 042    | Submit success / error                        | TEST-COLLAB-013 / 075 / 143 / 144    | U + E2E-B + F |
| 043    | Dialog usable from list rows + detail         | TEST-COLLAB-143 (component shared)   | F            |
| 050    | Every fetch via `parseApiError()`             | TEST-COLLAB-112 / 118 / 133 / 144    | F            |
| 051    | Staff: disabled lifecycle + working flag      | TEST-COLLAB-011 / 013 / 075 / 077 / 111 / 205 | U + E2E-B + F + PW (fixme) |
| 052    | Anonymous → /login?next=                      | TEST-COLLAB-204                      | PW           |
| 060    | `lint:tokens` clean                           | TEST-COLLAB-222                      | tooling      |
| 061    | Vite build clean + light/dark + 375 px        | TEST-COLLAB-206 (fixme)              | PW           |
| 062    | Reuse shadcn primitives + sealed components   | (assertion implicit in unit tests)   | F            |

## E2E-N (parent acceptance) → TEST-COLLAB-NNN

| E2E       | Scenario                                    | Test                  | Status       |
| --------- | ------------------------------------------- | --------------------- | ------------ |
| Worker confirm/start/complete | `PENDING` responder lifecycle | TEST-COLLAB-070 / 200 | E2E-B live; PW fixme |
| Employer manual create        | New collab sheet → detail    | TEST-COLLAB-201       | PW fixme     |
| Structured flag               | 8-category dialog + OTHER    | TEST-COLLAB-202       | PW fixme     |
| Guardrails                    | No JSON / no Stripe button / no textarea | TEST-COLLAB-203 | PW (worker side live; full surface fixme) |
| Role gating                   | Anonymous redirect, non-party 403 | TEST-COLLAB-204 | PW (anonymous live; non-party fixme) |
| Staff                         | Disabled lifecycle + working flag | TEST-COLLAB-205 | PW fixme  |
| Mobile 375 px                 | No horizontal scroll, ≥ 48 px CTA | TEST-COLLAB-206 | PW fixme |
| Cross-feature Jobs → Collab   | Accept → convert lands at detail | TEST-COLLAB-078 / 207 | E2E-B live; PW fixme |

The `fixme` Playwright scenarios are gated on `web/e2e/util.ts` gaining
a `registerEmployer()` helper equivalent to the existing
`registerWorker()`, plus a `seedCollaboration` test-only API helper for
the "non-party visitor" branch. The unblock pattern matches
`tasks/done/jobs-applications/tests-jobs-applications/coverage-matrix.md`
(TEST-JOBS-200..204): remove the `.fixme` and fill the body once the
helper lands. Bodies are pre-described inline in
`web/e2e/collaborations.scenarios.spec.ts` so the unblock PR has no
design work to do.

## Edge Cases (parent spec) → TEST-COLLAB-NNN

| Parent Edge Case                                         | Test                    | Layer        |
| -------------------------------------------------------- | ----------------------- | ------------ |
| User without `client_profile`                            | TEST-COLLAB-011 / 015   | U            |
| Both party chips identical                               | TEST-COLLAB-010 / 070 / 132 | U + E2E-B + F |
| Status conflict (two tabs racing)                        | TEST-COLLAB-012 / 112   | U + F        |
| Escrow exists but collab is PENDING / REJECTED           | TEST-COLLAB-113         | F (renders without crash) |
| `flagged` toggles but `flag_reason` is null              | TEST-COLLAB-116         | F            |
| Reviews payload includes `is_published: false`           | TEST-COLLAB-115         | F            |
| Staff impersonation / view of non-party                  | TEST-COLLAB-011 / 077 / 111 | U + E2E-B + F |
| `GET /collaborations/:id` returns 404                    | TEST-COLLAB-077 / 118   | E2E-B + F    |
| Network failure on first list load                       | TEST-COLLAB-100 (alert+retry) | F      |
| `agreed_amount` over-precise (e.g. 100.123)              | TEST-COLLAB-131         | F            |
| `site_postcode` lower-case / spaces                      | TEST-COLLAB-131 (norm)  | F            |

## Drift / followups filed and closed

Items the suite surfaced and the follow-up slice closed on 2026-05-06.
Full detail in `tasks/done/collaborations-polish/followups.md`.

- ✅ [COLLAB-073-001] Both `PATCH /collaborations/:id/status` and
  `POST /collaborations/:id/flag` now bind `AccountStateGuard` +
  `RequiresVerifiedEmail`. The previously `.skip`'d TEST-COLLAB-073
  branch is live, and a sibling assertion (TEST-COLLAB-075 /
  COLLAB-001) covers the flag endpoint. Backend e2e for collaboration
  is 23 / 23 with no skips.

## Tooling extensions in this feature

- Backend factories (`backend/test/util/factories.ts`):
  `seedCollaboration`, `seedEscrowTransaction`.
- Web factories (`web/src/test/factories.ts`): `mockCollaboration`,
  `mockEscrowTransaction`, plus `mockEscrow{Created,DepositPending,
  Held,Released,Refunded,Disputed}` per-status helpers.
- MSW v2 handlers (`web/src/test/handlers/`): `collaborations.ts`,
  `escrow.ts` (read-only).
- Setup polyfills (`web/src/test/setup.ts`): jsdom shims for
  `Element.prototype.{hasPointerCapture,setPointerCapture,
  releasePointerCapture,scrollIntoView}` so RTL tests can drive Radix
  Select / Dialog (TEST-COLLAB-140 was the first test in the repo to
  exercise this path).
