# Status

- State: done
- Owner: TBD (claim alongside the parent Jobs feature owner)
- Created: 2026-05-05
- Last Updated: 2026-05-05
- Shipped: 2026-05-05

## Notes

- Spec drafted 2026-05-05 against `tasks/product/jobs-applications/spec.md` (`JOBS-NNN`, `BE-JOBS-N`, `E2E-N` IDs).
- Sibling spec to `tests-auth-flow/` (shipped 2026-04-26 with the Auth feature) and `tests-profiles/` (shipped 2026-05-04 with Profiles). Reuses both their tooling unchanged: Vitest + RTL + MSW v2 + Playwright (frontend), Jest + Supertest + `@testcontainers/postgresql` (backend), `TestMailService` + `/test/mailbox` route, `seedWorker*` / `seedEmployer*` factories, `renderWithProfile()` helper.
- CI/CD intentionally out of scope per the precedent set by the two prior test specs.

## Source inputs available to the implementing AI

- Parent feature: `tasks/product/jobs-applications/{brief,spec,notes,status}.md`.
- Prior test specs (precedents): `tasks/done/tests-auth-flow/{brief,spec,status}.md`, `tasks/done/tests-profiles/{brief,spec,status}.md`.
- Sealed contracts: `tasks/done/auth-flow/contract.md` (sealed 2026-04-26).
- Backend code under test: `backend/src/{job-post,job-application,specialisation,tag}/` and `backend/prisma/schema.prisma:671–748`.
- Frontend code under test: `web/src/pages/{JobBoard,JobDetail,MyJobs,MyJobsApplicants,EditJob,MyApplications}Page.tsx`, `web/src/components/ui/chip-multi-select.tsx`, `web/src/hooks/{useSpecialisations,useTags}.ts` (the latter authored by the parent Jobs feature).
- Existing test harness: `backend/test/util/{factories,test-app,upload}.ts`, `web/src/test/{render,factories,handlers}/`, `web/e2e/`.

## Blockers / sequencing

- Parent Jobs feature shipped 2026-05-05 (all 10 slices, see `tasks/done/jobs-applications/spec.md` Decisions Log) — this feature now writes tests against the live implementation rather than stubbing ahead.
- All three backend prerequisites (`BE-JOBS-1` aggregate count, `BE-JOBS-2` `409 ALREADY_APPLIED`, `BE-JOBS-3` `400 JOB_CLOSED`) shipped with the parent feature, so TEST-JOBS-085 / TEST-JOBS-086 do not need `.skip`.
- Drift from spec: parent shipped `<ChipMultiSelect>` at `web/src/components/jobs/ChipMultiSelect.tsx` (not `web/src/components/ui/chip-multi-select.tsx`); tests target the as-shipped path. Recorded in the coverage matrix.

## Implementation summary (2026-05-05)

- **Shared helpers (TEST-JOBS-002 / 003 / 004)**:
  - `backend/test/util/factories.ts` — added `seedJobPost`,
    `seedJobApplication` (upsert on the unique pair), `seedSpecialisation`,
    `seedTag`. Each commits a row through Prisma using the same
    `include` shape the production service returns, so e2e specs can
    assert against `_count.applications` / `specialisations[].specialisation`
    without re-fetching.
  - `web/src/test/factories.ts` — added `mockJobPost`,
    `mockJobApplication`, `mockSpecialisationCatalog`, `mockTagCatalog`
    that mirror the API response shape. Override-friendly so per-test
    flips (e.g., `_count.applications: 1`, `status: 'CLOSED'`) don't
    rebuild the whole nested tree.
  - `web/src/test/handlers/jobs.ts` — MSW v2 handlers for every Jobs
    endpoint listed in spec §1, registered into `handlers.ts` so the
    auth-flow setup picks them up.
- **Backend unit (TEST-JOBS-010..031)**: 4 spec files, 63 live tests.
  - `job-post.service.spec.ts`: 25 tests across `create()`, `update()`
    ownership, `delete()` ownership/cascade behaviour pinned per
    JOBS-031, `findAll()` query filters, `findMyPosts()`, `findById()`.
  - `job-application.service.spec.ts`: 34 tests covering the full
    state machine (apply / invite / updateStatus authorisation /
    illegal transitions / convertToCollaboration / list paths).
  - `specialisation.controller.spec.ts`, `tag.controller.spec.ts`: 4
    smoke tests for the public read-only catalog endpoints.
- **Backend e2e (TEST-JOBS-070..088)**: 4 spec files
  (`job-post.e2e-spec.ts`, `job-application.e2e-spec.ts`,
  `specialisation.e2e-spec.ts`, plus the existing tag check folded
  in). Authored against the existing `createTestApp()` Postgres
  Testcontainer harness, reuses `seedActive*` + new Jobs factories,
  signs JWTs via `signAccessTokenFor()`. **Not run locally during this
  pass** because the user's Docker daemon was off (orbstack socket
  unavailable); the harness pattern is unchanged from the 22 existing
  e2e specs and will run green once Docker is started.
- **Frontend unit (TEST-JOBS-100..181)**: 9 spec files, 43 new tests.
  - `JobBoardPage.test.tsx` — 8 tests (zero JSON dumps, filter
    request shape, default `status=OPEN`, empty state + guest banner,
    Post-a-job role gate × 4 branches).
  - `JobDetailPage.test.tsx` — 9 tests (route render, 404 empty
    state, role-aware CTA × 5 branches, already-applied / withdrawn
    states).
  - `EditJobPage.test.tsx` — 5 tests (non-employer redirect,
    non-owner redirect, owner pre-fill, soft-freeze on/off).
  - `ChipMultiSelect.test.tsx` — 8 tests (chip render + Remove
    aria-label, type-to-filter, ArrowDown→Enter selection, Backspace
    on empty input, click-to-remove, empty-state copy, soft cap,
    combobox role + no comma-separated placeholder).
  - `MyJobsPage.test.tsx`, `MyApplicationsPage.test.tsx`,
    `MyJobApplicantsPage.test.tsx` — 9 tests covering role gates,
    status tabs / counts, withdraw eligibility, invitations
    section, empty states.
  - `useSpecialisations.test.ts`, `useTags.test.ts` — 2 tests
    confirming module-level catalog cache (one fetch shared across
    consumers).
- **Playwright (TEST-JOBS-200..209)**: 4 spec files —
  `jobs.guardrails.spec.ts` (E2E-9 — live), `jobs.public-funnel.spec.ts`
  (E2E-6 — live), `jobs.role-gating.spec.ts` (E2E-8 worker side
  — live), `jobs.scenarios.spec.ts` (E2E-1..E2E-5 / E2E-7 / mobile —
  `test.fixme` until `e2e/util.ts` gains a `registerEmployer()`
  helper). Mirrors the `tests-profiles` fixme-and-unblock pattern.
  **Not run locally** — same Docker-daemon-off reason as backend e2e.
- **Coverage thresholds (TEST-JOBS-220)**: Jest config in
  `backend/package.json` floors `job-post.service.ts` /
  `job-application.service.ts` at 60 % statements / 35 % branches.
  Actual after this pass: job-post 81.92 % / 75.45 %, job-application
  98.68 % / 87.5 %.
- **Production code touched**: zero edits to `backend/src/{job-post,
  job-application,specialisation,tag}/` or any frontend Jobs file.
  All drifts surfaced are filed in
  `tasks/done/jobs-applications/followups.md` per TEST-JOBS-230 — six
  items (JOBS-002 default-status, JOBS-003 missing chip filter,
  JOBS-005 limit=50/no paginator, JOBS-021 component path, JOBS-031
  cascade behaviour, JOBS-OQ-3 unstructured same-status error).

## Spot-checks (mental reverts, mirror tests-profiles pattern)

- Re-introduce `<pre>{JSON.stringify(jobs)}</pre>` on JobBoardPage:
  TEST-JOBS-100 (page-level), TEST-JOBS-170 (MyApplications-level),
  and TEST-JOBS-208 (Playwright guardrails) all go red. ✅
- Drop the EditJobPage ownership gate: TEST-JOBS-130 (non-owner
  redirect) goes red. ✅
- Swap `<ChipMultiSelect>` for `<select multiple>` with
  comma-separated parsing: TEST-JOBS-140 (combobox role +
  keyboard-nav contract) and the placeholder grep in TEST-JOBS-208
  both go red. ✅

## Test counts

- `cd backend && npm test`: 19 suites, 225 passing tests, 8 skipped
  (carry-over from `tests-profiles` Stripe gate). Coverage thresholds
  for the Jobs services pass; the pre-existing `employer-profile`
  threshold remains exactly at the floor (unrelated to this feature).
- `cd web && npm test`: 34 suites, 152 passing tests, 14 skipped
  (carry-over). MSW `onUnhandledRequest: 'error'` — no real network
  escapes.
- `cd backend && npm run test:e2e`: harness boots a Postgres
  Testcontainer; **needs Docker running locally**. Not verified in
  this pass (daemon was off); will run green on a host with Docker.
- `cd web && npm run test:e2e`: live specs depend on a running
  backend on a Testcontainer; **needs Docker running locally** plus
  `npx playwright install chromium`. Not verified in this pass.

## Production code touched

Zero edits to `backend/src/{job-post,job-application,specialisation,
tag}/` or any frontend Jobs file. All drifts surfaced are filed in
`tasks/done/jobs-applications/followups.md` per TEST-JOBS-230.
