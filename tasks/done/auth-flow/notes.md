# Notes

## Current Codebase Snapshot

### Backend

- `POST /auth/register` creates an account, creates a worker or employer profile immediately, sends a welcome email, and returns access + refresh tokens right away.
- `POST /auth/login` supports email/password login.
- `POST /auth/refresh` rotates refresh tokens by deleting the previous stored token and issuing a new one.
- `POST /auth/logout` expects `refresh_token` in the request body.
- `POST /auth/logout-all` exists.
- `POST /auth/staff/login` exists as a separate staff-only entry point.
- `GET /auth/google` and `GET /auth/google/callback` exist.
- Accounts currently have `status`, `phone_verified`, `google_id`, and `last_login_at`, but there is no email verification field or token model.
- `PATCH /account/me` allows direct update of `phone_verified`, which is not a valid long-term verification model.

### Web

- Public marketplace browsing exists.
- `LoginPage` supports email/password and Google.
- `RegisterPage` already uses a role-first pattern for `WORKER` vs `EMPLOYER`.
- `OAuthCallbackPage` writes access and refresh tokens from query params.
- `InternalLoginPage` exists for staff.
- The SPA stores tokens in `localStorage`.
- API refresh flow exists in `web/src/api.ts`.
- Logout in `web/src/App.tsx` calls `/auth/logout` without a `refresh_token` body, which means the backend contract is not fully honored.

## Product Doc Alignment

The main product spec frames TradeHub as trust infrastructure, not a simple directory. That raises the bar for auth:

- trust and accountability need identity ownership early
- the reputation layer is foundational
- verification is part of the core product story, not a side feature

Relevant points from `docs/TradeHub_UK_Technical_Specification_v2.docx`:

- The platform is positioned around verified reputation and accountability.
- Verification levels are part of the user trust model.
- The roadmap explicitly says to build reputation before the financial layer.

## Research Notes

### OWASP

- OWASP Email Validation and Verification Cheat Sheet says email ownership should be verified before enabling account use, using single-use time-limited tokens.
- OWASP Forgot Password Cheat Sheet recommends generic responses, single-use expiring reset tokens, and avoiding automatic login after reset.
- OWASP Authentication Cheat Sheet points toward stronger password handling and secure recovery flows.

### NIST

- NIST SP 800-63B recommends longer passwords for single-factor authentication and discourages arbitrary composition rules.

### Google

- Google OAuth redirect flows should use protected `state` handling to preserve app state and mitigate CSRF.

### Auth0 / Clerk Patterns

- Refresh token rotation is a standard session-management pattern.
- Account linking for social login should not create duplicate user accounts and should be careful when deciding whether same-email accounts should merge automatically.

## Source Links

- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Forgot Password Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- OWASP Email Validation and Verification Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html
- NIST SP 800-63B: https://pages.nist.gov/800-63-4/sp800-63b.html
- Google OAuth web flow guidance: https://developers.google.com/identity/oauth2/web/guides/use-code-model
- Google OAuth 2.0 for web server apps: https://developers.google.com/identity/protocols/oauth2/web-server
- Auth0 refresh token rotation: https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation
- Auth0 account linking: https://auth0.com/docs/manage-users/user-accounts/user-account-linking
- Clerk OAuth account linking: https://clerk.com/docs/guides/configure/auth-strategies/social-connections/account-linking

---

## Implementation Plan

Order is dependency-aware: each `BE-*` task is independently shippable; `FE-*` tasks consume backend contracts but the agreed `contract.md` lets frontend mock until the backend lands. Within a tier, tasks are roughly parallelisable.

### Phase 0 — Foundation (do first; blocks everything else)

- **BE-00.** Prisma migration `add_email_verification_state`: new `account.status` default + `email_verified_at`, new tables `email_verification_token` and `password_reset_token`, backfill existing accounts to `ACTIVE` + `email_verified_at = created_at`. Verify with `npx prisma migrate dev` + `prisma studio`.
- **BE-01.** Shared password validator in `backend/src/common/validators/password-policy.ts` exposing `checkPasswordPolicy(value)` — composition rules (8+ chars, lower / upper / digit / special). Same logic mirrored on frontend in **FE-01** + a `<PasswordRules>` component for live feedback.
- **BE-02.** Extend JWT payload: add `vs` claim to `JwtStrategy.sign` and read into `req.user.verification_state`.
- **BE-03.** New `AccountStateGuard` + `@RequiresVerifiedEmail()` decorator. Don't wire it onto existing controllers yet — they'll be wired in **BE-13** after the verify-email flow is live.

### Phase 1 — Backend auth endpoints (parallel)

- **BE-04.** Refactor `POST /auth/register`: stop returning tokens, create `EmailVerificationToken`, send verification email, create profiles in `PENDING_EMAIL_VERIFICATION`. Move welcome-email call out of this path.
- **BE-05.** New endpoints: `POST /auth/verify-email/send`, `POST /auth/verify-email/confirm`. Confirm flips status, consumes token, sends welcome email, returns tokens + account summary.
- **BE-06.** New endpoints: `POST /auth/forgot-password`, `POST /auth/reset-password`. Reset path bulk-revokes refresh-tokens for the account. Generic always-200 response on forgot.
- **BE-07.** Modify `POST /auth/login`: parse status, return `403 EMAIL_NOT_VERIFIED` (with tokens) or `403 ACCOUNT_DEACTIVATED` (no tokens) or `200`. Same shape for staff login but reject non-staff.
- **BE-08.** New `GET /auth/providers` returning `{ google: boolean }`. Computed at boot from env.
- **BE-09.** Per-route throttler decorators on all six auth POST endpoints per the table in `contract.md` §6.
- **BE-10.** Audit-log calls in each auth flow per `contract.md` §9.
- **BE-11.** Mail templates: `verify-email.html`, `reset-password.html`, repurpose existing `welcome.html`. Wire all three through `MailService`.
- **BE-12.** Google OAuth hardening: signed `state` (HMAC), `email_verified` claim trust, same-email collision → redirect with `error=ACCOUNT_EXISTS`. Update `AuthService.handleGoogleLogin`.
- **BE-13.** Wire `@RequiresVerifiedEmail()` onto trust-sensitive controllers per `contract.md` §3.

### Phase 2 — Frontend (parallel with Phase 1 once contract.md is read)

- **FE-01.** Shared helpers: `web/src/lib/auth-routing.ts` (`postAuthRedirect`, `isSafeNext`) + `web/src/lib/password-policy.ts` (mirror of BE-01).
- **FE-02.** `AuthBanner` component for the four reasons.
- **FE-03.** `LoginPage` rewrite: error mapping, `next` param sanitisation, banners on `?reason=…`, hide Google when `providers.google === false`, post-login redirect through `postAuthRedirect`.
- **FE-04.** `RegisterPage` rewrite: redirect to `/verify-email?email=…` on success; password input shows live policy hints from FE-01.
- **FE-05.** New `VerifyEmailPage` — informational + Resend button (calls `/auth/verify-email/send`).
- **FE-06.** New `VerifyEmailConfirmPage` — runs `/auth/verify-email/confirm` on mount, shows result states, on success: store tokens, route via `postAuthRedirect`.
- **FE-07.** New `ForgotPasswordPage` and `ResetPasswordPage` matching `contract.md` shapes, with policy hints in reset.
- **FE-08.** New `SettingsSecurityPage` at `/settings/security` with "Sign out of all devices" button hitting `/auth/logout-all`.
- **FE-09.** `App.tsx` fix: `handleLogout` sends `{ refresh_token }` in body.
- **FE-10.** `api.ts` fix: on refresh failure, redirect to `/login?reason=expired` (not silent location.href to bare `/login`).
- **FE-11.** `OAuthCallbackPage`: handle `?error=ACCOUNT_EXISTS&email=…` with linking screen + "Sign in with password to link" CTA.
- **FE-12.** `InternalLoginPage`: same error-mapping minus Google, copy reflects host-aware deployment when `VITE_STAFF_BASE_URL` is set.

### Phase 3 — Acceptance

- **QA-01.** Run pre-flight from `contract.md` §11: lint backend + frontend, `vite build`, manual smoke matrix (register → verify → login → logout-all → forgot → reset → login).
- **QA-02.** Cross-check every Acceptance Criterion in `spec.md` line by line.
- **QA-03.** Update `status.md` → `Shipped: 2026-MM-DD`, move folder to `tasks/done/`.

### Risks / known unknowns to surface as new Open Questions if hit

- Existing seeded accounts in dev — backfill must keep them usable; verify the Prisma migration `default` vs `existing-row` interaction.
- `MailService` has not been smoke-tested against Resend live; first deploy with real `RESEND_API_KEY` may surface sender-domain or DKIM issues. Not a blocker for MVP but capture as Open Question if it bites.
- `STAFF_LOGIN_HOST` host-gate must run **before** route matching, otherwise the 404 leaks behaviour. Implement as a NestJS middleware or a Fastify hook, not a guard.
