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
