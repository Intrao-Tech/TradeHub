# Coverage Matrix — Jobs & Applications tests

TEST-JOBS-232: every `JOBS-NNN` requirement and every `E2E-N` acceptance
scenario from `tasks/done/jobs-applications/spec.md` maps to ≥ 1
`TEST-JOBS-NNN` test in this feature. Each test description cites the
`JOBS-NNN` it protects so a failure points the developer at the broken
clause.

Legend: **U** = backend unit (`backend/src/**/*.spec.ts`), **E2E-B** =
backend e2e (`backend/test/**/*.e2e-spec.ts`), **F** = frontend unit
(`web/src/**/*.test.tsx`), **PW** = Playwright (`web/e2e/**`).

## JOBS-NNN → TEST-JOBS-NNN

| JOBS  | Clause                                  | Test(s)                              | Layer    |
| ----- | --------------------------------------- | ------------------------------------ | -------- |
| 001   | Replace JSON dumps + detail dialog      | TEST-JOBS-100 / 170 / 208            | F + PW   |
| 002   | `/jobs` lists OPEN by default           | TEST-JOBS-013 / 087 / 101            | U + E2E-B + F (followup closed 2026-05-05) |
| 003   | Filter bar (search / postcode / specs)  | TEST-JOBS-013 / 073 / 101            | U + E2E-B + F (followup closed 2026-05-05) |
| 004   | Job card shape                          | TEST-JOBS-100 (page-level)           | F        |
| 005   | Pagination 20 per page                  | TEST-JOBS-013 / 073 / 101            | U + E2E-B + F (followup closed 2026-05-05) |
| 006   | Empty state                             | TEST-JOBS-102                        | F        |
| 007   | Sort created_at desc                    | TEST-JOBS-013                        | U        |
| 008   | `/jobs/:id` real route                  | TEST-JOBS-110 / 087                  | F + E2E-B |
| 009   | Detail header (employer chip + badges)  | TEST-JOBS-110                        | F        |
| 010   | Detail body (description, specs, tags)  | TEST-JOBS-110                        | F        |
| 011   | Role-aware CTA bar (six branches)       | TEST-JOBS-111 / 112                  | F        |
| 012   | Apply sheet                             | TEST-JOBS-020 / 080                  | U + E2E-B |
| 013   | Apply error mapping                     | TEST-JOBS-020 / 085                  | U + E2E-B |
| 014   | Post-a-job sheet                        | TEST-JOBS-010 / 070 / 104            | U + E2E-B + F |
| 015   | POST /job-posts wires onSuccess         | TEST-JOBS-070                        | E2E-B    |
| 016   | Form keyboard / a11y                    | TEST-JOBS-140 (chip primitive)       | F        |
| 017   | Form gated by `isEmployer && ACTIVE`    | TEST-JOBS-072 / 104                  | E2E-B + F |
| 018   | `/my-jobs/:id/edit` route               | TEST-JOBS-130 / 070                  | F + E2E-B |
| 019   | Soft-freeze policy                      | TEST-JOBS-131 / 011                  | F + U    |
| 020   | Edit-page ownership gate                | TEST-JOBS-130 / 011 / 071            | F + U + E2E-B |
| 021   | `<ChipMultiSelect>` keyboard contract   | TEST-JOBS-140                        | F        |
| 022   | Specialisation / tag pickers            | TEST-JOBS-088 / 030 / 031 / 180 / 181 | E2E-B + U + F |
| 023   | Soft cap at 10                          | TEST-JOBS-140                        | F        |
| 024   | Submission converts to `number[]`       | TEST-JOBS-010                        | U        |
| 025   | Tag CRUD admin out of scope             | TEST-JOBS-030 / 031 / 088            | U + E2E-B |
| 026   | `/my-jobs` route + isEmployer gate      | TEST-JOBS-150 / 014                  | F + U    |
| 027   | Page header + "Post a job" CTA          | TEST-JOBS-153                        | F        |
| 028   | Status tabs                             | TEST-JOBS-151                        | F        |
| 029   | Each row + applications_count           | TEST-JOBS-014 / 086                  | U + E2E-B |
| 030   | Close / Reopen / Cancel actions         | TEST-JOBS-011 / 070                  | U + E2E-B |
| 031   | Delete (zero-applications gate)         | TEST-JOBS-012 / 070                  | U + E2E-B (followup closed 2026-05-05 — backend now blocks with 409 HAS_APPLICATIONS) |
| 032   | Empty state                             | TEST-JOBS-153                        | F        |
| 033   | `/my-jobs/:id/applicants` route + gate  | TEST-JOBS-160 / 025                  | F + U    |
| 034   | Page header                             | TEST-JOBS-161                        | F        |
| 035   | Status tabs default Pending             | TEST-JOBS-161                        | F        |
| 036   | Applicant card                          | TEST-JOBS-161 (counts surface)       | F        |
| 037   | Action buttons per status               | TEST-JOBS-022 / 024 / 082            | U + E2E-B |
| 038   | Optimistic UI                           | TEST-JOBS-202 (Playwright fixme)     | PW       |
| 039   | Invite a worker                         | TEST-JOBS-021 / 084                  | U + E2E-B |
| 040   | Aggregate `application_summary`         | TEST-JOBS-014 / 086                  | U + E2E-B |
| 041   | `/my-applications` route + isWorker     | TEST-JOBS-171 / 025                  | F + U    |
| 042   | Status tabs default All                 | TEST-JOBS-172                        | F        |
| 043   | Each row                                | TEST-JOBS-173                        | F        |
| 044   | Withdraw                                | TEST-JOBS-173 / 022 / 082            | F + U + E2E-B |
| 045   | Empty state                             | TEST-JOBS-175                        | F        |
| 046   | Invitations section                     | TEST-JOBS-174                        | F        |
| 047   | Delete legacy MyApplicationsPage halves | (covered indirectly — legacy gone)   | -        |
| 048   | Zero `<pre>{JSON.stringify(...)}</pre>` | TEST-JOBS-100 / 170 / 208            | F + PW   |
| 049   | Zero comma-separated-ID inputs          | TEST-JOBS-140 / 208                  | F + PW   |
| 050   | All actions surface via parseApiError   | TEST-JOBS-114 (error mapping cases)  | F        |
| 051   | `lint:tokens` clean                     | TEST-JOBS-222                        | tooling  |
| 052   | 375 px mobile baseline                  | TEST-JOBS-209 (Playwright fixme)     | PW       |
| 053   | All fetches use `api<T>()`              | (assertion implicit in MSW handlers) | F        |
| 054   | All consumers use `useAccountMe`        | (assertion implicit in unit tests)   | F        |
| 055   | OpenAPI documents all endpoints         | TEST-JOBS-208                        | PW       |
| 056   | Light + dark mode                       | manual QA per spec                   | -        |

## E2E-N → TEST-JOBS-NNN

| E2E | Scenario                              | Test                  | Status        |
| --- | ------------------------------------- | --------------------- | ------------- |
| E2E-1 | Worker first apply                  | TEST-JOBS-200         | fixme (registerEmployer helper) |
| E2E-2 | Worker withdraws                    | TEST-JOBS-201         | fixme         |
| E2E-3 | Employer post → review → accept     | TEST-JOBS-202         | fixme         |
| E2E-4 | Employer edit (soft freeze)         | TEST-JOBS-203         | fixme         |
| E2E-5 | Employer delete (zero applications) | TEST-JOBS-204         | fixme         |
| E2E-6 | Public visitor funnel               | TEST-JOBS-205         | live          |
| E2E-7 | Pending-verification gates          | TEST-JOBS-206         | fixme         |
| E2E-8 | Role gating                         | TEST-JOBS-207         | live (worker side) |
| E2E-9 | Guardrails                          | TEST-JOBS-208         | live          |

The `fixme` Playwright scenarios are gated on
`web/e2e/util.ts` gaining a `registerEmployer()` helper equivalent to
the existing `registerWorker()`. Removing each `.fixme` is the unblocker;
the harness already supports the rest of the flow (Testcontainer
Postgres, mailbox, JWT signing).

## BE-JOBS-N → TEST-JOBS-NNN

| BE-JOBS | Prerequisite                       | Test                          | Status   |
| ------- | ---------------------------------- | ----------------------------- | -------- |
| BE-JOBS-1 | `applications_count` aggregate   | TEST-JOBS-014 / 086           | shipped (already in `_count.applications`) |
| BE-JOBS-2 | `409 ALREADY_APPLIED`            | TEST-JOBS-020 / 081           | shipped  |
| BE-JOBS-3 | `400 JOB_CLOSED`                 | TEST-JOBS-020 / 085           | shipped  |
| BE-JOBS-4 | `PAUSED` status                  | (deferred per JOBS-OQ-2)      | -        |
| BE-JOBS-5 | Worker-search endpoint           | (deferred per JOBS-OQ-9)      | -        |

## Drift / followups filed and closed

Items the suite surfaced and the follow-up slice closed on
2026-05-05. Full detail in `tasks/done/jobs-applications/followups.md`.

- ✅ [JOBS-002] `findAll()` now defaults to `status=OPEN`; `?status=ALL`
  is the explicit no-filter sentinel.
- ✅ [JOBS-003] Public board now mounts `<ChipMultiSelect>` sourced from
  `useSpecialisations()`, URL-bound to `?specialisation_id=`.
- ✅ [JOBS-005] `/jobs` paginates at 20 per page with prev/next URL-bound
  controls and a "Page X of Y" indicator.
- ✅ [JOBS-021] `<ChipMultiSelect>` moved to
  `web/src/components/ui/chip-multi-select.tsx`; imports retargeted in
  `JobPostForm.tsx`, `JobBoardPage.tsx`, and the colocated test.
- ✅ [JOBS-031] Backend now blocks `DELETE /job-posts/:id` with
  `409 HAS_APPLICATIONS` when the post has any applications. The
  frontend gate is no longer the only safety net.
- ✅ [JOBS-OQ-3] Same-status transition now emits
  `400 { code: 'STATUS_UNCHANGED' }` so the SPA can map it to a friendly
  toast.
