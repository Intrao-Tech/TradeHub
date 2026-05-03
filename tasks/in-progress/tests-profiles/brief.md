# Brief

## Feature

Test coverage for the Profiles feature
(`tasks/in-progress/profiles/`).

## Problem

Profiles is the first user-visible expression of TradeHub's "trust
infrastructure" promise. The spec encodes 55+ `PROF-NNN`
requirements, eight backend prerequisites (`BE-PROF-1`…`BE-PROF-8`),
and eight end-to-end scenarios (`E2E-1`…`E2E-8`). Without an
automated test suite, every one of these is regression-protected
only by manual smoke checks during PR review.

That is unsafe for this surface specifically:

- avatar / portfolio / document upload pipelines mix Multer, Sharp,
  Prisma, and disk writes — multiple silent-failure modes
- the Trust Ladder UI must render the *exact* product-spec ladder
  (Unverified / Basic / Certified / Premium) and translate legacy
  enum values without inventing new ones (`PROF-032`)
- the Right-to-Work submission paths (`PROF-052`) are a UK legal
  requirement; a regression here is not just UX
- public profile pages (`PROF-001…PROF-008`) must be accessible
  without authentication while still redacting contact actions
- the AccountStateGuard exemption list (Auth contract §3) means
  PENDING_EMAIL_VERIFICATION users can still edit profiles —
  regressing that hides bugs from reviewers who only test as ACTIVE
  users
- completeness math (`PROF-035`/`PROF-036`) is role-aware and easy
  to drift away from the spec
- 14 surface routes (`/workers/:id`, `/employers/:id`,
  `/clients/:slug`, `/clients`, `/profile`, edit forms, document
  list, portfolio editors, settings, etc.) all need to keep passing
  `lint:tokens` and rendering at 375 px in light + dark

## Goal

Lock the Profiles surface behind an automated test suite that runs
locally and exercises the whole `PROF-NNN` requirement set — unit +
integration + e2e — so that every Profiles requirement and every
`E2E-N` acceptance scenario from the Profiles spec has at least one
test that fails if the behaviour regresses.

The tests-auth-flow spec handles `auth-flow`. This spec is its
sibling for `profiles` and assumes the tests-auth-flow tooling
(Vitest, MSW, Playwright, Testcontainers, the `TestMailService` and
`/test/mailbox` route) is already in place.

## Users

- TradeHub developers and AI agents working on Profiles, Verification,
  Reviews, Stripe Connect, and any track that consumes the Profiles
  contract.
- Reviewers of PRs touching `backend/src/{client-profile,
  worker-profile,employer-profile,portfolio,document,
  specialisation,stripe}/`, `web/src/pages/{Profile,
  WorkerDetail,EmployerDetail,ClientPublicProfile,
  WorkerSearch,EmployerSearch,ClientDirectory}Page.tsx`,
  `web/src/components/{VerificationBadge,WorkerCard,EmployerCard,
  StarRating}.tsx`, `web/src/hooks/useAccountMe.ts`.

## Expected Outcome

- Backend: every `PROF-NNN` requirement that touches the API has at
  least one test (unit or e2e). Every `BE-PROF-N` prerequisite has
  a contract test for the endpoint it adds.
- Frontend: every Profiles page renders, validates, and routes
  correctly under MSW-mocked API responses. Each `E2E-N` scenario
  from the Profiles spec is a Playwright test against the real
  backend on a Testcontainers Postgres.
- A failing test points the developer at the offending `PROF-NNN`
  ID and the spec clause it broke.

## Constraints

- Do **not** add CI/CD configuration. Local-execution only.
- Do not change Profiles behaviour. Tests must not silently fix
  bugs they reveal — file follow-ups in `tasks/in-progress/profiles/
  followups.md`.
- Reuse the tests-auth-flow tooling: Vitest, RTL, MSW v2,
  Playwright, Testcontainers Postgres, `TestMailService`,
  `GET /test/mailbox/:address`. This feature does not introduce a
  parallel test stack.
- Verification's contract is unsealed at the time of writing
  (`tasks/product/verification/`). Tests for behaviours that
  depend on Verification (rejection-reason rendering, ladder
  promotion) consume whatever Verification ships and assert only
  the Profiles-side surface — see PROF-032 / PROF-033 in the
  Profiles spec.
- File upload tests must not depend on any external object store.
  Multer's local disk pipeline is the surface under test.
- No real Stripe traffic. Stripe is stubbed identically to the
  tests-auth-flow approach.
