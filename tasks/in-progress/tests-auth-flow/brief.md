# Brief

## Feature

Test coverage for the shipped Auth feature (`tasks/done/auth-flow/`).

## Problem

The Auth feature shipped without an automated test suite. Every requirement in
`tasks/done/auth-flow/spec.md` (AUTH-014…AUTH-019, plus the 30+ rows in the
Decisions Log) is currently regression-protected only by manual smoke checks
during development.

This is unsafe for a feature whose whole point is trust:

- a silent regression in `forgotPassword()` anti-enumeration leaks account
  existence
- a regression in `AccountStateGuard` lets a `PENDING_EMAIL_VERIFICATION` user
  post jobs / leave reviews
- a regression in refresh-token rotation creates session-fixation surface
- a regression in the `GlobalExceptionFilter` body-merge fix (Decisions Log
  2026-04-26) silently strips structured error codes again, breaking every
  typed flow on the SPA
- a regression in Google OAuth `intent` handling silently provisions
  unintended worker accounts
- staff-host gate, last-admin protection, invite-expiry — all critical
  paths with zero automated verification

Profiles (`tasks/in-progress/profiles/`) is being built on top of Auth's
sealed contract. Without tests around that contract, Profiles inherits
silent-break risk on every Auth refactor.

## Goal

Lock the Auth contract behind an automated test suite that runs locally and
exercises the whole `AUTH-NNN` requirement set — unit + integration + E2E —
so that every Decisions Log entry has at least one test that fails if the
behaviour regresses.

## Users

- TradeHub developers and AI agents working on Auth, Profiles, and any
  future track that consumes the Auth contract.
- Reviewers of PRs touching `backend/src/auth/`, `backend/src/account/`,
  `backend/src/staff/`, `web/src/pages/{Login,Register,Verify*,Forgot*,
  Reset*,InternalLogin,OAuthCallback,SettingsSecurity}Page.tsx`,
  `web/src/lib/{auth-routing,api,host}.ts`.

## Expected Outcome

- Backend: every `AUTH-NNN` requirement has at least one test (unit or
  e2e). Every Decisions Log row that encodes a behaviour (not a pure
  vocabulary change) has at least one test asserting that behaviour.
- Frontend: every auth screen renders, validates, and routes correctly
  under MSW-mocked API responses. Critical journeys (register → verify
  → login, forgot → reset, logout-all, staff invite) are covered by
  Playwright against a real backend on a Testcontainers Postgres.
- A failing test points a developer at the offending `AUTH-NNN` ID and
  the contract clause it broke.

## Constraints

- Do **not** add CI/CD configuration. This feature is local-execution
  only; CI wiring is a separate task.
- Do not change Auth behaviour. If a test reveals a bug, file it as a
  follow-up; do not silently patch in this feature.
- Reuse the password / Account / role vocabulary from the sealed Auth
  contract — do not introduce parallel test-only vocabularies.
- No new infrastructure beyond what runs in `docker compose up`
  (Postgres, Redis) plus ephemeral Testcontainers for the e2e suite.
- Tests must be runnable on macOS / Linux dev machines without a
  managed cloud account.
