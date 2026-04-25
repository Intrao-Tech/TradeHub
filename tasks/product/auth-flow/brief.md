# Brief

## Feature

Auth flow foundation for TradeHub MVP.

## Problem

TradeHub is positioned as trust infrastructure for UK construction trades, but the current auth layer is still MVP-grade. Users can create and access accounts without email verification, there is no password reset flow, Google sign-in behavior is inconsistent with the main web flow, and logout/session behavior is not fully reliable in the frontend.

This creates a product mismatch:

- trust starts too early
- account recovery is missing
- session behavior is hard to reason about
- worker and employer onboarding is only partially defined

## Goal

Define one production-ready auth feature that covers the full entry and recovery lifecycle for workers, employers, and staff:

- sign up
- sign in
- Google sign in
- email verification
- forgot/reset password
- logout and logout-all
- post-auth redirect and restricted access rules

## Users

- Worker
- Employer
- Staff / Admin

## Expected Outcome

TradeHub has a clear auth spec that product, backend, frontend, and AI agents can implement consistently. A new user understands how to enter the platform, prove email ownership, recover access, and safely end sessions. The spec should support TradeHub's trust-first positioning without pulling unrelated profile or KYC work into the same task.

## Constraints

- Keep the existing role split: `WORKER` and `EMPLOYER`
- Support both email/password and Google sign in
- Keep staff login separate from marketplace login
- Do not include MFA in this feature
- Do not include phone OTP in this feature
- Do not include KYC, Stripe, or profile-completion flows beyond what auth needs
- The current stack is NestJS API + React SPA
