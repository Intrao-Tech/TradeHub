# Brief

## Feature

Test coverage for the Jobs & Applications feature (`tasks/product/jobs-applications/`).

## Problem

Jobs & Applications is the second user-visible surface after Profiles and is where every prior trust signal converts into actual marketplace activity. The spec encodes 56+ `JOBS-NNN` requirements, 5 backend prerequisites (`BE-JOBS-1`…`BE-JOBS-5`), and 9 acceptance scenarios (`E2E-1`…`E2E-9`). Without an automated test suite, every one of these is regression-protected only by manual smoke checks during PR review — and the surface is uniquely fragile:

- The backend is **already shipped** but has **zero e2e coverage** (`backend/test/` has no `job-post.e2e-spec.ts` or `job-application.e2e-spec.ts`). Ownership rules, status-specific authorisation (worker-only WITHDRAWN, employer-only REVIEWED/SHORTLISTED/ACCEPTED/REJECTED), and the convert-to-collaboration guard are all unprotected.
- The application lifecycle is a state machine (`PENDING → REVIEWED → SHORTLISTED → ACCEPTED | REJECTED | WITHDRAWN`); a regression that allows an illegal transition (e.g., worker setting their own application to ACCEPTED) is a privilege-escalation bug, not a UX bug.
- The unique constraint `JobApplication.@@unique([job_post_id, worker_id])` enforces "one application per worker per post" at the schema level. Re-apply policy (JOBS-OQ-3) depends on this constraint holding.
- The soft-freeze on edit (JOBS-019) is enforced **frontend-only**; the backend currently accepts any `PATCH /job-posts/:id` from the owner. Tests must lock down the frontend gate AND open a backend follow-up if the gate is load-bearing.
- The role-aware Apply CTA on `/jobs/:id` (JOBS-011) has six branches (anonymous / worker-active / worker-applied / worker-pending / employer-own / employer-other). Each branch is a place a regression can hide.
- The chip-multiselect (`<ChipMultiSelect>`, JOBS-021) is a new shared primitive; without unit coverage of keyboard nav, filter, and chip-removal, a future "add an icon" PR can silently break it for every consumer.
- The 9 `E2E-N` scenarios cross Auth → Profiles → Jobs in one flow; only Playwright against a real backend can exercise them end-to-end.

## Goal

Lock the Jobs & Applications surface behind an automated test suite that runs locally and exercises the whole `JOBS-NNN` requirement set — backend unit + backend e2e + frontend unit + Playwright e2e — so that every Jobs requirement and every `E2E-N` acceptance scenario from the Jobs spec has at least one test that fails if the behaviour regresses.

The `tests-auth-flow` and `tests-profiles` specs handle Auth and Profiles. This spec is their sibling for `jobs-applications` and assumes their tooling (Vitest, MSW v2, RTL, Playwright, Testcontainers, the `TestMailService` and `/test/mailbox` route, the `seedWorker*` / `seedEmployer*` factories, the `renderWithProfile()` helper) is already in place.

## Users

- TradeHub developers and AI agents working on Jobs & Applications, Collaborations, Reviews, Inbox, and any track that consumes the Jobs contract.
- Reviewers of PRs touching `backend/src/{job-post,job-application,specialisation,tag}/`, `web/src/pages/{JobBoard,JobDetail,MyJobs,MyJobsApplicants,EditJob,MyApplications}Page.tsx`, `web/src/components/ui/chip-multi-select.tsx`, or any new Jobs-specific hooks (`useSpecialisations`, `useTags`).

## Expected Outcome

- **Backend**: every `JOBS-NNN` requirement that touches the API has at least one test (unit or e2e). Every `BE-JOBS-N` prerequisite has a contract test for the endpoint or shape it adds. Ownership and status-specific authorisation are exhaustively asserted.
- **Frontend**: every Jobs page renders, validates, and routes correctly under MSW-mocked API responses. Each `E2E-N` scenario from the Jobs spec is a Playwright test against the real backend on a Testcontainers Postgres.
- A failing test points the developer at the offending `JOBS-NNN` ID and the spec clause it broke.
- The grep guardrails (no `<pre>{JSON.stringify(...)}</pre>`, no comma-separated-ID inputs) are encoded as Playwright assertions so a tempting "just dump the JSON for debugging" PR fails the suite.

## Constraints

- Do **not** add CI/CD configuration. Local-execution only.
- Do not change Jobs behaviour. Tests must not silently fix bugs they reveal — file follow-ups in `tasks/in-progress/jobs-applications/followups.md` (created on the first finding).
- Reuse the `tests-auth-flow` + `tests-profiles` tooling: Vitest, RTL, MSW v2, Playwright, Testcontainers Postgres, `TestMailService`. This feature does not introduce a parallel test stack.
- Verification's contract is unsealed at the time of writing (`tasks/product/verification/`). Tests for behaviours that depend on Verification's tier vocabulary consume whatever Verification ships and assert only the Jobs-side surface — Apply / Post are gated only on `verification_state === 'ACTIVE'` per JOBS-OQ-4.
- Soft-freeze (JOBS-019) is asserted frontend-only until the backend gate ships. If the spec resolves to "freeze on backend too", a follow-up adds the e2e half.
- No real Stripe traffic, no real object store, no real mail. Stripe is not in this feature's path; mail is stubbed identically to the `tests-auth-flow` approach.
