# Coverage Matrix — Reviews tests

TEST-REVIEW-232: every `REVIEW-NNN` requirement and every relevant Edge Case from `tasks/product/reviews/spec.md` maps to ≥ 1 `TEST-REVIEW-NNN` test in this feature. Each test description cites the `REVIEW-NNN` it protects so a failure points the developer at the broken clause.

Legend: **U** = backend unit (`backend/src/**/*.spec.ts`), **E2E-B** = backend e2e (`backend/test/**/*.e2e-spec.ts`), **F** = frontend unit (`web/src/**/*.test.tsx`), **PW** = Playwright (`web/e2e/**`), **G** = guardrail (file-system / grep / lint).

## REVIEW-NNN → TEST-REVIEW-NNN

| REVIEW | Clause                                                       | Test(s)                                                  | Layer        |
| ------ | ------------------------------------------------------------ | -------------------------------------------------------- | ------------ |
| 001    | Delete `<pre>{JSON.stringify(...)}</pre>` blocks             | TEST-REVIEW-220                                          | G            |
| 002    | Delete `ReviewsPage.tsx`; `/reviews` becomes a redirect      | TEST-REVIEW-170 / 221 / 223                              | F + G        |
| 003    | Register `/reviews/:id` (no `<Protected>`)                   | TEST-REVIEW-171                                          | F            |
| 004    | `?from=reviews` on the redirect to `/collaborations`         | TEST-REVIEW-170                                          | F            |
| 010    | `<ReviewsSummaryCard>` `Leave a review` button visibility    | TEST-REVIEW-120 (8-case matrix)                          | F            |
| 011    | `<LeaveReviewSheet>` shape + props                           | TEST-REVIEW-100 / 122                                    | F            |
| 012    | Form: overall required, sub-ratings optional, comment ceiling | TEST-REVIEW-101 / 102 / 103                             | F            |
| 013    | Submit + happy path + role-derivation                        | TEST-REVIEW-010 / 070 / 104                              | U + E2E-B + F |
| 014    | Error mapping (4 documented branches + fallback)             | TEST-REVIEW-105                                          | F            |
| 015    | Account-state gating disabled-with-tooltip                   | TEST-REVIEW-070 (verified-email 403) / 121               | E2E-B + F    |
| 016    | Focus management (open + close)                              | TEST-REVIEW-100                                          | F            |
| 017    | Local draft autosave (write / restore / clear / housekeeping) | TEST-REVIEW-110 / 111 / 112 / 113 / 114 / 115 / 204     | F + PW       |
| 020    | Profile-page Reviews tab driven by `GET /reviews/{worker,employer}/:id` | TEST-REVIEW-072 / 073 / 130 / 135                | E2E-B + F    |
| 021    | `<ReviewCard>` shape (header / ratings / comment / footer)   | TEST-REVIEW-140 / 141 / 142 / 143 / 145                  | F            |
| 022    | Pagination footer + Prev/Next disable rules                  | TEST-REVIEW-131                                          | F            |
| 023    | Empty state when `total === 0`                               | TEST-REVIEW-132                                          | F            |
| 024    | Skeleton on first load                                       | TEST-REVIEW-133                                          | F            |
| 030    | `/reviews/:id` page; counterparty chip parallel fetch        | TEST-REVIEW-150 / 155 / 202                              | F + PW       |
| 031    | Body re-uses `<ReviewCard>`; collab-link visibility          | TEST-REVIEW-144 / 150 / 151                              | F            |
| 032    | Three-state response handling (200 / 403 / 404)              | TEST-REVIEW-074 / 150 / 151 / 152 / 153 / 154 / 205      | E2E-B + F + PW |
| 033    | Back-link priority (admin / worker / employer / fallback)    | TEST-REVIEW-156 / 202                                    | F + PW       |
| 040    | Admin queue driven by `GET /reviews/unpublished`             | TEST-REVIEW-076 / 160 / 166                              | E2E-B + F    |
| 041    | Queue row shape + `View →` link                              | TEST-REVIEW-161                                          | F            |
| 042    | Publish optimistic + rollback                                | TEST-REVIEW-075 / 162 / 163 / 203                        | E2E-B + F + PW |
| 043    | Queue pagination                                             | TEST-REVIEW-076 / 164                                    | E2E-B + F    |
| 044    | Queue empty state                                            | TEST-REVIEW-165                                          | F            |
| 045    | Bulk publish — DEFERRED                                      | (no test; documented as defer)                           | -            |
| 046    | New `GET /reviews/unpublished` endpoint                      | TEST-REVIEW-019 / 076 / 206                              | U + E2E-B + PW |
| 047    | Backend tests for the new endpoint                           | TEST-REVIEW-076 (delivers the e2e set REVIEW-047 spec'd) | E2E-B        |
| 050    | Every fetch via `parseApiError()`                            | TEST-REVIEW-105 / 163                                    | F            |
| 051    | `/reviews/:id` not wrapped in `<Protected>`                  | TEST-REVIEW-171 / 205                                    | F + PW       |
| 052    | 401 → existing `<ApiError>` redirect (no duplicate test)     | (covered by `tests-auth-flow`)                           | -            |
| 060    | `lint:tokens` clean                                          | TEST-REVIEW-222                                          | G            |
| 061    | Vite build + light/dark + 375 px                             | TEST-REVIEW-207                                          | PW           |
| 062    | Reuse shadcn primitives + sealed components                  | (assertion implicit in unit tests)                       | F            |
| 063    | New components live under `web/src/components/reviews/`      | (assertion implicit in TEST-REVIEW-100 / 140 imports)    | F            |
| 070    | `tests-reviews/` opens the same week                         | (this folder)                                            | meta         |
| 071    | Don't test `recalculateRatings()` from frontend              | (negative assertion: comment in spec.md)                 | meta         |

## Backend service-method coverage (no parent REVIEW-NNN, but still required)

| Service method                                  | Test(s)                              | Layer  |
| ----------------------------------------------- | ------------------------------------ | ------ |
| `create()` — role derivation                    | TEST-REVIEW-010                      | U      |
| `create()` — `COMPLETED`-only gate              | TEST-REVIEW-011                      | U      |
| `create()` — unique-per-role                    | TEST-REVIEW-012                      | U      |
| `create()` — DTO field passthrough              | TEST-REVIEW-013                      | U      |
| `getById()` — 4-branch visibility               | TEST-REVIEW-014 / 074                | U + E2E-B |
| `getBySubject()` — `is_published` filter        | TEST-REVIEW-015 / 072 / 073          | U + E2E-B |
| `publish()` — happy + idempotent                | TEST-REVIEW-016 / 075                | U + E2E-B |
| `recalculateRatings()` — EMPLOYER side          | TEST-REVIEW-017 / 075 (live recalc)  | U + E2E-B |
| `recalculateRatings()` — WORKER side            | TEST-REVIEW-018 / 075 mirror         | U + E2E-B |
| `getUnpublished()` (NEW)                        | TEST-REVIEW-019 / 076                | U + E2E-B |
| `assertCollaborationParticipant()`              | TEST-REVIEW-020 / 071                | U + E2E-B |

## E2E-N (parent acceptance) → TEST-REVIEW-NNN

| Scenario                                       | Test                  | Status |
| ---------------------------------------------- | --------------------- | ------ |
| Worker leaves a review                         | TEST-REVIEW-200       | PW     |
| Employer leaves a review                       | TEST-REVIEW-201       | PW     |
| Public visitor browses + permalink + back-link | TEST-REVIEW-202       | PW     |
| Staff publishes; reviewee profile updates      | TEST-REVIEW-203       | PW     |
| Draft autosave persists across close/re-open   | TEST-REVIEW-204       | PW     |
| Permalink visibility (3-row matrix)            | TEST-REVIEW-205       | PW     |
| Privilege wall on `/reviews/unpublished`       | TEST-REVIEW-206       | PW     |
| Mobile 375 px                                  | TEST-REVIEW-207       | PW     |

## Edge Cases (parent spec) → TEST-REVIEW-NNN

| Parent Edge Case                                          | Test                             | Layer  |
| --------------------------------------------------------- | -------------------------------- | ------ |
| Worker = responder / employer = initiator (or mirror)     | TEST-REVIEW-010                  | U      |
| User is both worker and employer on the same account      | TEST-REVIEW-010                  | U      |
| Re-submit after network drop                              | TEST-REVIEW-105 (duplicate path) | F      |
| Two-tab race: tab A submits, tab B has stale card         | TEST-REVIEW-105 / 120            | F      |
| `rating_avg` recalculated to 0 after no published reviews | TEST-REVIEW-017                  | U      |
| Comment contains HTML / Markdown                          | TEST-REVIEW-142                  | F      |
| Sub-ratings: pick → clear → re-pick                       | TEST-REVIEW-102                  | F      |
| Public visitor opens draft `/reviews/:id`                 | TEST-REVIEW-153 / 205            | F + PW |
| Review whose collaboration is missing (synthetic)         | TEST-REVIEW-143                  | F      |
| Network failure on first list load                        | TEST-REVIEW-130                  | F      |
| Staff queue shows 0 unpublished reviews                   | TEST-REVIEW-165                  | F      |
| Review with all sub-ratings null + no comment             | TEST-REVIEW-141 / 142            | F      |
| Sheet open, token expires, submit 401                     | (covered by `tests-auth-flow`)   | -      |

## Tooling extensions in this feature

- Backend factories (`backend/test/util/factories.ts`): `seedReview`.
- Web factories (`web/src/test/factories.ts`): `mockReview`, `mockReviewDraft`, `mockReviewListResponse`.
- MSW v2 handlers (`web/src/test/handlers/`): `reviews.ts`.
- Playwright helpers (`web/e2e/util.ts`): `seedReviewViaApi(opts)` test-only API wrapper for setup of TEST-REVIEW-202 / 203 / 205.

## Drift / followups

No production bugs were surfaced by the suite as of 2026-05-08; `tasks/in-progress/reviews/followups.md` was not created.

The Playwright suite leaves five `.fixme` scenarios documented inline in `web/e2e/reviews.scenarios.spec.ts`. Each is gated on a harness-only gap (no production behaviour change required):

- **TEST-REVIEW-201** — employer leave-review happy path. Unblock by copying the body of TEST-REVIEW-200 and swapping `registerWorker` → `registerEmployer` + asserting on the Employer-row CTA. No new helper needed.
- **TEST-REVIEW-202** — public visitor permalink + back-link. Unblock once the public worker-search UI exposes a deterministic `worker_id → /workers/:id` mapping (today the route uses the slug; the seed helper returns the bigint id).
- **TEST-REVIEW-203** — staff publish flow. Unblock by adding a `loginAsStaffViaApi` helper to `web/e2e/util.ts` so the staff-host `/auth/staff/login` redirect chain is bypassed (today the e2e harness only covers marketplace auth).
- **TEST-REVIEW-204** — draft autosave persists across sheet close. Unblock by adding a deterministic Sheet-X selector or programmatic close hook (Radix Sheet's close button selector varies by skin).
- **TEST-REVIEW-207** — mobile 375 px smoke. Unblock when the Playwright config exposes a 375 px mobile project (today the only project is desktop 1280×720).
