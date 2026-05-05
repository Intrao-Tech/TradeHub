# Status

- State: product (spec drafted; opens to `in-progress` the same week Jobs implementation starts)
- Owner: TBD (claim alongside the parent Jobs feature owner)
- Created: 2026-05-05
- Last Updated: 2026-05-05
- Shipped:

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

- This feature is blocked on the parent Jobs feature having an `in-progress` slice landed (the test spec needs real components / endpoints to exercise — pure stub-ahead would diverge from the implementation). Recommended sequencing: open `tasks/in-progress/jobs-applications/` and `tasks/in-progress/tests-jobs-applications/` together; ship the test feature alongside the first Jobs slice that touches a `JOBS-NNN` requirement.
- A handful of `TEST-JOBS-*` specs are `.skip`-blocked on backend prerequisites (`BE-JOBS-1` / `BE-JOBS-2` / `BE-JOBS-3`); see TEST-JOBS-231 in spec.md.
