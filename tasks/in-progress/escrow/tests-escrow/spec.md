# Spec — tests-escrow

> **Placeholder draft.** This file gets fleshed out parallel to Slice A of the parent feature implementation. Real `TEST-ESCROW-NNN` cases are added as implementation lands. Per `PROMPTS.md §2`, this file is the contract for the testing session that runs alongside implementation.

## Summary

Test suite for `tasks/in-progress/escrow/`. Maps 1:1 to `ESCROW-NNN` requirements via `coverage-matrix.md`. Layers tagged on each case: U / E2E-B / E2E-WH / F / PW.

## Test infrastructure

### Stripe API isolation

- **Never use the real Stripe API in tests.** All tests run against `stripe-mock` (official Stripe Docker image).
- `docker-compose.test.yml` boots `stripe-mock` on port 12111. CI step waits for healthcheck before running e2e.
- Backend test setup overrides `STRIPE_CLIENT` to point at `http://localhost:12111` when `NODE_ENV === 'test'`.
- Webhook signature verification uses test-mode `whsec_` secret loaded from `.env.test`.

### Time isolation

- Auto-release cron job (7-day silent) tested via injectable `Clock` interface — `vi.useFakeTimers()` for unit tests, `Clock` provider override for e2e.
- All `now()` calls in service code go through the injected clock, never `new Date()` directly.

### Currency precision

- Tests assert pence-level precision via `toMatchObject({ amount: '500.00' })` (string match) — no JS Number drift.
- Stripe API boundary converts Decimal → Int (pence) only at the call site; tests verify the conversion is correct for representative amounts (£0.05, £5.00, £999.99, £20000.00).

## Layer breakdown

### U — Unit tests

Pure functions in `escrow.service.ts`:
- `computePayouts(amount, settings) → { worker, platform, referral, stripe_estimate }`
- `validateStateTransition(from, to) → boolean`
- `isIdempotencyKey(...)` etc.

Vitest, no DB, no HTTP. ~30 cases expected.

### E2E-B — Backend e2e

Nest test app + `stripe-mock` container. Hits real HTTP endpoints. Asserts DB state + Stripe call signatures.

Files (one per major flow):
- `connect-onboarding.e2e-spec.ts`
- `escrow-fund.e2e-spec.ts`
- `escrow-release.e2e-spec.ts`
- `escrow-auto-release.e2e-spec.ts`
- `escrow-refund.e2e-spec.ts`
- `escrow-dispute.e2e-spec.ts`
- `escrow-cancel.e2e-spec.ts`
- `escrow-end-contract.e2e-spec.ts`
- `pending-referral-payout.e2e-spec.ts`
- `wallet.e2e-spec.ts`
- `platform-settings.e2e-spec.ts`

~80 cases expected.

### E2E-WH — Webhook tests

Synthetic Stripe events posted to `/webhooks/stripe` with valid test signatures. Asserts DB state changes + idempotency on duplicate delivery.

Files:
- `escrow-webhook-payment-intent.e2e-spec.ts`
- `escrow-webhook-charge.e2e-spec.ts`
- `escrow-webhook-transfer.e2e-spec.ts`
- `escrow-webhook-account.e2e-spec.ts`
- `escrow-webhook-idempotency.e2e-spec.ts` (duplicates, retries)

~30 cases expected.

### F — Frontend tests

React Testing Library + MSW for API stubs.

Files:
- `WalletPage.test.tsx`
- `EscrowDetailPage.test.tsx`
- `MilestoneRow.test.tsx`
- `MilestoneList.test.tsx`
- `AddMilestoneForm.test.tsx`
- `FeeBreakdown.test.tsx`
- `DisputeFilingDialog.test.tsx`
- `OnboardingBanner.test.tsx`
- `EscrowDisputeQueueTab.test.tsx` (admin)
- `PlatformSettingsTab.test.tsx` (admin)
- `CollaborationDetailPage.test.tsx` (extended summary card)

~40 cases expected.

### PW — Playwright e2e (browser)

Critical paths only — slow, need real browser. Run on CI nightly.

Files:
- `escrow-happy-path.spec.ts` — onboarding → fund → submit → approve → end contract
- `escrow-dispute-resolution.spec.ts` — fund → submit → dispute → moderator resolves → split payout
- `escrow-auto-release.spec.ts` — fund → submit → fast-forward 7 days (controlled clock) → auto-release fires

~10 cases expected.

## Followups

Tracked in `followups.md` (created during testing). Format: `FU-N. Description. Layer. Why deferred.`

Common deferral reasons:
- "Production bug surfaced; fixing in separate `fix(escrow): X` PR" (don't block tests on app bugs)
- "Test infrastructure gap; needs `stripe-mock` feature N (file Stripe issue)"
- "Flaky on CI but green locally; investigate"
- "Coverage gap acknowledged for MVP; add post-ship"

## Acceptance criteria

- All `ESCROW-NNN (Must)` requirements have ≥1 corresponding `TEST-ESCROW-NNN` case
- Coverage matrix shows green for >90% of `Must` requirements by feature ship date (`Should` and `Could` can lag)
- CI pipeline includes:
  - `npm test` (Vitest unit + integration)
  - `npm run test:e2e` (backend e2e with stripe-mock)
  - `npm run test:e2e:web` (frontend e2e via MSW)
  - `npx playwright test` (nightly only — too slow for PR gate)
- All tests deterministic — no flake budget. CI green = ship-ready.
- Stripe API never called in tests (CI-enforced via mock URL).
- `tests-escrow/` folder moves to `tasks/done/escrow/tests-escrow/` (nested) when feature ships.

## Open Questions

To be filled during testing session start. Initial set:
1. **stripe-mock fidelity for Connect transfers.** Need to verify that `transfers.create` against stripe-mock produces a `transfer.paid` webhook in the same way real Stripe does. If not, may need a custom mock layer for Connect events.
2. **Date-fast-forwarding strategy for auto-release.** Inject Clock provider via Nest DI vs use `vi.useFakeTimers()` at the test boundary? Probably the former for e2e (controllable from outside Vitest).

## Decisions Log

(Empty — fills as testing session resolves Open Questions during Slice A.)
