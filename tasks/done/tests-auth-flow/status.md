# Status

- State: done
- Owner:
- Created: 2026-05-03
- Last Updated: 2026-05-04
- Shipped: 2026-05-04

## Notes

- Spec drafted 2026-05-03 against the sealed Auth contract
  (`tasks/done/auth-flow/contract.md`, sealed 2026-04-26) and the full
  `tasks/done/auth-flow/spec.md` AUTH-NNN requirement set.
- Tech stack pre-approved by owner: Jest + Supertest + Testcontainers
  (`@testcontainers/postgresql`) for backend; Vitest + RTL + MSW v2 +
  Playwright for web. CI/CD intentionally out of scope.

## Implementation summary (2026-05-04)

- **Backend unit (TEST-AUTH-010..026)**: 112 specs, 7 suites, runs in ~2s
  on a clean machine. All Auth-service branches, `AccountStateGuard`,
  `StaffHostMiddleware`, `StaffService`, `GlobalExceptionFilter`, OAuth
  state-signing covered. One `test.failing` (TEST-AUTH-026 / FU-1) tracks
  the staff-password-generator bug.
- **Backend e2e (TEST-AUTH-040..049)**: 57 specs across 9 suites against a
  Postgres Testcontainer. Per-worker container, truncate-between-tests
  cleanup. Mail captured in-memory via `TestMailService`. Google OAuth
  stubbed via `StubGoogleAuthGuard`. Rate-limit spec (TEST-AUTH-050) is
  `describe.skip` pending FU-6.
- **Frontend tooling (TEST-AUTH-002, 003, 070, 071, 131)**: Vitest + jsdom
  + RTL + MSW v2 wired in `web/vite.config.ts`. `lint-tokens.mjs` extended
  to skip `*.test.tsx` so colocated component specs don't trip the rule.
- **Frontend unit (TEST-AUTH-072..085)**: 60 specs covering every Auth
  page (Login, Register, Internal, Forgot, Reset, Verify, OAuth callback,
  Settings/Security), the auth-routing helpers, `host.ts`,
  `password-policy.ts`, `PasswordRules`, `useAccountMe`, and `api.ts`'s
  401-refresh path.
- **Frontend e2e (TEST-AUTH-100..106)**: 9 Playwright specs against a
  live backend on a Postgres Testcontainer (boot orchestrated from
  `web/e2e/global-setup.ts`). 1 `test.fixme` for `auth.staff-invite`
  (FU-7 — needs an admin-seed test endpoint).
- **Cross-cutting (TEST-AUTH-180..182)**: root `CLAUDE.md` "Tests"
  section, `tasks/GUIDE.md` Working Principles, `backend/test/README.md`.
- **Production code touched**: zero edits to `auth/`, `account/`,
  `staff/`, `common/`, or `mail/` runtime code. The single new file in
  `src/` is `src/test-only/` (mailbox controller + monkey-patch wrapper)
  which mounts only when `NODE_ENV === 'test'` and refuses to mount
  otherwise — explicitly approved by the Decisions Log entry on
  2026-05-03.

## Spot-check (2 reverts on a scratch branch, 2026-05-04)

- Revert `forgotPassword` staff carve-out (`if (... && !account.staff_member)`):
  → `TEST-AUTH-013` (unit) AND `TEST-AUTH-045` (e2e) both go red on
  `forgot-password for staff email → 200, no reset mail`. ✅
- Revert `GlobalExceptionFilter`'s `{ ...obj, statusCode, timestamp }`
  merge to the legacy `{ statusCode, message, timestamp }` strip:
  → `TEST-AUTH-025` (unit), `TEST-AUTH-043` (e2e EMAIL_NOT_VERIFIED body),
  `TEST-AUTH-077` (LoginPage banner), `TEST-AUTH-085` (parseApiError) all
  go red. ✅

## Follow-ups filed

See `followups.md` for production bugs the test suite surfaced but did
not fix (per the working principle: tests do not silently fix Auth bugs).
- FU-1 — staff initial-password generator does not meet AUTH-015-004
- FU-2 — refresh-token rotation can race within a 1-second window
- FU-3 — `bogus-token` minimum length enforced before `TOKEN_INVALID` can fire
- FU-4 — `POST /auth/logout` is NOT idempotent on a missing body
- FU-5 — `POST /auth/change-password` rejects the optional `refresh_token` field
- FU-6 — Auth rate limits (`@Throttle` decorators) are not enforced
- FU-7 — Playwright staff-invite spec needs a test-only admin-seed endpoint
