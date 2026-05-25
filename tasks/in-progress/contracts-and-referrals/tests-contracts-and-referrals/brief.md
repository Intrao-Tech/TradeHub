# Brief — Tests for Contracts & Referrals

## Feature

Test coverage for the shipped Contracts & Referrals refactor
(`tasks/in-progress/contracts-and-referrals/`).

## Problem

The Contracts & Referrals feature ships **without** an automated suite. Every
requirement in `spec.md` (`CR-NNN`) is currently regression-protected only by
manual smoke during development. Several of those requirements are subtle and
high-risk:

- **`computeMilestoneCommissions` cap math** — a regression here means the
  platform pays more than its fee on a release, going *negative* on revenue.
  Worked examples in `notes.md` show the proportional scaling and pence
  rounding edge cases. Mistakes here are silent (no error, just wrong money).
- **Self-ref / mismatch guards** (`CR-100..CR-105`) — these are silent
  no-ops by design; a regression that *enables* attribution where it shouldn't
  be is invisible to the user but lets people farm their own ref code.
- **Intent attribution flow** (`CR-031..CR-038`) — a regression that picks
  the wrong intent row (e.g. expired, wrong target_id, wrong actor),
  fails the W2W backfill from JobApplication, or mis-attributes during
  signup races silently routes commissions to the wrong account. The old
  cookie-based draft of these requirements was replaced 2026-05-10 with
  the server-side `ReferralIntent` model.
- **Hire-again invariant** (`CR-024`) — must *refuse* if any in-flight
  contract exists. A regression that allows two ACTIVE contracts under one
  collab corrupts the lockstep escrow flow downstream.
- **End-contract blocking** (`CR-021`) — must refuse if any milestone is
  `FUNDED`/`SUBMITTED`/`DISPUTED`/`RELEASE_FAILED`. A regression here lets
  the contract end with money in flight, orphaning the escrow row.
- **Live transfer fallback** (`CR-042`, post-followup) — when the live
  Stripe transfer rejects (e.g. account deauthorized between webhook and
  release) the code must fall back to PendingReferralPayout, not lose the
  commission. The catch+fallback path is entirely untested.
- **Backfill sweep** (`CR-followup`) — `payPendingReferralPayouts` runs on
  every `account.updated` webhook. It must be idempotent and skip already-PAID
  rows. Without tests, a duplicate webhook can double-pay.

## Why now

- Escrow contract refactor is shipped to dev. It needs to harden before any
  real customer money flows.
- Subcontract has been deleted entirely. Anyone who pulls and finds the old
  `Referral`/`ReferralOffer` UI gone needs a clear signal it was replaced by
  the new model — tests + spec doc serve that signal.
- The legacy escrow tests (`tests-escrow/`) reference fields that no longer
  exist (`Collaboration.status`, `Collaboration.referral_id`,
  `EscrowTransaction.collaboration_id`). They're broken; a fresh test
  pass replaces them rather than patching incrementally.

## Goal

Lock the Contracts & Referrals contract behind an automated test suite that:

- Runs in CI against Postgres in a Testcontainer (real DB, real Prisma).
- Exercises every `CR-NNN` Must requirement at unit + integration layers.
- Stripe is mocked (in-memory `STRIPE_CLIENT` mock) — no live API calls in CI.
- Produces a `coverage-matrix.md` showing 1:1 mapping `CR-NNN ↔ TEST-CR-NNN`
  with green status.

## Out of scope

- E2E browser tests for the `/referrals`, `/contracts/:id`,
  `/collaborations/:id` UIs — Playwright surface is deferred to its own
  follow-up (`tests-cr-playwright`) once UX stabilises.
- Load tests on the commission-cap math at high QPS.
- Real Stripe webhook signature verification — covered by existing escrow
  tests via `stripe-mock`.

## Success criteria

- `npm test` in `backend/` includes new `cr.*.spec.ts` files and they pass.
- `coverage-matrix.md` shows every `CR-NNN (Must)` row green.
- `npm run lint` and `tsc --noEmit` clean.
