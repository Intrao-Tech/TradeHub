# Spec

## Summary

Define the production-ready authentication and account-entry flow for TradeHub MVP. This feature covers public-to-authenticated entry, role-aware signup, email verification, password recovery, Google sign in, session lifecycle, and staff login boundaries.

The feature should make auth feel trustworthy and predictable while staying narrow enough to fit the task system as one coherent feature folder.

## Problem

TradeHub's product positioning depends on trust and verified identity, but the current auth implementation does not yet support that promise end to end.

Current gaps from the repo and docs:

- email/password signup creates an immediately usable account
- welcome email exists, but email verification does not
- forgot password / reset password does not exist
- frontend logout does not send `refresh_token` in the request body, so the current session token is not reliably revoked
- Google sign in is present, but its redirect and role handoff are not cleanly defined as a product flow
- there is only a generic global throttle, not auth-specific abuse controls
- the product spec says trust and verification are foundational, but auth currently behaves like a temporary MVP shortcut

## Goals

- Define a single, consistent auth journey for workers and employers
- Preserve role selection at account creation and first Google signup
- Require email ownership verification before a user can use trust-sensitive product actions
- Add secure password recovery
- Make session behavior understandable: current session logout, logout-all, expired-session recovery
- Keep staff authentication separate from marketplace user authentication
- Ensure unauthenticated and unverified states are explicit in both UX and API behavior

## Non-goals

- MFA / 2FA
- Phone OTP verification
- Passkeys or passwordless auth
- Full profile onboarding after auth
- KYC, document verification, or HMRC verification
- Changing email address
- Advanced enterprise SSO
- Subscription or billing auth changes

## User Flow

### Marketplace user
1. Visitor lands on a public page and can browse public marketplace content without signing in.
2. Visitor chooses `Sign up` and selects a role: `WORKER` or `EMPLOYER`.
3. Visitor enters required fields (email, password + confirm, first name + surname OR company name, optional phone with country picker) — or continues with Google.
4. TradeHub creates the account in `PENDING_EMAIL_VERIFICATION` and sends a verification email (or, for trusted Google `email_verified=true`, skips straight to `ACTIVE`).
5. User lands on the verify-email screen with a "Resend" option.
6. User verifies email by clicking the single-use 24h link → account flips to `ACTIVE` → user lands on `/profile`.
7. Returning user signs in and is sent to their intended destination (or `/profile` by default).
8. Forgot password → enter email → receive single-use 1h link → set new password → sign in normally (all active sessions revoked).
9. Logged-in user can change password from `Settings → Security`; can also "Sign out everywhere" from the same page.

### Staff user
1. An admin invites the staff member from AdminPage → Members tab → "Add staff" (new email or promote an existing client).
2. New email recipients get an invite email with a 24h-valid initial password and a link to the staff subdomain.
3. The staff member signs in on the staff subdomain (no Google option) and is routed to `/admin`.
4. Logged-in staff can change their password from `Settings → Security`.
5. Staff cannot self-recover a forgotten password — they ask an admin who clicks "Reset password" in the Members tab; a new password is emailed.

## Requirements

### 1. Entry Model

- Public pages remain accessible without authentication.
- Trust-sensitive actions require authentication.
- Trust-sensitive actions also require verified account state.
- Trust-sensitive actions for MVP include:
  - posting jobs
  - applying to jobs
  - starting conversations
  - creating collaborations
  - creating referrals
  - leaving reviews
  - starting payments or verification flows

### 2. Account States

- The system must distinguish account access state from profile trust badges.
- New marketplace accounts must not be treated as fully active before email ownership is confirmed.
- Product state model for this feature:
  - `PENDING_EMAIL_VERIFICATION`
  - `ACTIVE`
  - `DEACTIVATED`
- A newly created account starts in `PENDING_EMAIL_VERIFICATION` unless the auth provider can be treated as verified by policy.
- `DEACTIVATED` accounts cannot authenticate into the product.

### 3. Signup

- Signup must support email/password for `WORKER` and `EMPLOYER`.
- Role choice happens before account creation and is explicit.
- Required inputs for marketplace signup:
  - email
  - password + confirm password (must match)
  - role-specific name: First name + Surname (worker) OR Company name (employer)
  - role
- Phone is optional and entered via a country-code picker plus local number; combined to E.164 (`+${dial}${digits}`) before submit (see §19).
- Phone is not used as an auth factor.
- After signup, the user must receive a clear next step instead of being silently dropped into the product.
- Welcome email is sent only after email verification completes (per AUTH-015-003).

### 4. Login

- Email/password login must work for existing marketplace users.
- Login errors must stay generic enough to avoid easy account enumeration.
- If a user attempted to access a protected route before login, the post-login redirect must return them there.
- Session-expired behavior must return the user to login with a clear reason, not a silent failure.

### 5. Google Sign In

- Google sign in must support both signup and login.
- First-time Google signup must preserve intended role selection.
- Existing users who already have a password account with the same email should not end up with duplicate TradeHub accounts.
- Automatic linking is allowed only if TradeHub has high confidence the Google email is verified by the provider and mapped to the same user identity.
- If that confidence is not available, the flow must fall back to explicit verification instead of silent linking.
- OAuth redirect handling must preserve post-auth destination safely.
- OAuth state must be protected against tampering and CSRF.
- If Google auth is not configured in the environment, the product must hide or clearly disable that option instead of presenting a broken path.

### 6. Email Verification

- Email verification is required for normal marketplace use.
- Verification links must be single-use and time-limited.
- Users must be able to request a resend of the verification email.
- Verification success must move the account into `ACTIVE`.
- If a verification link is expired or already used, the user must see a clear recovery path.
- Verification status must be visible in the UI until resolved.

### 7. Password Recovery

- Marketplace users have `Forgot password` and `Reset password` flows.
- Forgot-password responses must not reveal whether an email address exists (always `200 { ok: true }`).
- Reset links are single-use and 1h time-limited.
- Resetting a password does NOT automatically log the user in — they sign in through the normal login flow.
- After a successful reset, all active sessions are revoked automatically.
- Logged-in users have a `Change password` flow at `/settings/security` (requires current password).
- **Staff cannot self-recover passwords** — `/forgot-password` is a silent no-op for staff emails. Admin uses `Reset password` in Members tab to issue a new password (per §11 + §18).

### 8. Session Management

- Access tokens may remain short-lived.
- Refresh tokens must be rotated on refresh.
- Current-session logout must reliably invalidate the current refresh token.
- Logout-all must revoke every active refresh token for that account.
- The UX must expose logout-all somewhere visible to the signed-in user, even if not in the first navbar iteration.
- The product must define one expected storage model for tokens in the SPA and treat it as an explicit tradeoff, not an accidental detail.

### 9. Password Policy

- Password policy for MVP (composition-based):
  - minimum 8 characters
  - maximum 128 characters
  - at least one lowercase letter
  - at least one uppercase letter
  - at least one digit
  - at least one special (non-alphanumeric) character
- Password changes, resets, and admin-issued staff passwords use the same policy.
- The frontend renders a live-feedback rules list (`PasswordRules` component) so the user sees which rules are met / unmet as they type — for users on signup + reset, for staff on change-password.

### 10. Abuse Protection

- Auth endpoints need more than the app-wide generic throttle.
- Add auth-specific rate limits for:
  - login
  - signup
  - forgot password
  - verification resend
- Product should allow escalation to CAPTCHA or equivalent only after abuse signals. CAPTCHA is not required in the first implementation if rate limiting and monitoring are present.

### 11. Staff Authentication

- Staff login is a separate entry point from marketplace auth, served on the dedicated subdomain (see §16 / AUTH-D-001).
- Staff users are not routed through the worker/employer role flow.
- Google sign-in is explicitly disabled on the staff entry — the staff login screen must not present a "Continue with Google" button regardless of provider configuration.
- Staff session behavior follows the same logout and logout-all rules as marketplace users.
- **Staff cannot self-reset their password.** `/forgot-password` does not work for staff accounts (silently skipped, same 200 response for anti-enumeration). Password recovery for staff is admin-mediated: an admin clicks "Reset password" in the Members tab, which generates a fresh password, revokes all the target's refresh tokens, and emails the new credentials to the staff member.
- Logged-in staff CAN change their password via `Settings → Security` (`POST /auth/change-password`), same flow as marketplace users.

### 12. UX Requirements

- Auth screens must clearly separate:
  - sign in
  - sign up
  - forgot password
  - reset password
  - verify email
  - staff login
- Copy should explain why verification is needed in TradeHub terms:
  - trust
  - accountability
  - fewer fake accounts
- Unverified users should not encounter confusing 401/403 dead ends. The UI must tell them what to do next.
- Every auth screen (login, register, verify-email landing, verify-email-confirm, forgot-password, reset-password, internal login, oauth callback) must use the existing `AuthShell` component from `web/src/components/AppShell.tsx` and the design-system primitives in `web/src/components/ui/`. No raw hex, no default Tailwind palette — `npm run lint:tokens` must pass. Mobile-first 375 px, tap targets ≥ 48×48 px, light + dark both verified.

### 13. Analytics and Audit

- The product captures the following auth events:
  - `auth.signup.started`, `auth.signup.completed`
  - `auth.verify_email.sent`, `auth.verify_email.completed`
  - `auth.login.succeeded`, `auth.login.failed { reason }`
  - `auth.password_reset.requested`, `auth.password_reset.completed`
  - `auth.password_changed` (logged-in change-password flow)
  - `auth.logout`, `auth.logout_all { revoked }`
  - `auth.google.linked { via }`
- Staff lifecycle events:
  - `staff.created`, `staff.promoted_existing` (existing client elevated to staff)
  - `staff.reinvited`, `staff.password_reset` (admin force-reset)
  - `staff.role_changed { from, to }`
  - `staff.deactivated`, `staff.reactivated`
- All events log `account_id`, `entity_type`, `entity_id`, `metadata`, `ip_address`. Staff-visible audit log lives in AdminPage → Audit tab.

## Edge Cases

### Marketplace auth
- User signs up, closes the tab, and returns later without verifying
- User clicks an expired verification link
- User requests password reset for an email that does not exist (silent 200)
- User clicks an expired or previously used reset link
- User logs in on two devices, then uses logout-all
- User starts from a protected route and signs in with Google; intended redirect must still work
- Google login is enabled in the UI but credentials are missing in the environment
- Existing password user later chooses Google sign in with the same email (auto-link if Google email_verified, else explicit linking screen)
- Deactivated user attempts to log in
- Unverified user tries to create a job application, message, review, or referral directly via URL
- User re-attempts registration on an email that already exists in `PENDING_EMAIL_VERIFICATION` state (silent re-issue)
- User re-attempts registration on an `ACTIVE` email (`EMAIL_TAKEN` with Sign in / Forgot CTAs)
- Google sign-in from `/login` page when no account exists for that Google identity (`NO_GOOGLE_ACCOUNT` screen, not silent worker creation)

### Staff auth + lifecycle
- Admin invites a brand-new staff email
- Admin invites an email that's already an `ACTIVE` worker / employer (promotion path; password unchanged)
- Admin invites an email that's already a staff member (`ALREADY_STAFF`)
- Staff member never signs in within 24h → invite expires; admin re-invites
- Staff member signs in once, then forgets password → admin resets via Members tab (not `/forgot-password`, which silently no-ops for staff)
- Admin tries to deactivate self (`CANNOT_DEACTIVATE_SELF`)
- Admin tries to demote self from admin (`CANNOT_DEMOTE_SELF`)
- Admin tries to deactivate / demote the last `ACTIVE` admin (`LAST_ADMIN`)
- Moderator opens Members tab → sees the list, no mutation buttons

## Acceptance Criteria

### Marketplace auth
- A new worker or employer can sign up with email/password (with confirm-password match) and is guided into a clear verification step.
- A new worker or employer can sign up with Google and preserve the chosen role.
- A newly created marketplace account is not treated as fully active for trust-sensitive actions before verification.
- Users can resend email verification safely.
- Users can request a password reset without learning whether an email exists.
- Users can reset a password with a single-use time-limited link and are then required to log in normally.
- Standard login returns users to their intended destination when applicable.
- Current-session logout reliably invalidates the current refresh token.
- Logout-all invalidates all active sessions.
- Logged-in users can change their password via Settings → Security.
- If Google auth is unavailable in the environment, users are not presented with a broken Google sign-in path.
- Auth-specific abuse controls exist for login, signup, verification resend, and password reset.
- Password input shows live policy feedback (`<PasswordRules>`) on registration, reset, and change-password screens.
- The UI has explicit states for unverified users instead of leaving them in a partially working account.

### Staff
- Staff sign in through the internal subdomain only.
- Admin can create new staff accounts; brand-new emails get a 24h-valid initial password by email.
- Admin can promote an existing marketplace account to staff without changing its password.
- Admin can resend the invite for staff who never signed in (regenerates password + 24h expiry).
- Admin can force-reset the password for staff who have already signed in.
- Admin can promote / demote staff between ADMIN and MODERATOR; cannot demote the last admin or themselves.
- Admin can deactivate / reactivate staff; cannot deactivate the last admin or themselves.
- Moderators see the Members tab read-only (no mutation buttons).
- Staff `/forgot-password` is a silent no-op (anti-enumeration); admin reset is the only recovery path.
- Logged-in staff can change their own password.

## Open Questions

All initial Open Questions have been resolved on 2026-04-26 — see Decisions Log below. New questions raised during implementation must be appended here (not the Decisions Log) until they are resolved.

## Requirements (post-decisions)

### 14. Post-login Routing

- **AUTH-014-001 (Must).** `POST /auth/login` response must include the role flags from the JWT payload (`is_worker`, `is_employer`, `is_staff`) plus `verification_state` derived from `account.status`, so the SPA can decide where to land without a follow-up `/account/me` round-trip.
- **AUTH-014-002 (Must).** Post-login redirect rules (in priority order):
  1. If `next` query param is set and points to a same-origin path, navigate there.
  2. Else if `is_staff` → `/admin` (on the staff subdomain).
  3. Else if `verification_state === 'PENDING_EMAIL_VERIFICATION'` → `/verify-email`.
  4. Else if `account.status === 'DEACTIVATED'` → block at login (do not issue tokens; show "account deactivated" copy).
  5. Else (worker or employer, ACTIVE) → `/profile` (per `tasks/product/profiles/spec.md` user flow `:56` and `:71`).
- **AUTH-014-003 (Must).** `next` redirect must be sanitised — only same-origin relative paths are allowed. External URLs and protocol-relative URLs (`//evil.com`) are rejected, and the user falls through to the default route for their role.
- **AUTH-014-004 (Must).** Post-Google-login flow uses the same routing table as AUTH-014-002. The `OAuthCallbackPage` reads `next` from the redirect URL produced by the backend callback and applies the same priority list.

### 15. Resolved Decisions (Open Questions → answered)

- **AUTH-015-001 (Must).** Trust-sensitive actions are **hard-blocked** for `PENDING_EMAIL_VERIFICATION` accounts. The `AccountStateGuard` rejects with `403 EMAIL_NOT_VERIFIED` on: posting jobs, applying to jobs, starting conversations, sending messages, creating collaborations, creating referrals, leaving reviews, initiating escrow or verification flows. Permitted: own profile read/edit, document upload, `verify-email/send`, `verify-email/confirm`, `logout`, `logout-all`, `account/me`. Everything else is denied at the controller layer.
- **AUTH-015-002 (Must).** Google-created accounts are considered email-verified **only if** the OAuth ID-token contains `email_verified: true`. The verified moment is stored as `account.email_verified_at` and the account is created directly in `ACTIVE` status. If the claim is `false` or missing, the account starts in `PENDING_EMAIL_VERIFICATION` and the standard email-verification flow runs.
- **AUTH-015-003 (Must).** Welcome email is sent **only after** email verification completes. The verification email is the only message produced at signup time. The current `MailService.sendWelcome` call in `auth.service.ts` register path must be removed; it is re-attached to the verify-email-confirm path.
- **AUTH-015-004 (Must, REVISED 2026-04-26).** Password policy is **8–128 characters with composition rules**: at least one lowercase letter, one uppercase letter, one digit, and one special (non-alphanumeric) character. Server is the source of truth (`backend/src/common/validators/password-policy.ts`); the client mirrors the rules in `web/src/lib/password-policy.ts` and renders them via `<PasswordRules>` for live feedback. Applies to register, reset-password, change-password, and the random initial password admins issue to staff (which is generated to satisfy these rules).
- **AUTH-015-005 (Should).** "Logout from all devices" is exposed in a new **Settings → Security** page (`/settings/security`). Profile and the navbar do not host it. Settings is created by this feature even if it ships with only the Security tab.
- **AUTH-015-006 (Must, REVISED 2026-04-26).** Account linking policy is **graded by Google's email_verified signal**:
  - **`email_verified === true`** (default for personal Gmail): auto-link `google_id` to the existing email-matched account and sign the user in. PENDING accounts are flipped to ACTIVE since Google has verified the address. Audit-logged as `auth.google.linked { via: 'auto_link_verified_email' }`.
  - **`email_verified !== true`** (rare enterprise tenants without provisioned email verification): show the "We found an existing TradeHub account" screen and require explicit password sign-in to confirm before linking.
  - Same-email collisions where Google's signal is missing/false are never auto-merged.

### 16. Staff URL Decision (AUTH-D-001) — REVISED 2026-04-26

- **AUTH-016-001 (Must).** Staff entry is served on a **dedicated subdomain** from day one — `internal.{domain}` (production: `internal.tradehub.co.uk`; dev: `internal.localhost:3000`, which modern browsers resolve to `127.0.0.1` per RFC 6761 with no `/etc/hosts` edit). The marketplace SPA is served on the apex / `app.*` host. Both hostnames serve the **same React build**; a hostname check at boot decides which route tree mounts.
- **AUTH-016-002 (Must).** Backend env `STAFF_LOGIN_HOST` is **required in production** (e.g., `internal.tradehub.co.uk`). The `StaffHostMiddleware` rejects `/auth/staff/login` with `404 Not Found` unless **either** the request `Origin` header matches `STAFF_FRONTEND_URL` (the browser-set identity, which is the right signal when API and SPA are on different hostnames) **or** the `Host` header matches `STAFF_LOGIN_HOST` (covers curl / non-browser clients and reverse-proxied per-subdomain backends). In dev both default to `internal.localhost`. Explicit empty values disable the gate (debug only).
- **AUTH-016-003 (Must).** Frontend env `VITE_STAFF_BASE_URL` is **required in production** (e.g., `https://internal.tradehub.co.uk`). The marketplace SPA never renders staff routes on its own host; if a user lands on the marketplace `/internal/...` URL by accident, the SPA redirects to `${VITE_STAFF_BASE_URL}${pathname}`. Dev default: `http://internal.localhost:3000`.
- **AUTH-016-004 (Must).** App boot logic in `App.tsx`:
  - If `window.location.hostname` starts with `internal.` → render `StaffRouter` (only `/login`, `/admin`, staff settings). No marketplace navigation. No Google CTA on staff login.
  - Else → render `MarketplaceRouter` (current routes minus any `/internal/*`, plus the redirect to `VITE_STAFF_BASE_URL` for stragglers).
- **AUTH-016-005 (Must).** Backend `enableCors()` whitelist must include both origins: `[FRONTEND_URL, STAFF_FRONTEND_URL]`. Wildcard / `*` origin is rejected in production by config check at boot.
- **AUTH-016-006 (Must).** Vite dev server runs with `server.host: true` (binds all interfaces) so `internal.localhost:3000` resolves; otherwise Vite's default localhost-only bind blocks subdomain access. This goes in `vite.config.ts`.
- **AUTH-016-007 (Should).** Cookies (when introduced post-MVP) must be scoped to the parent domain (`Domain=.tradehub.co.uk`) so a session can be valid across `app.*` ↔ `internal.*` for users who happen to be both staff and marketplace participants — but with `SameSite=Lax` and a separate cookie name per surface to keep audit clean.

### 17. Members directory (visible to all staff)

- **AUTH-017-001 (Must).** AdminPage → **Members** tab lists every staff member (admins + moderators), visible to **all signed-in staff** (read access on `GET /staff` is gated by `@Roles('STAFF')`, which covers ADMIN + MODERATOR).
- **AUTH-017-002 (Must).** Mutations remain admin-only (`@Roles('ADMIN')` on POST / PATCH / DELETE / `/reset-password` / `/reinvite` / `/reactivate`). Moderators see the list with no mutation buttons; the SPA hides them based on the signed-in user's role.
- **AUTH-017-003 (Should).** Each row shows: display name + email, status badge (`ACTIVE` / `DEACTIVATED`), role badge (`ADMIN` / `MODERATOR`), invite state (`invite pending` / `invite expired` for never-signed-in accounts), and last login timestamp.

### 18. Staff lifecycle (admin operations)

Endpoints under `/staff/*` (all admin-only except listing):

- **AUTH-018-001 (Must).** `POST /staff` — create or promote.
  - Email belongs to no account → create fresh `Account` + `StaffMember`, generate a 16-char password, set `staff_member.invite_expires_at = now() + 24h`, send the invite email with the credentials.
  - Email belongs to an `ACTIVE` marketplace account with no `staff_member` → **promote**: attach a `StaffMember` to the existing account. Password is **NOT changed** (the user keeps the password they already use). Send a "you've been promoted to staff" email instead.
  - Email belongs to a `PENDING_EMAIL_VERIFICATION` account → reject with `ACCOUNT_NOT_VERIFIED` (force user to verify before promotion).
  - Email belongs to a `DEACTIVATED` account → reject with `ACCOUNT_DEACTIVATED`.
  - Email belongs to a staff account → reject with `ALREADY_STAFF` (admin should use `Resend invite` or `Change role` instead).
- **AUTH-018-002 (Must).** `POST /staff/:id/reinvite` — re-issue the initial invite. Generates a fresh password, sets a new 24h `invite_expires_at`, revokes any existing refresh tokens, sends a new invite email. **Only works while `account.last_login_at IS NULL`** (the staff member never signed in). If they have already used the account, returns `STAFF_ALREADY_USED` and admin must use `reset-password` instead.
- **AUTH-018-003 (Must).** `POST /staff/:id/reset-password` — admin force-reset for a staff member who has already signed in. Generates a fresh password, revokes ALL their refresh tokens, emails the new credentials. This is the only password-recovery path for staff (per §11).
- **AUTH-018-004 (Must).** `PATCH /staff/:id/role` with `{ staff_role: 'ADMIN' | 'MODERATOR' }` — promote or demote. Self-demote is blocked (`CANNOT_DEMOTE_SELF`). Demoting the last `ACTIVE` admin is blocked (`LAST_ADMIN`).
- **AUTH-018-005 (Must).** `POST /staff/:id/reactivate` — flip a `DEACTIVATED` staff back to `ACTIVE`.
- **AUTH-018-006 (Must).** `DELETE /staff/:id` — soft-delete: status → `DEACTIVATED` and revoke all refresh tokens. Self-deactivate is blocked (`CANNOT_DEACTIVATE_SELF`). Deactivating the last `ACTIVE` admin is blocked (`LAST_ADMIN`).
- **AUTH-018-007 (Must).** Invite expiry is enforced at staff login (`/auth/staff/login`): if `invite_expires_at` is set, `last_login_at IS NULL`, and `invite_expires_at < now()` → `401 INVITE_EXPIRED` with copy "Ask an admin to send a fresh invite."

### 19. Registration UX

- **AUTH-019-001 (Must).** Registration form requires:
  - Role chosen first (`WORKER` or `EMPLOYER`)
  - Email
  - Password + Confirm password (must match)
  - Worker: First name + Surname (combined into `client_profile.display_name`)
  - Employer: Company name (used as both `client_profile.display_name` and `employer_profile.company_name`)
  - Phone (optional) — country picker (flag image + dial code) plus local number; combined to E.164 (`+${dial}${digits}`) before submit
- **AUTH-019-002 (Should).** Country picker shows a real flag image (raster from a public CDN — `flagcdn.com` for MVP). Falls back to ISO letters via `<img onError>` if the CDN is unreachable.
- **AUTH-019-003 (Must).** Confirm-password mismatch is shown inline (`Passwords don't match.`) and blocks submit. Same UX in `ResetPasswordPage` and `Settings → Security` change-password.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-26 | Hard-block trust-sensitive actions for `PENDING_EMAIL_VERIFICATION` (AUTH-015-001) | Aligns with TradeHub's trust-first positioning; soft-banner approach lets unverified users contaminate the platform with fake job posts and applications. |
| 2026-04-26 | Trust Google `email_verified=true` claim (AUTH-015-002) | Standard OIDC claim verified by Google's own provisioning. Re-verifying on our side adds friction with no security gain. |
| 2026-04-26 | Welcome email post-verify only (AUTH-015-003) | Two-email noise hurts onboarding metrics and confuses copy ("welcome" vs "please verify"). |
| 2026-04-26 | 12-char minimum password (AUTH-015-004) | ~~Balances NIST 800-63B with UX; blocklist (top-1000) covers the obvious-weak tail. 15+ would push users to managers we cannot guarantee.~~ **SUPERSEDED 2026-04-26 by composition-rules row below.** |
| 2026-04-26 | **REVISED:** 8-char minimum password with composition rules (lower + upper + digit + special), no blocklist (AUTH-015-004) | Owner preference: standard rules with a live UI checklist are clearer to end users than a 12-char minimum + opaque blocklist. The blocklist file (`backend/assets/password-blocklist.txt`) and `PASSWORD_BLOCKLIST_PATH` env var are removed. Frontend renders the rules via the `<PasswordRules>` component. |
| 2026-04-26 | Logout-all in `/settings/security` (AUTH-015-005) | Discoverable, semantically correct, and creates the Settings shell that future security features (2FA, sessions audit) will need. |
| 2026-04-26 | Explicit Google account linking (AUTH-015-006) | Silent linking is OWASP-flagged; explicit confirmation is the standard Auth0/Clerk pattern. |
| 2026-04-26 | Staff path-based for MVP, subdomain-ready (AUTH-D-001 / AUTH-016-001..003) | ~~Subdomain split adds CORS, cookie, and deploy complexity for ≤10 staff users. Env-flagged design keeps the migration path open without code changes.~~ **SUPERSEDED 2026-04-26 by row below.** |
| 2026-04-26 | **REVISED:** Staff on dedicated subdomain `internal.{domain}` from day one (AUTH-016-001..007) | Owner preference: clear surface separation matters more than the dev/deploy simplification. `internal.localhost` works in dev without `/etc/hosts` edits (RFC 6761), so the dev cost is just `vite server.host: true` plus the second CORS origin. Same React build serves both subdomains; hostname check at boot picks the route tree. |
| 2026-04-26 | Staff host gate uses `Origin` (browser-set) **OR** `Host`, not `Host` alone (AUTH-016-002 amended) | First implementation only checked `Host`, which broke when the SPA on `internal.localhost:3000` POSTed to `localhost:8081` — the `Host` header was the API hostname, not the SPA's. `Origin` is the browser-set identity of who is making the request and is the correct signal here. `Host` retained as a fallback for curl and reverse-proxy setups. |
| 2026-04-26 | Google OAuth state is signed by `GET /auth/google/start` (not by SPA) | Initial implementation expected the SPA to construct the signed `state` for CSRF — but the SPA does not have `JWT_SECRET`. Without a signature the role round-trip silently fell back to WORKER. New endpoint takes `?role=…&return_to=…` query params, builds and signs the state server-side, returns the full Google OAuth URL. SPA fetches that URL and redirects. |
| 2026-04-26 | Re-registration on a `PENDING_EMAIL_VERIFICATION` email is forgiving (auth.service.register) | First implementation threw `409 EMAIL_TAKEN` for any collision. UX-wise this is hostile to users who started signup, lost the email, and try again. The new behaviour: on PENDING collision, silently re-issue the verification email and return the standard `pending_verification: true` response. ACTIVE / DEACTIVATED collisions still throw `409 EMAIL_TAKEN` with a friendly message + Sign-in / Forgot-password CTAs in the UI. |
| 2026-04-26 | **Critical bug fix**: `GlobalExceptionFilter` preserves structured response bodies | Original filter stripped HttpException bodies down to `{ statusCode, message, timestamp }`, dropping `code`, `email`, embedded tokens, etc. This silently broke every typed error code on the SPA — e.g. login of an unverified account showed "wrong password" instead of "please verify your email" because the SPA never saw `code: EMAIL_NOT_VERIFIED`. New filter merges the full body into the response. |
| 2026-04-26 | Google OAuth state carries an `intent` (`'login'` vs `'register'`) (AUTH-015-006 amended) | Original implementation silently logged the user in when an existing google_id was found, regardless of whether they came from `/login` or `/register`. A user who registers as EMPLOYER, then visits `/register` and picks WORKER + Google ends up logged in as EMPLOYER with no warning. The signed `state` now includes the `intent`; on `intent=register` with an existing google_id, the backend redirects to `/oauth/callback?error=ACCOUNT_EXISTS&intent=register&email=…` and the SPA shows "you already have an account, sign in instead". |
| 2026-04-26 | New `POST /auth/change-password` (AUTH-008 extension) | Logged-in users could not change their password without going through forgot-password. New endpoint requires the current password, validates the new one through the shared policy, and revokes refresh-tokens on **other** devices (keeping the current device alive so the user isn't kicked mid-flow). UI lives in `/settings/security`. |
| 2026-04-26 | Admin-managed staff (new `StaffModule`) | Seed previously created both `admin@tradehub.co.uk` and `moderator@tradehub.co.uk`. New approach: seed only the admin. `POST /staff` (admin-only, role-gated) creates a staff Account + StaffMember with a randomly generated 16-char password, emails the credentials to the new staff member via `MailService.sendStaffInvite`. `GET /staff` lists staff; `DELETE /staff/:id` deactivates (status → DEACTIVATED + revoke all refresh tokens; cannot deactivate self). UI lives in `/settings/security` (admin-only section, gated by `account.staff_member.staff_role === 'ADMIN'`). |
| 2026-04-26 | Forgot-password for Google-only accounts sends a friendlier reminder | Anti-enumeration is preserved (same 200 response shape regardless of account state), but instead of the real owner getting silence we send `MailService.sendGoogleSignInReminder` — "this account uses Google, click Continue with Google". Attackers see no difference. |
| 2026-04-26 | Back link in `AuthShell` | Auth pages now show a small back arrow (icon-only, top-left of the viewport, with `aria-label`); hidden on the staff host where there is no marketplace to go back to. |
| 2026-04-26 | **Bug fix**: VerifyEmailConfirmPage StrictMode double-mount consumed the token twice | React 18 dev StrictMode mounts effects twice. Verify-email tokens are single-use, so the second invocation always saw `consumed_at != null` and surfaced `TOKEN_INVALID` for ~800 ms before the success-side timeout navigated away — which looked like an "expired token" flash to the user. Added a `useRef` guard so the effect runs at most once per page lifetime. |
| 2026-04-26 | **Behaviour fix**: Google sign-in with `intent=login` and no existing account now errors instead of silently creating a worker | Original implementation always created a brand-new account on Google callback when no `google_id`/email match existed. From the `/login` page this surprised users (clicking "Continue with Google" silently provisioned a worker account they never asked for). New behaviour: when `intent=login` and no account is found, the SPA receives `error=NO_GOOGLE_ACCOUNT` and renders a "Create a TradeHub account" CTA. `intent=register` still creates the account (per AUTH-015-002). |
| 2026-04-26 | **Behaviour fix (revises AUTH-015-006 partial silent linking)**: existing email + verified Google → auto-link instead of "explicit linking" screen | Original "always require password to link" was hostile when the user had a manually-created account and clicked Google — they got "we found an account, sign in with password" with no way to actually use Google going forward. New behaviour: if `byEmail` exists AND Google asserts `email_verified: true`, write `google_id` to that account and log in. If `email_verified` is missing or false (rare enterprise tenants), fall back to the explicit-linking screen. Auto-link also moves a PENDING account to ACTIVE, since Google verified the email. AUTH-015-006 amended in the spec to reflect the new policy. |
| 2026-04-26 | Registration name fields split by role (replaces single `display_name`) | Worker registration now collects **First name + Surname** (combined into `display_name`). Employer registration collects **Company name** (used as both `client_profile.display_name` and `employer_profile.company_name`). The `RegisterDto` now uses role-conditional validators (`@ValidateIf(o => o.role === 'WORKER')`). The `display_name` API field has been removed. |
| 2026-04-26 | Phone country picker on registration (with real flag images) | The `Phone` input on `RegisterPage` is now a dial-code dropdown plus a local-number input. Country list is the full ISO 3166-1 (`web/src/lib/countries.ts`), UK first. Flags load as raster images from `flagcdn.com` so they render the same on Windows / Linux / macOS / Mobile (Unicode flag emoji failed to render on the owner's Windows). Submit combines them into E.164 via `combinePhone()`. |
| 2026-04-26 | Confirm password field on registration (AUTH-019-003) | Mirrors the existing UX on ResetPasswordPage and SettingsSecurityPage — typo guard before the new password is committed. |
| 2026-04-26 | Members tab shows the staff list to ALL staff (AUTH-017) | Original implementation `@Roles('ADMIN')` on the entire StaffController. Owner request: moderators should be able to see the team, just not change anything. Read access (`GET /staff`) loosened to `@Roles('STAFF')`; mutations stay `@Roles('ADMIN')`. SPA hides mutation buttons when the signed-in user is not admin. |
| 2026-04-26 | Existing-client → staff promotion path (AUTH-018-001) | Original `POST /staff` rejected any email already in the DB with 409. Owner request: an existing worker / employer should be promotable to staff without losing their password. New behaviour: `ACTIVE` accounts with no `staff_member` get a `StaffMember` row attached (no password change, no invite expiry); they receive a "you've been promoted" email. PENDING / DEACTIVATED still rejected. |
| 2026-04-26 | Staff invite expiry — `staff_member.invite_expires_at` (AUTH-018-007) | Initial password is valid for 24 hours. After that, login returns `INVITE_EXPIRED` and admin must use "Resend invite". Once the staff member signs in (`account.last_login_at IS NOT NULL`), the expiry stops applying. |
| 2026-04-26 | Re-invite vs Reset-password are different operations (AUTH-018-002 / AUTH-018-003) | `Resend invite` is for never-signed-in accounts (regenerates pw + bumps expiry). `Reset password` is for accounts that have already signed in once (regenerates pw, no expiry). Frontend renders the right button based on `has_signed_in` flag from the API. |
| 2026-04-26 | Last-admin protection (AUTH-018-004 / AUTH-018-006) | Admin can deactivate or demote any other admin, but not the last `ACTIVE` admin in the system — that would lock the platform out of admin operations entirely. Self-actions (`CANNOT_DEACTIVATE_SELF`, `CANNOT_DEMOTE_SELF`) blocked separately. |
| 2026-04-26 | Staff cannot self-reset password — admin-mediated only (§11 amended) | Initial implementation routed staff `forgot-password` to a staff-host reset link. Owner preference: staff password recovery is admin-only. `forgotPassword()` now silently skips staff accounts (200 response preserved for anti-enumeration). Admin uses `POST /staff/:id/reset-password` instead, which generates a new password and emails it (same shape as the initial invite). Routes `/forgot-password` and `/reset-password` are removed from `StaffRouter`. |
| 2026-04-26 | Back link in `AuthShell` (revised: icon-only, top-left) | Initially rendered with text "Back to TradeHub" inline above the card. Owner preference: small arrow icon, top-left of the viewport, no text — minimum visual weight. Aria-label preserved for a11y. Hidden on the staff host. |
