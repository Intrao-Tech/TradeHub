# Status

- State: in-progress
- Owner:
- Created: 2026-05-03
- Last Updated: 2026-05-03
- Shipped:

## Notes

- Spec drafted 2026-05-03 against the Profiles spec at
  `tasks/in-progress/profiles/spec.md` (PROF-NNN, BE-PROF-N, E2E-N
  IDs). Sibling spec to `tests-auth-flow`; reuses its tooling.
- Tech stack pre-approved by owner: Jest + Supertest +
  Testcontainers (`@testcontainers/postgresql`) for backend; Vitest
  + RTL + MSW v2 + Playwright for web. CI/CD intentionally out of
  scope.
- Blocked from "complete" until `tasks/in-progress/profiles/`
  ships — tests for PROF-NNN that have not been implemented yet
  start as `.skip` with a comment citing the open backend
  prerequisite.
