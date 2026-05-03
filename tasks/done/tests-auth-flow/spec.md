# Spec

## Summary

Lock the shipped Auth feature (`tasks/done/auth-flow/`) behind an automated
test suite. Covers backend unit tests, backend integration / e2e tests
against a real Postgres in a Testcontainer, and frontend unit + e2e tests
for every Auth screen and helper. Each `AUTH-NNN` requirement and each
behaviour-encoding row of the Auth Decisions Log gets at least one
asserting test.

Test IDs are `TEST-AUTH-NNN` so they can be referenced from commits and
PRs. Where a test maps directly to an existing `AUTH-NNN` requirement,
the requirement ID is cited in the test description so a failure points
at the broken contract clause.

## Problem

The Auth feature shipped without automated tests. The full failure
context is in `brief.md`. In short:

- 30+ Decisions Log rows encode subtle behaviours (anti-enumeration,
  Google `intent` flag, GlobalExceptionFilter body merge, StrictMode
  double-mount guard, last-admin protection, staff host `Origin`-or-`Host`
  gate, invite expiry) that are protected only by reviewer memory.
- Profiles is being built on the sealed Auth contract. Any refactor of
  Auth code can silently break Profiles. The contract document is not a
  runtime check.
- Manual smoke checks do not scale across two developers and two parallel
  feature tracks.

## Goals

- Run a single `npm test` per package that exercises the entire Auth
  surface end-to-end.
- Make every `AUTH-NNN` requirement and every behaviour-encoding row of
  the Decisions Log fail-loud if it regresses.
- Use a real Postgres for integration / e2e tests so Prisma-level bugs
  (migrations, generated columns, defaults) surface in tests, not in
  production.
- Mock external services (Resend mail, Stripe, Google OAuth, optionally
  Redis) so the suite stays hermetic and runs offline.
- Keep the suite local-runnable; do not couple to any CI provider in
  this feature.

## Non-goals

- CI / CD wiring (separate task).
- Performance / load testing.
- Visual regression testing of auth pages.
- Mutation testing.
- Contract testing across services (single-service repo).
- Rewriting any production Auth code. If a test surfaces a bug, file a
  follow-up; do not silently fix in this feature.
- Real third-party traffic (no real Resend, Stripe, or Google calls).
- Replacing the existing manual smoke checklists in PR reviews.

## User Flow

Not applicable — this feature has no user-visible product surface. The
"users" are developers running `npm test` and AI agents reasoning about
Auth invariants. Spec sections below replace the User Flow with a
**Test surfaces** description.

## Test surfaces

### Backend layers

1. **Unit tests** — `*.spec.ts` colocated next to the source file under
   `backend/src/`. Pure logic only: validators, guards, mappers, JWT
   helpers, password policy, slug helpers. Prisma is deep-mocked with
   `jest-mock-extended`; mail / Stripe / Google strategies are replaced
   with Jest mocks via `Test.createTestingModule().overrideProvider(...)`.
   No Postgres touched.
2. **E2E tests** — `*.e2e-spec.ts` under `backend/test/`. Boots the
   full `AppModule` against a Postgres Testcontainer started in a
   per-suite `beforeAll`. Runs `prisma migrate deploy` on the container,
   seeds minimal fixtures via factory functions, then drives HTTP via
   Supertest. External services are still mocked (mail captured to an
   in-memory transport, Stripe stubbed, Google OAuth strategy replaced
   with a deterministic stub). Redis is mocked with an in-memory
   adapter (matches the existing `REDIS_URL` empty-default behaviour).

### Frontend layers

3. **Unit tests** — `*.test.ts(x)` colocated next to the source file
   under `web/src/`. Uses Vitest + jsdom + `@testing-library/react` +
   `@testing-library/user-event`. MSW v2 (`msw/node`) intercepts every
   `fetch` call. Covers components, hooks (`useAccountMe`),
   `parseApiError`, `auth-routing.ts`, `host.ts`, `password-policy.ts`,
   form validation (zod schemas, `<PasswordRules>` rendering).
4. **E2E tests** — `*.spec.ts` under `web/e2e/`. Playwright drives a
   real Chromium against a real Vite dev server, talking to a real
   NestJS backend on a Postgres Testcontainer. Mail is captured via the
   in-memory transport and surfaced through a test-only HTTP route
   (gated by `NODE_ENV === 'test'`) so Playwright can fetch the
   verification token instead of polling a real inbox. Storage state
   is cached per-role under `web/e2e/.auth/`.

## Requirements

Conventions: each requirement has a stable ID `TEST-AUTH-NNN`.
**Must** = blocks shipping this feature. **Should** = strongly preferred,
add if affordable. Cross-references to the Auth contract / spec use
the existing `AUTH-NNN` IDs.

### 1. Tooling

- **TEST-AUTH-001 (Must).** `backend/package.json` already declares Jest;
  add `@testcontainers/postgresql`, `testcontainers`, `jest-mock-extended`
  as devDependencies. `test:e2e` already references
  `./test/jest-e2e.json`; create that config to run only `*.e2e-spec.ts`
  under `backend/test/`. Ensure `npm test` runs only colocated unit specs
  (`*.spec.ts` under `src/`) — current Jest config in `package.json`
  already scopes `rootDir: src`, so e2e files must live outside `src/`.
- **TEST-AUTH-002 (Must).** Add to `web/package.json`: `vitest`, `jsdom`,
  `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `msw`, `@playwright/test`. Configure
  Vitest in `web/vite.config.ts` with `test: { globals: true,
  environment: 'jsdom', setupFiles: './src/test/setup.ts' }`. Add
  scripts: `"test": "vitest run"`, `"test:watch": "vitest"`,
  `"test:e2e": "playwright test"`, `"test:e2e:ui": "playwright test
  --ui"`. Do **not** include test runs in the existing
  `lint`/`build` scripts — token lint must remain independent.
- **TEST-AUTH-003 (Must).** Test code does not bypass the existing
  `web/scripts/lint-tokens.mjs` rule. Test files under `**/*.test.tsx`
  and `e2e/**` are added to the lint-ignore allowlist if needed; Auth
  page production code remains lint-clean.

### 2. Backend unit tests (mocked Prisma)

- **TEST-AUTH-010 (Must).** `password-policy.spec.ts` — covers
  `AUTH-015-004` revised: rejects strings <8 / >128 chars, rejects strings
  missing lowercase / uppercase / digit / special, accepts boundary
  cases. Run against the canonical implementation in
  `backend/src/common/validators/password-policy.ts`.
- **TEST-AUTH-011 (Must).** `auth.service.spec.ts` `register()`:
  - creates `Account` + `client_profile` + role-specific sub-profile
    atomically (worker XOR employer)
  - new account starts in `PENDING_EMAIL_VERIFICATION` (AUTH-015-001)
  - PENDING re-registration silently re-issues verification email,
    returns `pending_verification: true` (Decisions Log 2026-04-26
    "Re-registration on PENDING")
  - ACTIVE / DEACTIVATED collisions throw `409 EMAIL_TAKEN`
  - welcome email is **not** sent at register (AUTH-015-003)
  - verification email **is** sent
- **TEST-AUTH-012 (Must).** `auth.service.spec.ts` `login()`:
  - rejects unknown email with the same generic error as wrong password
    (AUTH-004 anti-enumeration)
  - PENDING account login response includes structured `code:
    EMAIL_NOT_VERIFIED` error body (verifies the
    `GlobalExceptionFilter` body-merge fix surfaces structured codes)
  - DEACTIVATED account is rejected without issuing tokens
  - response includes `is_worker`, `is_employer`, `is_staff`,
    `verification_state` (AUTH-014-001)
  - bumps `account.last_login_at`
- **TEST-AUTH-013 (Must).** `auth.service.spec.ts` `forgotPassword()`:
  - returns `200 { ok: true }` for unknown email (AUTH-007
    anti-enumeration)
  - returns the same shape for staff email but does **not** issue a
    reset token (AUTH-007 + §11 staff carve-out)
  - returns the same shape for Google-only account but triggers the
    Google sign-in reminder mail (Decisions Log 2026-04-26)
- **TEST-AUTH-014 (Must).** `auth.service.spec.ts` `resetPassword()`:
  - rejects expired tokens
  - rejects already-used tokens
  - on success, revokes all refresh tokens for that account
    (AUTH-007: "all active sessions are revoked automatically")
  - does **not** auto-login the user
- **TEST-AUTH-015 (Must).** `auth.service.spec.ts` `changePassword()`:
  - requires current password to match (AUTH-008 + Decisions Log
    2026-04-26 new endpoint)
  - revokes refresh tokens on **other** devices but keeps the current
    device session alive (Decisions Log 2026-04-26 rationale)
- **TEST-AUTH-016 (Must).** `auth.service.spec.ts` `refresh()`:
  - rotates the refresh token (old one no longer valid after one use)
  - rejects revoked / unknown tokens (returns 401)
  - issues a new access token with fresh `exp`
- **TEST-AUTH-017 (Must).** `auth.service.spec.ts` `logout()`:
  - invalidates the supplied refresh token (current-session)
  - is a no-op if the SPA fails to send the body (regression guard for
    the original frontend bug noted in spec Problem section)
- **TEST-AUTH-018 (Must).** `auth.service.spec.ts` `logoutAll()`:
  - revokes every refresh token for the account
  - returns the count of revoked tokens (used by analytics
    `auth.logout_all { revoked }`, AUTH-013)
- **TEST-AUTH-019 (Must).** `auth.service.spec.ts` Google OAuth handling:
  - `email_verified=true` + new email → creates ACTIVE account, sets
    `email_verified_at`, no verification email sent (AUTH-015-002)
  - `email_verified=false|missing` + new email → creates
    PENDING_EMAIL_VERIFICATION account, sends verification email
  - existing email + `email_verified=true` → auto-link, flip PENDING
    to ACTIVE if needed (AUTH-015-006 revised, Decisions Log
    2026-04-26 "auto-link instead of explicit-linking screen")
  - existing email + `email_verified=false|missing` → return
    explicit-link redirect, do **not** silently merge
  - `intent=login` + no account → redirect with
    `error=NO_GOOGLE_ACCOUNT` (Decisions Log 2026-04-26 "behaviour
    fix: NO_GOOGLE_ACCOUNT")
  - `intent=register` + existing google_id different role → redirect
    with `error=ACCOUNT_EXISTS&intent=register&email=…`
- **TEST-AUTH-020 (Must).** `oauth-state.spec.ts` — `GET
  /auth/google/start` signs the state on the server with `JWT_SECRET`,
  not the SPA (Decisions Log 2026-04-26 "Google OAuth state is signed
  by /auth/google/start"). Tampering with the signed `state` is
  rejected at the callback.
- **TEST-AUTH-021 (Must).** `auth.service.spec.ts` `verifyEmail()`:
  - single-use token; second call returns `TOKEN_INVALID`
  - 24h TTL respected
  - on success flips status to ACTIVE, sets `email_verified_at`, and
    sends the welcome email (AUTH-015-003)
- **TEST-AUTH-022 (Must).** `account-state.guard.spec.ts` — given the
  AUTH-015-001 hard-block list:
  - PENDING user is denied on `POST /jobs`, `POST /job-applications`,
    `POST /conversations`, message send, `POST /collaborations`,
    `POST /referrals`, `POST /reviews`, `POST /escrow/*`,
    `POST /verifications/*`
  - PENDING user is permitted on `GET /account/me`,
    `PATCH /client-profiles/me`, `PATCH /worker-profiles/me`,
    `PATCH /employer-profiles/me`, `POST /portfolio/*`,
    `POST /document/*`, `POST /auth/verify-email/*`,
    `POST /auth/logout`, `POST /auth/logout-all`
- **TEST-AUTH-023 (Must).** `staff-host.middleware.spec.ts` — covers
  AUTH-016-002:
  - request with matching `Origin` header passes
  - request with matching `Host` header passes
  - request with neither (e.g., SPA hostname mismatch) is rejected
    with `404 Not Found`
  - dev defaults (`internal.localhost`) work without explicit env
- **TEST-AUTH-024 (Must).** `staff.service.spec.ts` mutations
  (AUTH-018-001…AUTH-018-007):
  - create-fresh path generates 16-char password meeting policy and
    sets `invite_expires_at = now + 24h`
  - promote-existing-active path attaches StaffMember without
    changing the password
  - PENDING / DEACTIVATED / already-staff rejections fire the right
    structured error codes
  - `reinvite` only works while `last_login_at IS NULL`
  - `reset-password` works regardless of `last_login_at`, revokes
    every refresh token, generates a fresh policy-compliant password
  - `PATCH /staff/:id/role` enforces `CANNOT_DEMOTE_SELF` and
    `LAST_ADMIN`
  - `DELETE /staff/:id` enforces `CANNOT_DEACTIVATE_SELF` and
    `LAST_ADMIN`, revokes refresh tokens on success
  - staff login enforces `INVITE_EXPIRED` per AUTH-018-007
- **TEST-AUTH-025 (Must).** `global-exception.filter.spec.ts` —
  covers the Decisions Log 2026-04-26 critical bug fix: an
  `HttpException` thrown with `{ code, email, message }` body must
  reach the client with all three keys preserved (regression guard
  against the original "stripped to `{ statusCode, message,
  timestamp }`" behaviour).
- **TEST-AUTH-026 (Should).** `password-policy.spec.ts` cross-check:
  the staff password generator produces strings that pass
  `password-policy.ts`. Loops 100 generations to catch flaky
  edge-cases.

### 3. Backend e2e tests (Testcontainers Postgres)

- **TEST-AUTH-040 (Must).** `test/util/test-app.ts` boots a Nest app
  against a Testcontainer Postgres URL injected into `DATABASE_URL`,
  applies `prisma migrate deploy`, returns `{ app, prisma, mailbox,
  close }`. Used by every `*.e2e-spec.ts`.
- **TEST-AUTH-041 (Must).** `auth.register.e2e-spec.ts`:
  - happy-path worker register → 201 → row in DB → mail captured →
    PENDING state
  - happy-path employer register
  - re-register on PENDING → still 201 → second mail captured → no
    duplicate Account row
  - re-register on ACTIVE → 409 `EMAIL_TAKEN`
  - confirm-password mismatch → 400 (AUTH-019-003)
- **TEST-AUTH-042 (Must).** `auth.verify-email.e2e-spec.ts`:
  - POST `/auth/verify-email/send` debounces / always 200
  - GET (or POST) `/auth/verify-email/confirm` flips PENDING → ACTIVE,
    sends welcome mail
  - second call with the same token returns `TOKEN_INVALID`
  - StrictMode double-mount regression: hitting the same token
    endpoint twice within 1s does not surface a flicker — server is
    idempotent for the success path within a small grace window OR
    error body always contains `code: TOKEN_INVALID` so the SPA can
    distinguish (assert error code, not error string)
- **TEST-AUTH-043 (Must).** `auth.login.e2e-spec.ts`:
  - login of ACTIVE worker → 200 with role flags + verification_state
  - login of PENDING → 401 with `code: EMAIL_NOT_VERIFIED`
  - login of DEACTIVATED → 401 with `code: ACCOUNT_DEACTIVATED`
  - bad password → 401 with the same generic shape as unknown email
  - successful login bumps `account.last_login_at`
- **TEST-AUTH-044 (Must).** `auth.refresh.e2e-spec.ts`:
  - rotation: first refresh succeeds, second use of the same token
    fails 401
  - logout invalidates the current refresh token
  - logout-all revokes every refresh token for the account
- **TEST-AUTH-045 (Must).** `auth.password-recovery.e2e-spec.ts`:
  - forgot-password for unknown email → 200, no mail sent
  - forgot-password for ACTIVE email → 200, reset mail captured
  - forgot-password for staff email → 200, no reset mail
  - forgot-password for Google-only account → 200, sign-in-reminder
    mail captured (Decisions Log 2026-04-26)
  - reset with expired token → 400
  - reset with valid token → 200, all refresh tokens revoked
  - change-password requires current password, revokes other-device
    sessions only
- **TEST-AUTH-046 (Must).** `auth.account-state.e2e-spec.ts`:
  - PENDING user calling each endpoint in the AUTH-015-001
    deny-list → 403 `EMAIL_NOT_VERIFIED`
  - PENDING user calling each endpoint in the allow-list → 2xx
- **TEST-AUTH-047 (Must).** `auth.staff-host.e2e-spec.ts`:
  - request to `/auth/staff/login` from the marketplace `Origin` →
    404
  - request from the staff `Origin` → 200 (with valid creds)
  - same for the curl path via `Host` header
- **TEST-AUTH-048 (Must).** `staff.lifecycle.e2e-spec.ts`:
  - admin creates fresh staff → invite mail captured with 16-char
    password meeting policy, `invite_expires_at` set
  - admin promotes ACTIVE marketplace user → no password change,
    promotion mail captured
  - admin reinvite while `last_login_at IS NULL` → fresh password,
    fresh expiry
  - admin reinvite after `last_login_at` set → `STAFF_ALREADY_USED`
  - admin reset-password after first login → fresh password, all
    refresh tokens revoked
  - admin demote / deactivate self → `CANNOT_DEMOTE_SELF` /
    `CANNOT_DEACTIVATE_SELF`
  - admin demote / deactivate last admin → `LAST_ADMIN`
  - moderator GET `/staff` → 200 (read-only access per AUTH-017-001)
  - moderator POST / PATCH / DELETE → 403
- **TEST-AUTH-049 (Must).** `auth.google.e2e-spec.ts` — uses a stub
  `GoogleStrategy` that returns deterministic profile shapes:
  - `email_verified: true` new email → ACTIVE account, no verify
    email
  - `email_verified: false` new email → PENDING account, verify mail
  - `email_verified: true` existing-email collision → auto-link,
    PENDING → ACTIVE on link
  - `email_verified: false` existing-email collision → explicit-link
    response
  - `intent=login` + no account → `error=NO_GOOGLE_ACCOUNT`
  - state-tampering rejected at callback
- **TEST-AUTH-050 (Should).** `auth.rate-limit.e2e-spec.ts` covers
  AUTH-010: login / signup / forgot-password / verify-resend each
  reject after the per-endpoint cap with `429`. Skipped from default
  `npm run test:e2e` if it is too slow; available behind
  `--testNamePattern=rate-limit`.

### 4. Frontend unit tests (Vitest + RTL + MSW)

- **TEST-AUTH-070 (Must).** `web/src/test/setup.ts` registers MSW
  server, jest-dom matchers, and clears the module-state cache for
  `useAccountMe` after each test.
- **TEST-AUTH-071 (Must).** `web/src/test/handlers.ts` defines a
  default MSW handler set covering every `auth-flow` endpoint
  surfaced by `web/src/api.ts`. Tests override per-case via
  `server.use(...)`.
- **TEST-AUTH-072 (Must).** `auth-routing.test.ts`:
  - `isSafeNext('/profile')` → true
  - `isSafeNext('//evil.com')` → false (AUTH-014-003)
  - `isSafeNext('http://evil.com')` → false
  - `isSafeNext('/profile?x=1')` → true
  - `postAuthRedirect()` priority order matches AUTH-014-002 (1: next,
    2: staff → `/admin`, 3: PENDING → `/verify-email`, 4: DEACTIVATED
    → block, 5: ACTIVE → `/profile`)
- **TEST-AUTH-073 (Must).** `host.test.ts` — `IS_STAFF_HOST` returns
  true for `internal.localhost` / `internal.tradehub.co.uk` and
  false for the apex / `app.*` hosts.
- **TEST-AUTH-074 (Must).** `password-policy.test.ts` — frontend
  mirror in `web/src/lib/password-policy.ts` agrees with the backend
  rules from TEST-AUTH-010.
- **TEST-AUTH-075 (Must).** `PasswordRules.test.tsx` — given a
  controlled input, the four rule rows flip met / unmet correctly and
  the live `aria-live` region announces changes.
- **TEST-AUTH-076 (Must).** `RegisterPage.test.tsx`:
  - role chooser surfaces both roles and toggles the correct
    name fields (worker: First+Surname, employer: Company name —
    Decisions Log 2026-04-26)
  - confirm-password mismatch blocks submit (AUTH-019-003)
  - phone country picker combines `+${dial}${digits}` to E.164
    before submit (AUTH-019-001)
  - if Google OAuth is unconfigured (env flag), Google CTA is hidden
    or disabled (AUTH-005)
  - back-arrow renders top-left (Decisions Log 2026-04-26)
- **TEST-AUTH-077 (Must).** `LoginPage.test.tsx`:
  - submits to `/auth/login`
  - on `code: EMAIL_NOT_VERIFIED` response → renders the
    `<AuthBanner kind="EMAIL_NOT_VERIFIED">` and provides a Resend CTA
  - on `code: ACCOUNT_DEACTIVATED` → renders the deactivated banner
  - on success, calls `postAuthRedirect()` with the response payload
  - "Sign in with Google" CTA hidden when env flag absent
  - back-arrow icon-only top-left, `aria-label` present
- **TEST-AUTH-078 (Must).** `InternalLoginPage.test.tsx`:
  - never renders a Google CTA regardless of env (§11)
  - `INVITE_EXPIRED` response body surfaces the right copy
  - successful login routes to `/admin`
- **TEST-AUTH-079 (Must).** `ForgotPasswordPage.test.tsx`:
  - always renders the same generic "If an account exists, we sent
    a link" success state regardless of API response shape
    (anti-enumeration UX guarantee)
- **TEST-AUTH-080 (Must).** `ResetPasswordPage.test.tsx`:
  - confirm-password mismatch blocks submit
  - rule list reflects live policy
  - on success, the page directs the user to `/login` and does **not**
    auto-log-in (AUTH-007)
- **TEST-AUTH-081 (Must).** `VerifyEmailPage.test.tsx` +
  `VerifyEmailConfirmPage.test.tsx`:
  - resend button surfaces success / error states
  - `useRef` guard prevents the StrictMode double-mount from
    re-consuming the token (Decisions Log 2026-04-26 bug fix)
  - expired token surfaces a "request a new link" CTA
- **TEST-AUTH-082 (Must).** `OAuthCallbackPage.test.tsx`:
  - `error=NO_GOOGLE_ACCOUNT` → renders "Create an account" CTA
  - `error=ACCOUNT_EXISTS&intent=register&email=…` → renders
    "you already have an account, sign in instead"
  - success → applies `postAuthRedirect()`
- **TEST-AUTH-083 (Must).** `SettingsSecurityPage.test.tsx`:
  - change-password validates current + new + confirm and submits to
    `/auth/change-password`
  - logout-all calls `/auth/logout-all` and routes to
    `/login?reason=logged_out`
  - admin-only StaffModule UI is hidden when
    `account.staff_member.staff_role !== 'ADMIN'`
- **TEST-AUTH-084 (Must).** `useAccountMe.test.tsx`:
  - first call hits `/account/me`; second call within the same
    module lifetime returns the cached value without refetch
  - `refetch()` re-fires the request
  - state is reset between tests (setup file responsibility)
- **TEST-AUTH-085 (Must).** `api.test.ts` (`web/src/api.ts`):
  - `parseApiError` extracts `code`, `message`, embedded fields from
    structured error bodies (regression guard for the
    `GlobalExceptionFilter` body-merge fix)
  - `ApiError` is `instanceof Error` and carries `status`, `code`,
    `body`
  - 401 triggers a refresh attempt; on refresh failure, redirects to
    `/login?reason=expired`

### 5. Frontend e2e tests (Playwright)

`web/e2e/` runs against a real backend boot (Testcontainers Postgres)
plus the Vite dev server. Mail and Stripe are stubbed in the same way
as the backend e2e suite. A test-only HTTP route
`GET /test/mailbox/:address` (gated by `NODE_ENV === 'test'`) returns
captured emails so Playwright can extract verification tokens
without polling a real inbox.

- **TEST-AUTH-100 (Must).** `e2e/auth.smoke.spec.ts` — register
  worker → fetch verification token from mailbox → confirm → land on
  `/profile`. Asserts the route, the absence of the
  `EMAIL_NOT_VERIFIED` banner, and that `account.email_verified_at` is
  set.
- **TEST-AUTH-101 (Must).** `e2e/auth.login-routing.spec.ts` — covers
  the full AUTH-014 priority list: `next` redirect respected, staff
  routed to `/admin`, PENDING routed to `/verify-email`, deactivated
  blocked at login.
- **TEST-AUTH-102 (Must).** `e2e/auth.password-recovery.spec.ts` —
  forgot → mail token → reset → new password works, old password
  fails. Concurrent session check: a second browser context that was
  signed in before reset is logged out on next API call.
- **TEST-AUTH-103 (Must).** `e2e/auth.logout-all.spec.ts` — two
  browser contexts signed in as the same user. `/settings/security`
  logout-all in context A logs out context B on next request.
- **TEST-AUTH-104 (Must).** `e2e/auth.staff-invite.spec.ts` — admin
  in context A creates staff via `/admin`. Staff member in context B
  receives invite mail, signs in via the staff host, lands on
  `/admin`. `last_login_at` set.
- **TEST-AUTH-105 (Must).** `e2e/auth.staff-host.spec.ts` — visiting
  `/internal/login` on the marketplace host redirects to the staff
  host (`VITE_STAFF_BASE_URL`). Visiting marketplace routes on the
  staff host returns the staff-only router (no Google CTA).
- **TEST-AUTH-106 (Should).** `e2e/auth.google.spec.ts` — uses
  Playwright's `page.route()` to intercept the `accounts.google.com`
  redirect and send the browser back to `/oauth/callback` with a
  signed test state, exercising the same callback paths the
  `intent=login` / `intent=register` backend tests cover from the
  browser side.

### 6. Fixtures and factories

- **TEST-AUTH-130 (Must).** `backend/test/util/factories.ts` exports
  `makeAccount({ status, role, email })`,
  `makeStaff({ role, lastLoginAt })`, `makeRefreshToken({ accountId,
  revokedAt })`. Factories return Prisma objects without committing;
  helpers `seedActiveWorker(prisma)` / `seedPendingWorker(prisma)` /
  `seedAdmin(prisma)` commit.
- **TEST-AUTH-131 (Must).** `web/src/test/factories.ts` mirrors the
  shape of `account/me` and `auth/login` responses for use in
  component tests.
- **TEST-AUTH-132 (Must).** Factories never reuse seed-script values
  (`Password123!`, `admin@tradehub.co.uk`, etc.) so production seed
  data and test data cannot collide if tests ever leak into a
  shared environment.

### 7. Coverage and reporting

- **TEST-AUTH-160 (Must).** Backend Jest produces an `lcov` summary
  via `npm run test:cov`. Set a starting floor in `jest.config`:
  60 % statements, 50 % branches **for `backend/src/auth/**`,
  `common/**`, `account/**`, `staff/**`** only. The repo-wide
  threshold stays unenforced for this feature — Profiles tests will
  raise their own slice in their own spec.
- **TEST-AUTH-161 (Should).** Web Vitest produces a coverage report
  via `npm run test -- --coverage`. No threshold enforcement in this
  feature; baseline numbers are captured in the PR description so
  follow-up specs can ratchet.
- **TEST-AUTH-162 (Must).** Test failures must print:
  - the `TEST-AUTH-NNN` ID (via `describe()` block label)
  - the `AUTH-NNN` requirement reference (via `test()` label)
  - the relevant request / response body when an HTTP assertion
    fails (Supertest's default already does this; do not silence it)

### 8. Cross-cutting

- **TEST-AUTH-180 (Must).** Update `CLAUDE.md` (root) to add a
  "Tests" section: lists `npm test` (backend unit), `npm run test:e2e`
  (backend e2e, requires Docker), `npm test` and
  `npm run test:e2e` (web). Removes any prior implicit signal that
  tests are optional.
- **TEST-AUTH-181 (Must).** Update `tasks/GUIDE.md` Working
  Principles section to add: "Every shipped feature folder in
  `tasks/done/` should have a test counterpart in `tasks/done/`
  (named `tests-<feature>/`). If you ship a feature without tests,
  open a tests-<feature> spec the same week."
- **TEST-AUTH-182 (Should).** A short `backend/test/README.md`
  documenting how to run a single e2e spec, how to keep the
  Testcontainer alive between runs for debugging, and how to inspect
  the captured mailbox.

## Edge Cases

- Testcontainers cannot start because Docker is not running → suite
  prints a clear error and exits 1 with a hint to run `docker compose
  up`. No mock fallback.
- Mail capture transport leaks between tests → enforced by clearing
  the mailbox in a global `afterEach` in the e2e setup file.
- Two e2e specs collide on the same port → Testcontainers is asked
  for a random port; the test app reads `DATABASE_URL` from the
  container's `getConnectionUri()`.
- Playwright run on a machine without Chromium installed → the
  `web/package.json` postinstall does not auto-install browsers
  (per upstream guidance); the README documents
  `npx playwright install chromium`.
- React 19 StrictMode runs effects twice in dev — VerifyEmailConfirmPage
  test must mount inside `<StrictMode>` to actually exercise the
  `useRef` guard (regression guard for the Decisions Log fix).
- MSW v2 + node 24: handlers must use the `http` / `HttpResponse` API
  (not the v1 `rest` API the older blog posts show).
- `lint:tokens` runs over `pages/**` and `components/**`; e2e and
  test files live elsewhere (`e2e/`, `**/*.test.tsx`) and are not
  linted by it. If a co-located test file is added inside
  `components/**`, exclude `**/*.test.tsx` in `lint-tokens.mjs`.
- Tests must not depend on a developer having Google OAuth env vars
  set; the Google strategy is replaced for tests via
  `overrideProvider`.
- `Password123!` (production seed default) must not be the password
  any factory issues, so a leaked test secret cannot match the seed.
- Time-based assertions (24h invite expiry, 1h reset link, 15min
  access token) use a fake-timer helper, not real `setTimeout` waits.

## Acceptance Criteria

- `cd backend && npm test` passes with all `*.spec.ts` files green
  and reports coverage for the auth/account/staff/common slices at
  or above the TEST-AUTH-160 floor.
- `cd backend && npm run test:e2e` passes with every
  `*.e2e-spec.ts` green on a clean machine where only Docker is
  running. The first run downloads the Postgres image; subsequent
  runs reuse it.
- `cd web && npm test` passes with every `*.test.ts(x)` file green;
  no real network requests escape (verified by setting MSW
  `onUnhandledRequest: 'error'`).
- `cd web && npm run test:e2e` passes on a clean machine after
  `npx playwright install chromium`.
- Every Decisions Log row in `tasks/done/auth-flow/spec.md` that
  encodes a behaviour has a corresponding test that fails when that
  behaviour is reverted. (Verified by spot-reverting two rows on a
  scratch branch and confirming red.)
- `web/scripts/lint-tokens.mjs` still passes; no production Auth
  source file changed in this feature.
- `tasks/done/auth-flow/spec.md` is unchanged (this feature does
  not amend the contract).
- `CLAUDE.md` and `tasks/GUIDE.md` updated per TEST-AUTH-180 /
  TEST-AUTH-181.
- A new contributor running `git clone … && docker compose up &&
  cd backend && npm i && npm test && npm run test:e2e` produces a
  full green suite without manual env edits beyond copying
  `backend/.env.dev` to `backend/.env`.

## Open Questions

- **Single Postgres container per suite vs per-file.** Per-suite is
  faster; per-file is more isolated. Default to per-suite with
  truncation-based cleanup between specs (faster than full reset);
  fall back to per-file if cleanup proves flaky.
- **Mail capture surface.** Two options: (a) replace `MailService`
  with an in-memory `TestMailService` provider via Nest
  `overrideProvider`, exposing a `mailbox: Email[]` array on the
  test harness; (b) point `MailService` at MailHog in a second
  Testcontainer. (a) is simpler and faster; (b) verifies HTML
  rendering. MVP recommendation: (a). Revisit if HTML mail bugs
  start showing up.
- **Should the test-only `/test/mailbox/:address` route live in the
  backend at all?** Alternative is to expose the in-memory mailbox
  via a Playwright fixture that imports a backend test helper
  directly (no HTTP). Direct import is cleaner; HTTP is simpler when
  the backend runs out-of-process. MVP: HTTP route gated by
  `NODE_ENV === 'test'`, refuses to mount otherwise.
- **Redis dependency for tests.** Auth currently uses Redis only for
  the WS adapter (chat). Auth tests do not exercise chat, so a
  no-op Redis adapter is fine. If a future auth feature persists
  rate-limit counters in Redis, switch to a Redis Testcontainer at
  that point.
- **Coverage thresholds for slice-by-slice.** Starting floor in
  TEST-AUTH-160 is conservative. Tighten in a follow-up once the
  baseline is known.
- **Snapshot tests.** Avoided by default — they encode rendered
  output rather than behaviour and rot fast in a token-driven
  design system. Reconsider only for the Trust-Ladder / Verification
  Badge components that are pure render of a known input.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-03 | Stack: Jest+Supertest+Testcontainers (BE), Vitest+RTL+MSW v2+Playwright (FE) | Owner-approved. Matches the existing Jest config in backend, native fit with Vite + React 19 on web, single MSW handler set shared between unit and e2e. |
| 2026-05-03 | CI/CD intentionally out of scope | Owner instruction. Suite is local-runnable; CI wiring is a separate task. |
| 2026-05-03 | Tests must not change Auth production code | Test feature must not silently fix bugs surfaced by the suite — file follow-ups instead. Otherwise the test feature accumulates risk it was meant to *find*. |
| 2026-05-03 | Mail captured via in-memory `TestMailService` (option (a)) | Faster than a MailHog container, sufficient for "did we send the right mail with the right token". HTML rendering bugs are a separate concern. |
| 2026-05-03 | Test-only `/test/mailbox/:address` route, gated by `NODE_ENV === 'test'` | Simpler than wiring Playwright into a backend in-process import; refuses to mount in any non-test env so production exposure risk is zero. |
