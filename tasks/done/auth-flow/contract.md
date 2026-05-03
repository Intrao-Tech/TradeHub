# Contract — auth-flow

Concrete technical decisions for implementation. Sealed on **2026-04-26**.

This document is **the single source of API shapes, env vars, DB columns, and routing rules** for auth. Any deviation in code is a bug. Any change to this document must come with a matching update in `spec.md` (Decisions Log) per the working principle in repo `CLAUDE.md`.

---

## 1. Account state model

### Prisma migration

```prisma
model Account {
  id                  BigInt    @id @default(autoincrement())
  email               String    @unique @db.VarChar(255)
  password_hash       String?   @db.VarChar(255)
  google_id           String?   @unique @db.VarChar(100)
  phone               String?   @db.VarChar(20)
  phone_verified      Boolean   @default(false)
  status              String    @default("PENDING_EMAIL_VERIFICATION") @db.VarChar(30)  // ← change default
  email_verified_at   DateTime? @db.Timestamptz()                                        // ← new
  created_at          DateTime  @default(now()) @db.Timestamptz()
  updated_at          DateTime  @updatedAt @db.Timestamptz()
  last_login_at       DateTime? @db.Timestamptz()
  // … relations unchanged …
  email_verification_tokens EmailVerificationToken[]
  password_reset_tokens     PasswordResetToken[]
}
```

Allowed `status` values:
- `PENDING_EMAIL_VERIFICATION` — created, no email proof
- `ACTIVE` — full marketplace access
- `DEACTIVATED` — soft-delete; cannot authenticate

Migration name: `add_email_verification_state`. Backfill rule: every existing `account` row gets `status = 'ACTIVE'` and `email_verified_at = created_at` (we trust the seed + existing prod users; new accounts go through the verification flow). `account.status` index added on `(status)`.

### New tables

```prisma
model EmailVerificationToken {
  id          BigInt   @id @default(autoincrement())
  account_id  BigInt
  token_hash  String   @unique @db.VarChar(64)   // sha256 of the random token (hex)
  expires_at  DateTime @db.Timestamptz()
  consumed_at DateTime? @db.Timestamptz()
  created_at  DateTime @default(now()) @db.Timestamptz()

  account Account @relation(fields: [account_id], references: [id], onDelete: Cascade)

  @@index([account_id])
  @@map("email_verification_token")
}

model PasswordResetToken {
  id          BigInt   @id @default(autoincrement())
  account_id  BigInt
  token_hash  String   @unique @db.VarChar(64)
  expires_at  DateTime @db.Timestamptz()
  consumed_at DateTime? @db.Timestamptz()
  created_at  DateTime @default(now()) @db.Timestamptz()

  account Account @relation(fields: [account_id], references: [id], onDelete: Cascade)

  @@index([account_id])
  @@map("password_reset_token")
}
```

Token format: 32 random bytes → URL-safe base64 (raw token sent in email link, sha256 hex stored as `token_hash`). TTL: 24h for verification, 1h for password reset. Single-use enforced via `consumed_at` (any non-null = invalid). On successful consumption, the row stays for audit, but cannot be re-used.

### Staff invite expiry

`StaffMember.invite_expires_at` (`DateTime?`) — set to `now() + 24h` when an admin creates a brand-new staff account or re-invites a never-signed-in one. Promotion of an existing client account does NOT set this (the user already has a usable password). On staff login the gate fires when: `invite_expires_at` is set AND `account.last_login_at IS NULL` AND `invite_expires_at < now()` → `401 INVITE_EXPIRED`. Migration name: `add_staff_invite_expiry`.

---

## 2. Endpoints

### `POST /auth/register`

Body:
```json
{
  "email": "string",
  "password": "string",
  "role": "WORKER" | "EMPLOYER",
  "first_name": "string?",     // required when role=WORKER
  "surname": "string?",        // required when role=WORKER
  "company_name": "string?",   // required when role=EMPLOYER
  "phone": "string?"           // E.164 (e.g. "+447700900123") — combined client-side from country picker
}
```
Backend builds `client_profile.display_name` from the role-specific fields. For employer, `company_name` is also written to `employer_profile.company_name`.

Response `201`:
```json
{ "pending_verification": true, "email": "user@example.com" }
```
*No tokens returned. The user is `PENDING_EMAIL_VERIFICATION`. If the email already exists in `PENDING_EMAIL_VERIFICATION`, the verification email is silently re-issued with the same response shape (forgiving re-attempt).*

Errors:
- `400 EMAIL_TAKEN` — generic message "we couldn't create the account" (anti-enumeration); 200 OK + same body shape if you choose enumeration-resistance fully (decision: use 400 with generic copy, log the real reason)
- `400 WEAK_PASSWORD { reasons: Array<'too_short'|'too_long'|'no_lowercase'|'no_uppercase'|'no_digit'|'no_special'> }`
- `400 VALIDATION` for class-validator failures

Side effects: account row, client_profile row, worker_profile or employer_profile row, email_verification_token row, send verification email. **No welcome email yet.**

### `POST /auth/verify-email/send`

Body: `{ "email": "string" }`

Response `200`: `{ "ok": true }` — always, even if email does not exist (anti-enumeration). Per-IP throttle: 5/hour. Per-account throttle: 3/hour.

### `POST /auth/verify-email/confirm`

Body: `{ "token": "string" }`

Response `200`:
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "account": {
    "id": "...",
    "email": "...",
    "is_worker": true,
    "is_employer": false,
    "is_staff": false,
    "verification_state": "ACTIVE"
  }
}
```
Side effects: `account.status = ACTIVE`, `account.email_verified_at = now()`, token consumed, send welcome email.

Errors:
- `400 TOKEN_INVALID` — covers expired, consumed, unknown
- Generic copy on the UI; the API distinguishes only for audit logs

### `POST /auth/login`

Body: `{ "email": "string", "password": "string" }`

Response `200`:
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "account": {
    "id": "...",
    "email": "...",
    "is_worker": true,
    "is_employer": false,
    "is_staff": false,
    "verification_state": "PENDING_EMAIL_VERIFICATION" | "ACTIVE"
  }
}
```

Errors (intentional ambiguity):
- `401 INVALID_CREDENTIALS` — wrong email **or** wrong password (single shape, no oracle)
- `403 ACCOUNT_DEACTIVATED` — `status === 'DEACTIVATED'`. No tokens issued.
- `403 EMAIL_NOT_VERIFIED { email }` — `status === 'PENDING_EMAIL_VERIFICATION'`. **Tokens still issued** (so the user can hit verify-email/send) but the SPA must route to `/verify-email`. Backend `AccountStateGuard` blocks trust-sensitive routes regardless.

### `POST /auth/refresh`

Body: `{ "refresh_token": "string" }` → rotates: deletes the input row, issues a new pair.

Response `200`: `{ access_token, refresh_token }`. Errors: `401 REFRESH_INVALID`.

### `POST /auth/logout`

Body: `{ "refresh_token": "string" }` (frontend must include; current bug at `App.tsx:83` is fixed by this).

Response `200`: `{ ok: true }`. Idempotent — unknown token returns `200`.

### `POST /auth/logout-all`

Auth: bearer. No body. Deletes every refresh_token row for the account.

Response `200`: `{ revoked: <int> }`.

### `POST /auth/staff/login`

Same shape as `/auth/login`, but:
- Rejects accounts without `staff_member` row
- Returns only `is_staff: true` flag (worker/employer flags omitted)
- Host check: backend middleware reads `req.headers.host`. If `STAFF_LOGIN_HOST` is set (it is in dev and prod per AUTH-016-002) and host header does not match → respond `404 Not Found` **before route matching**. Implementation note: middleware, not guard — guards run after routing.
- No Google option in UI (AUTH-011)

### `GET /auth/google/start` + `GET /auth/google/callback`

The SPA cannot construct a signed `state` (it has no `JWT_SECRET`). Two-step flow:
- **Step 1 — `GET /auth/google/start?role=…&return_to=…&intent=…`** (public) builds `state = base64url(json).hmac` with `intent ∈ {'login','register'}` + `role` + `return_to`, returns `{ redirect_url }` — the full Google OAuth URL with the signed state baked in. The SPA navigates to that URL.
- **Step 2 — `GET /auth/google/callback`** (Google's redirect target). Verifies the HMAC, extracts intent / role / return_to, calls `handleGoogleLogin`. On callback, if Google ID-token `email_verified === true` → account created in `ACTIVE` and `email_verified_at = now()`. If `email_verified !== true` → `PENDING_EMAIL_VERIFICATION` + verification email sent.
- Same-email collision (existing password account, no `google_id` yet) AND Google `email_verified === true` → **auto-link** `google_id` to the existing account and sign in (revised AUTH-015-006). If Google `email_verified !== true` → redirect to `/oauth/callback?error=ACCOUNT_EXISTS&email=…&intent=…` for the explicit linking screen.
- `intent === 'register'` AND `google_id` already linked → `error=ACCOUNT_EXISTS&intent=register` (don't silently log in).
- `intent === 'login'` AND no account anywhere → `error=NO_GOOGLE_ACCOUNT` (don't silently create).

### `GET /auth/providers`

Public. Returns `{ google: boolean }` based on whether `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Frontend hides Google buttons when `false`.

### `POST /auth/forgot-password`

Body: `{ "email": "string" }`. Always `200 { ok: true }` (anti-enumeration). Per-IP throttle 5/hour, per-email throttle 3/hour. Behaviour:
- Marketplace user with password → issue token, send reset email.
- Google-only user (no password) → send `MailService.sendGoogleSignInReminder`.
- **Staff account → silently no-op** (admin-mediated reset only — see `POST /staff/:id/reset-password`).
- Email doesn't exist or status is `DEACTIVATED` → no-op.

### `POST /auth/reset-password`

Body: `{ "token": "string", "password": "string" }`. Validates token, applies password (same policy as register), consumes token, **revokes all refresh_tokens for the account**, returns `200 { ok: true }`. **Does not log the user in.**

Errors: `400 TOKEN_INVALID`, `400 WEAK_PASSWORD`.

### `POST /auth/change-password`

Auth: bearer. Body: `{ "current_password": "string", "new_password": "string", "refresh_token": "string?" }`. Verifies current password, applies the new one, **revokes refresh tokens on OTHER devices** (current device stays signed in if the SPA passes its current `refresh_token`).

Errors: `401 INVALID_CURRENT_PASSWORD`, `400 WEAK_PASSWORD { reasons }`, `400 SAME_PASSWORD`, `400 NO_PASSWORD_SET` (Google-only account).

### Staff endpoints (`/staff/*`)

All under `JwtAuthGuard + RolesGuard`. **Read** is `@Roles('STAFF')` (admin + moderator); **mutations** are `@Roles('ADMIN')`.

- `GET /staff` → `StaffRow[]` with `{ id, email, display_name, staff_role, status, last_login_at, created_at, invite_expires_at, invite_active, invite_expired, has_signed_in }`.
- `POST /staff` body `{ email, display_name, staff_role: 'ADMIN'|'MODERATOR' }` — create or promote (per AUTH-018-001). Errors: `409 ALREADY_STAFF`, `409 ACCOUNT_DEACTIVATED`, `409 ACCOUNT_NOT_VERIFIED`. Response includes `promoted_existing_account: true` flag when the path was promotion.
- `POST /staff/:id/reinvite` — only when `last_login_at IS NULL`. Errors: `409 STAFF_ALREADY_USED`, `409 ACCOUNT_DEACTIVATED`.
- `POST /staff/:id/reset-password` — admin force-reset for already-signed-in staff. Errors: `409 ACCOUNT_DEACTIVATED`.
- `PATCH /staff/:id/role` body `{ staff_role: 'ADMIN'|'MODERATOR' }`. Errors: `400 NO_CHANGE`, `403 CANNOT_DEMOTE_SELF`, `403 LAST_ADMIN`.
- `POST /staff/:id/reactivate`. Errors: `400 ALREADY_ACTIVE`.
- `DELETE /staff/:id` — soft-delete (status → DEACTIVATED + revoke refresh tokens). Errors: `400 ALREADY_DEACTIVATED`, `403 CANNOT_DEACTIVATE_SELF`, `403 LAST_ADMIN`.

---

## 3. Account-state guard

New file: `backend/src/common/guards/account-state.guard.ts`. Applied via `@RequiresVerifiedEmail()` decorator on controllers/methods.

Logic:
- Reads `req.user.verification_state` (added to JWT payload — see below).
- If `PENDING_EMAIL_VERIFICATION` → `403 EMAIL_NOT_VERIFIED`.
- If `DEACTIVATED` → `403 ACCOUNT_DEACTIVATED`.
- If `ACTIVE` → pass.

Apply to: `JobPostController`, `JobApplicationController`, `ConversationController` (POST endpoints), `CollaborationController` (POST), `ReferralController` (POST), `ReviewController` (POST), `EscrowController` (POST), `VerificationController.start` (POST). **Do not** apply to: `AccountController.getMe`, `AuthController.*`, `DocumentController.upload`, `ClientProfileController.updateMe`, `WorkerProfileController.updateMe`, `EmployerProfileController.updateMe`, `PortfolioController.*`.

JWT payload shape (extend existing):

```ts
{
  sub: accountId,           // existing
  email: string,            // existing
  vs: 'PENDING_EMAIL_VERIFICATION' | 'ACTIVE',  // new — short key for size
  iat, exp                  // existing
}
```

`JwtStrategy` reads `vs` and exposes `verification_state` on `req.user`. On status change (verify, deactivate, reset-password) the access token does NOT auto-refresh — the user gets a stale flag for up to `JWT_ACCESS_TTL` (15min). Acceptable for MVP; refresh produces a fresh one.

---

## 4. Token storage (frontend)

**Decision: keep `localStorage` for MVP.** Pros: zero CORS work, no cookie domain concerns (esp. for the future subdomain swap), refresh flow already wired. Cons: XSS-readable. Mitigation: strict CSP in production deployment + SPA hygiene (no `dangerouslySetInnerHTML` on user input — which we already follow). Phase 2 (post-MVP) — revisit with httpOnly cookies + CSRF token strategy.

Backend `enableCors()` stays open for dev, must be tightened in prod (`origin: [FRONTEND_URL, STAFF_FRONTEND_URL].filter(Boolean)`).

---

## 5. Post-login routing (frontend)

Implements AUTH-014-002. Single helper in `web/src/lib/auth-routing.ts`:

```ts
export function postAuthRedirect(account: AccountSummary, next: string | null): string {
  if (next && isSafeNext(next)) return next;
  if (account.is_staff) return '/internal/admin';
  if (account.verification_state === 'PENDING_EMAIL_VERIFICATION') return '/verify-email';
  if (account.verification_state === 'DEACTIVATED') return '/login?reason=deactivated';
  return '/profile';   // worker or employer, ACTIVE → land on own profile per profiles spec
}

function isSafeNext(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}
```

Used by: `LoginPage`, `RegisterPage` (after verify), `OAuthCallbackPage`, `InternalLoginPage`, `ResetPasswordPage` redirects.

---

## 6. Rate limits

`@nestjs/throttler` per-route decorators. Override the global 60/min:

| Endpoint | Limit | Window |
|---|---|---|
| `/auth/register` | 5 | 1 hour per IP |
| `/auth/login` | 10 | 5 min per IP, additionally 5 / 15min per email |
| `/auth/staff/login` | 5 | 5 min per IP |
| `/auth/verify-email/send` | 5 | 1 hour per IP, 3 / 1 hour per account |
| `/auth/forgot-password` | 5 | 1 hour per IP, 3 / 1 hour per email |
| `/auth/reset-password` | 10 | 1 hour per IP |
| `/auth/refresh` | 30 | 5 min per IP |

CAPTCHA not in MVP. Plan B if these aren't enough: log + alert when a single IP hits the limit.

---

## 7. Environment variables (additions)

Token TTLs are hard-coded in `auth.service.ts` constants (`VERIFY_TOKEN_TTL_MS = 24h`, `RESET_TOKEN_TTL_MS = 1h`, `INVITE_TTL_MS = 24h` in `staff.service.ts`). No env var needed for MVP.

```bash
# ── Staff subdomain (REQUIRED — gating dev mirrors prod) ──
STAFF_LOGIN_HOST="internal.localhost"               # dev. Prod: "internal.tradehub.co.uk"
STAFF_FRONTEND_URL="http://internal.localhost:3000" # dev. Prod: "https://internal.tradehub.co.uk"

# ── CORS (existing FRONTEND_URL + new staff origin) ──
FRONTEND_URL="http://localhost:3000"                # dev marketplace. Prod: "https://app.tradehub.co.uk"
```

```bash
# web/.env additions
VITE_STAFF_BASE_URL="http://internal.localhost:3000"   # dev. Prod: "https://internal.tradehub.co.uk"
```

`backend/src/main.ts` `enableCors()` whitelist must include both `FRONTEND_URL` and `STAFF_FRONTEND_URL`.

`web/vite.config.ts` must set `server.host: true` so Vite binds `0.0.0.0` and `internal.localhost:3000` resolves to it. Without this, the dev server only listens on `127.0.0.1` for the literal `localhost` hostname and `internal.localhost` requests fail.

---

## 8. Mail templates

All templates rendered inline in `backend/src/mail/mail.service.ts` (no template files for MVP). Methods:
- `sendVerificationEmail(to, displayName, confirmUrl)` — CTA "Confirm email" with `${FRONTEND_URL}/verify-email/confirm?token=${token}`, expiry "24 hours".
- `sendPasswordReset(to, displayName, resetUrl)` — CTA "Reset password" with `${FRONTEND_URL}/reset-password?token=${token}`, expiry "1 hour".
- `sendWelcome(to, displayName)` — sent only after email verification completes (or after a trusted Google signup).
- `sendGoogleSignInReminder(to, displayName)` — sent on `forgot-password` for Google-only accounts ("use Continue with Google").
- `sendStaffInvite(to, displayName, initialPassword, inviteExpiresAt)` — initial password + 24h expiry, link to `${STAFF_FRONTEND_URL}/login`.
- `sendStaffPromotion(to, displayName, staffRole)` — sent when an existing client account is promoted to staff. **No password included** (the user keeps their existing one).
- `sendStaffPasswordReset(to, displayName, newPassword)` — admin-issued password reset for staff who already signed in.
- `sendEscrowFunded(to, displayName, escrowId, amountGbp)` — pre-existing escrow lifecycle email, untouched.

Transport: `nodemailer` with Gmail SMTP (`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`). When `SMTP_USER` or `SMTP_PASS` is empty, `MailService` logs `Mail skipped (disabled)` instead of sending — no break in dev.

---

## 9. Audit events

Written to `audit_log` via existing `AuditService`:

| Event | When |
|---|---|
| `auth.signup.started` | request received, before any DB write |
| `auth.signup.completed` | account row created (`metadata.provider: 'google'` for OAuth signups) |
| `auth.verify_email.sent` | verification email enqueued |
| `auth.verify_email.completed` | token consumed, status flipped |
| `auth.login.succeeded` | tokens issued (`metadata.surface: 'staff'` for `/auth/staff/login`) |
| `auth.login.failed { reason }` | INVALID_CREDENTIALS / EMAIL_NOT_VERIFIED / ACCOUNT_DEACTIVATED / INVITE_EXPIRED — `account_id` is null on bad-email |
| `auth.password_reset.requested` | forgot-password — even when email doesn't exist, with `account_id: null` |
| `auth.password_reset.completed` | new password set via reset token |
| `auth.password_changed` | logged-in change-password flow |
| `auth.logout` | refresh_token revoked |
| `auth.logout_all { revoked: int }` | bulk revoke |
| `auth.google.linked { via }` | `google_id` attached to existing account (`via: 'auto_link_verified_email'` is the only emitter today) |
| `staff.created` | brand-new staff account |
| `staff.promoted_existing` | existing client account elevated to staff |
| `staff.reinvited` | admin re-issued initial password (never-signed-in only) |
| `staff.password_reset` | admin force-reset (already-signed-in staff) |
| `staff.role_changed { from, to }` | promote / demote between ADMIN and MODERATOR |
| `staff.deactivated` | status → DEACTIVATED + refresh tokens revoked |
| `staff.reactivated` | status → ACTIVE |

`ip_address` populated from `req.ip` for all of the above.

---

## 10. Pages and components added

### New pages (`web/src/pages/`)

- `VerifyEmailPage.tsx` — landing after register / on `/verify-email`. Shows "We sent a link to {email}", "Resend" button, signed-in-but-unverified support
- `VerifyEmailConfirmPage.tsx` — at `/verify-email/confirm?token=...`. Auto-runs confirm on mount, shows success/expired states with recovery actions
- `ForgotPasswordPage.tsx` — at `/forgot-password`. Single email input, generic success copy
- `ResetPasswordPage.tsx` — at `/reset-password?token=...`. New password input with policy hints, redirects to `/login?reason=password_changed` on success
- `SettingsSecurityPage.tsx` — at `/settings/security`. "Sign out of all devices" button, future home for 2FA / sessions audit. Lazy-loaded.

### New pages added since first draft

- `SettingsSecurityPage.tsx` — also home of the change-password form (current + new + confirm) for any signed-in user (worker / employer / staff).

### Updated pages

- `LoginPage.tsx` — error mapping (`INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED` banner with "Resend", `ACCOUNT_DEACTIVATED`), `next` param, hide Google CTA when `providers.google === false`, `?reason=expired|password_changed|deactivated|logged_out|verified` banners on mount.
- `RegisterPage.tsx` — role-conditional name fields (First name + Surname for worker / Company name for employer), `<PasswordRules>` live feedback, Confirm password field, `<PhoneInput>` country picker, on success route to `/verify-email?email=…`.
- `OAuthCallbackPage.tsx` — handles `error=ACCOUNT_EXISTS&intent=…` (linking / "you already have an account" copy varies by intent) and `error=NO_GOOGLE_ACCOUNT` (CTA "Create a TradeHub account").
- `InternalLoginPage.tsx` — staff-only entry, no Google CTA, no "Forgot password?" link (replaced with hint pointing user to admin), `INVITE_EXPIRED` error mapping.
- `AdminPage.tsx` — new **Members** tab (between Moderation and Documents) wrapping `<StaffManagementCard>`.
- `App.tsx` — split into `MarketplaceRouter` and `StaffRouter` based on `IS_STAFF_HOST`. Marketplace router handles `/internal/*` stragglers via `MarketplaceInternalBounce` (window.location.replace to `STAFF_BASE_URL`). Staff router has only `/login` + `/admin` + `/settings/security`. `handleLogout` sends `{ refresh_token }` in body.
- `api.ts` — rich `ApiError` class + `parseApiError()` helper; on refresh failure redirects to `/login?reason=expired`.
- `vite.config.ts` — `server.host: true` so `internal.localhost:3000` resolves in dev.

### New shared

- `web/src/lib/auth-routing.ts` — `postAuthRedirect`, `isSafeNext`
- `web/src/lib/password-policy.ts` — `checkPassword(value)` + `PASSWORD_RULES[]` (composition rules, mirrors backend)
- `web/src/lib/host.ts` — `IS_STAFF_HOST`, `STAFF_BASE_URL` for the marketplace ↔ staff subdomain split
- `web/src/lib/countries.ts` — full ISO 3166-1 list with dial codes
- `web/src/components/AuthBanner.tsx` — reusable banner for `EMAIL_NOT_VERIFIED`, `ACCOUNT_DEACTIVATED`, `password_changed`, `expired`, `verified`, `logged_out` reasons
- `web/src/components/PasswordRules.tsx` — live rules list (green check / amber circle as user types)
- `web/src/components/PhoneInput.tsx` — country picker (flag image from flagcdn.com) + local number; `combinePhone()` to E.164
- `web/src/components/StaffManagementCard.tsx` — Members tab CRUD (create / promote / re-invite / reset-password / role / reactivate / deactivate)

---

## 11. Acceptance pre-flight

Before marking AUTH-* requirement done:
1. `cd backend && npm run lint` and `npx prisma format` clean
2. `cd web && npm run lint:tokens` clean (no raw hex / default Tailwind classes)
3. `cd web && ./node_modules/.bin/vite build` clean (no TS errors)
4. Manual smoke: register → verify email → login → logout-all → login → forgot password → reset → login. Both light and dark mode, at 375px and desktop. Both worker and employer roles. Plus staff path.
5. Swagger `/api/docs` visually checked for new endpoints with correct request/response shapes.
