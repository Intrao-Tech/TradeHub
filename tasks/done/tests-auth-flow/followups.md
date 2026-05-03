# Follow-ups

Bugs surfaced by the TEST-AUTH-* suite that this feature must NOT fix
(per the working principle: tests do not change Auth production code).
Each entry cites the failing test and the AUTH-NNN clause it broke against.

---

## FU-1 — staff initial-password generator may not meet AUTH-015-004

**Surfaced by:** `backend/src/common/validators/password-policy.spec.ts`
→ `TEST-AUTH-026 — 100 generations all satisfy checkPasswordPolicy`

**Cited clause:** AUTH-015-004 (REVISED 2026-04-26) — every password issued by
the platform (including staff invites) must meet the composition rules
(lower + upper + digit + special). AUTH-018-001 documents that the staff
generator must produce policy-compliant strings.

**What the test sees:** `StaffService.generateInitialPassword()` builds
the password via `crypto.randomBytes(12).toString('base64url').slice(0, 16)`.
`base64url`'s alphabet is `[A-Za-z0-9_-]` only, so the output never contains
a special character outside `_` and `-`, and on roughly half of all rolls
also omits at least one of {uppercase, lowercase, digit}. The cross-check
test asserts `failures: 0` over 100 rolls and reliably fails.

**Resolution:** out of scope for this feature. Open a separate fix that
either (a) generates from a charset that includes all four classes, or
(b) loops `generateInitialPassword` until `checkPasswordPolicy` is satisfied.
Update this entry with the fix PR/spec when picked up.

## FU-2 — refresh-token rotation can race within a 1-second window

**Surfaced by:** `backend/test/auth.refresh.e2e-spec.ts` and
`backend/test/auth.password-recovery.e2e-spec.ts` (mitigated in tests by
sleeping ≥1.1s between issuances).

**Cited clause:** AUTH-008 — refresh tokens MUST be rotated; logout-all MUST
revoke every active refresh token.

**What the test sees:** `AuthService.issueTokens()` derives the refresh
token from `jwt.sign({ sub, email, vs }, { secret: REFRESH_SECRET, expiresIn: '7d' })`.
The JWT carries only `iat`/`exp` claims at second granularity, so two
issuances for the same account within the same wall-clock second produce
**bytewise identical strings**. Two consequences:
1. `prisma.refreshToken.create` then violates the unique constraint on
   `token`, surfacing as a 500 to the SPA when the previous row has not
   yet been deleted (e.g. a second login while the first session is alive).
2. The "rotation" assertion that the new token differs from the old can
   succeed by accident only because of clock drift.

**Resolution:** out of scope for this feature. The Auth contract should
either (a) include a per-issuance random `jti` in the refresh JWT payload,
or (b) replace refresh-token contents with an opaque random string stored
in the DB (the JWT layer is unused for refresh today — verification only
checks the signature, not any claim). Update this entry with the fix PR
when picked up.

## FU-4 — `POST /auth/logout` is NOT idempotent on a missing body

**Surfaced by:** `backend/test/auth.refresh.e2e-spec.ts`
→ `TEST-AUTH-044 — logout invalidates the current refresh token (idempotent: 200 on missing too)`
(now marked `test.failing` so the suite stays green).

**Cited clause:** TEST-AUTH-017 spec text — "is a no-op if the SPA fails to
send the body (regression guard for the original frontend bug noted in
spec Problem section)". Contract §2 `POST /auth/logout`: "Idempotent —
unknown token returns 200".

**What the test sees:** `RefreshTokenDto.refresh_token` is annotated
`@IsString()` with no `@IsOptional()`. With the global `ValidationPipe`
running `whitelist: true, forbidNonWhitelisted: true`, an empty `{}` body
fails class-validator and the controller never runs — so the SPA gets a
400 instead of the contracted idempotent 200.

**Resolution:** out of scope. Mark the DTO field optional
(`@IsOptional() refresh_token?: string`) and let the service-side `if
(refreshToken)` guard remain the source of truth.

## FU-5 — `POST /auth/change-password` rejects the optional `refresh_token` field

**Surfaced by:** `backend/test/auth.password-recovery.e2e-spec.ts`
→ `TEST-AUTH-045 — change-password requires current password, revokes
OTHER-device sessions only` (now marked `test.failing`).

**Cited clause:** Contract §2 `POST /auth/change-password` body shape:
`{ current_password, new_password, refresh_token? }`. Decisions Log
2026-04-26 — "revokes refresh tokens on OTHER devices but keeps the
current device session alive". The SPA is supposed to pass its own
`refresh_token` to be excluded from the revoke set.

**What the test sees:** `ChangePasswordDto` does not declare
`refresh_token`, and the global `ValidationPipe` runs with
`forbidNonWhitelisted: true`. Any request that includes the contracted
`refresh_token` field is rejected with 400 before the controller runs,
making the "keep current device alive" guarantee unreachable today.

**Resolution:** out of scope. Add `refresh_token?: string` to
`ChangePasswordDto` with `@IsOptional() @IsString()` so the controller's
`@Body('refresh_token')` extractor sees the value.

## FU-6 — Auth rate limits (`@Throttle` decorators) are not enforced

**Surfaced by:** `backend/test/auth.rate-limit.e2e-spec.ts` (currently
`describe.skip` so the suite stays green).

**Cited clause:** AUTH-010 + Contract §6 throttle table — per-endpoint
rate limits on register / login / forgot-password / verify-resend /
reset-password / refresh / staff-login.

**What the test sees:** `AppModule` imports `ThrottlerModule.forRoot([…])`
but never registers `ThrottlerGuard` as `APP_GUARD`, so the per-route
`@Throttle({ default: { limit: N, ttl: T } })` decorators are inert.
Every test in the rate-limit spec failed because the 6th, 11th, etc.
request still returned 200/400 instead of 429.

**Resolution:** out of scope. Add to the `AppModule` providers:
`{ provide: APP_GUARD, useClass: ThrottlerGuard }` (and update the
spec to flip `describe.skip` back to `describe`).

## FU-7 — Playwright staff-invite spec needs a test-only admin-seed endpoint

**Surfaced by:** `web/e2e/auth.staff-invite.spec.ts` (currently `test.fixme`).

**Cited clause:** TEST-AUTH-104 — "admin in context A creates staff via
`/admin` … staff member in context B receives invite mail, signs in via the
staff host, lands on `/admin`."

**What the test needs:** the first staff member in a fresh DB has no
existing admin to bootstrap from. Today every `/staff` mutation requires a
`@Roles('ADMIN')` bearer token. To exercise this flow end-to-end via the
SPA we either (a) seed an admin directly through a test-only HTTP route
(e.g. `POST /test/seed/admin`), or (b) bake an admin into a Playwright
`storageState` once at globalSetup time using the same Prisma factory the
backend e2e suite uses.

**Resolution:** out of scope. Add the seed endpoint behind the same
`NODE_ENV === 'test'` gate as the test mailbox controller, or extend
`web/e2e/global-setup.ts` to commit the admin row before Playwright starts.
Until then, `auth.staff-invite.spec.ts` is `test.fixme` and the
corresponding backend e2e (`backend/test/staff.lifecycle.e2e-spec.ts`,
TEST-AUTH-048) is the regression guard for the contracted behaviour.

## FU-3 — `bogus-token` minimum length enforced before TOKEN_INVALID can fire

**Surfaced by:** `backend/test/auth.verify-email.e2e-spec.ts` (test now
sends a 16+ char placeholder so the controller-level validator passes
and the service-level TOKEN_INVALID branch runs).

**Cited clause:** AUTH-006 + Decisions Log 2026-04-26 (StrictMode fix) —
the SPA must always see a structured `code` on error so the useRef-guarded
double-mount can branch on the code value.

**What the test sees:** `ConfirmVerifyEmailDto.token` has `@MinLength(16)`,
so a short token is rejected by `ValidationPipe` BEFORE the service runs,
yielding the class-validator response shape (`{ statusCode, message: [],
error: 'Bad Request' }`) — no `code` field. From the SPA side this looks
identical to a "real" backend error from a different endpoint, breaking
the invariant that verify-email errors are distinguishable from generic
400s. Workaround in test: send a 32-char garbage token. Real fix: either
shrink the MinLength, or have the validator return `{ code: 'TOKEN_INVALID' }`
shaped errors for this DTO.
