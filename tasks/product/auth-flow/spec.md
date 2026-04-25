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

1. Visitor lands on a public page and can browse public marketplace content without signing in.
2. Visitor chooses `Sign up` and selects a role: `WORKER` or `EMPLOYER`.
3. Visitor creates an account with email/password or continues with Google.
4. TradeHub creates the account in a restricted pre-verification state and sends a verification email if needed.
5. User lands in a clear post-signup state:
   - either a verify-email screen
   - or a restricted dashboard/banner state if the product wants light access before verification
6. User verifies email ownership.
7. Account becomes fully active for normal marketplace actions.
8. Returning user signs in and is sent back to their intended destination.
9. If the user forgets their password, they request a reset email, open a single-use reset link, set a new password, then sign in normally.
10. User can log out of the current session or all sessions.
11. Staff uses the separate internal login flow and is routed to the internal admin area.

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
  - password
  - display name
  - role
- Phone remains optional in this feature and is not used as an auth factor.
- After signup, the user must receive a clear next step instead of being silently dropped into the product.
- Welcome messaging and verification messaging must be separate:
  - verification email first
  - welcome email only after verification, or removed until that milestone exists

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

- The product must include:
  - `Forgot password`
  - `Reset password`
- Forgot-password responses must not reveal whether an email address exists.
- Reset links must be single-use and time-limited.
- Resetting a password must not automatically log the user in.
- After a successful reset, the user signs in through the normal login flow.
- The product should invalidate existing sessions after a password reset, or ask the user whether to do so. MVP preference: invalidate all sessions automatically.

### 8. Session Management

- Access tokens may remain short-lived.
- Refresh tokens must be rotated on refresh.
- Current-session logout must reliably invalidate the current refresh token.
- Logout-all must revoke every active refresh token for that account.
- The UX must expose logout-all somewhere visible to the signed-in user, even if not in the first navbar iteration.
- The product must define one expected storage model for tokens in the SPA and treat it as an explicit tradeoff, not an accidental detail.

### 9. Password Policy

- Password policy for MVP:
  - minimum 12 characters
  - maximum at least 64 characters
  - allow spaces and standard printable characters
  - do not require arbitrary composition rules like "must include symbol + uppercase + number"
  - reject obviously weak or commonly used passwords via blocklist
- Password changes and resets must use the same policy.

### 10. Abuse Protection

- Auth endpoints need more than the app-wide generic throttle.
- Add auth-specific rate limits for:
  - login
  - signup
  - forgot password
  - verification resend
- Product should allow escalation to CAPTCHA or equivalent only after abuse signals. CAPTCHA is not required in the first implementation if rate limiting and monitoring are present.

### 11. Staff Authentication

- Staff login remains a separate entry point from marketplace auth.
- Staff users should not be routed through the worker/employer role flow.
- Staff login does not need Google auth in this feature.
- Staff session behavior should follow the same logout and logout-all rules unless there is a strong internal-only reason not to.

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

### 13. Analytics and Audit

- The product should capture at least basic auth events:
  - signup started
  - signup completed
  - verification email sent
  - verification completed
  - login succeeded
  - login failed
  - password reset requested
  - password reset completed
  - logout
  - logout-all
- Staff-visible audit detail is useful but not required in the first implementation if server-side logs exist.

## Edge Cases

- User signs up, closes the tab, and returns later without verifying
- User clicks an expired verification link
- User requests multiple verification emails; only the newest valid token should work
- User requests password reset for an email that does not exist
- User clicks an expired or previously used reset link
- User logs in on two devices, then uses logout-all
- User starts from a protected route and signs in with Google; intended redirect must still work
- Google login is enabled in the UI but credentials are missing in the environment
- Existing password user later chooses Google sign in with the same email
- Deactivated user attempts to log in
- Unverified user tries to create a job application, message, review, or referral directly via URL

## Acceptance Criteria

- A new worker or employer can sign up with email/password and is guided into a clear verification step.
- A new worker or employer can sign up with Google and preserve the chosen role.
- A newly created marketplace account is not treated as fully active for trust-sensitive actions before verification.
- Users can resend email verification safely.
- Users can request a password reset without learning whether an email exists.
- Users can reset a password with a single-use time-limited link and are then required to log in normally.
- Standard login returns users to their intended destination when applicable.
- Current-session logout reliably invalidates the current refresh token.
- Logout-all invalidates all active sessions.
- Staff can still sign in through the internal login route.
- If Google auth is unavailable in the environment, users are not presented with a broken Google sign-in path.
- Auth-specific abuse controls exist for login, signup, verification resend, and password reset.
- The UI has explicit states for unverified users instead of leaving them in a partially working account.

## Open Questions

- Should TradeHub allow any authenticated-but-unverified access beyond profile completion and resend-verification actions, or should the app hard-block almost everything until email verification is complete?
- Should Google-created accounts be considered verified immediately, or only when the provider verification signal is explicitly available and stored?
- Should welcome email be sent only after email verification, or is a two-email sequence acceptable for MVP?
- Should password policy be `12+` characters for usability or `15+` characters to align more closely with strict NIST single-factor guidance?
- Should logout-all be exposed in Profile, Settings, or a dedicated Security page?
- Does TradeHub want account linking to be silent when email matches, or explicitly confirmed by the user?
