# Brief — tests-escrow

## Feature

Test counterpart for `tasks/in-progress/escrow/`. Mirrors every `ESCROW-NNN` requirement with one or more `TEST-ESCROW-NNN` cases that prove the requirement in code.

## Why this exists

Per `tasks/GUIDE.md` Working Principles: "Every shipped feature folder in `tasks/done/` should have a test counterpart in `tasks/done/`". Per `PROMPTS.md §2`: "Every shipped feature gets a paired `tests-<feature>/` folder containing TEST-FEAT-NNN cases mapped 1:1 to the feature's FEAT-NNN requirements."

Escrow is the highest-stakes feature on TradeHub — real GBP flowing through Stripe Connect, with multi-step state machines and irreversible side effects. Lack of test coverage = lack of confidence to ship to production. Coverage drives the spec; the spec was written with testability in mind (pure helper extraction, deterministic state transitions, idempotency).

## What feature shipped (or is shipping)

`tasks/in-progress/escrow/` (parent feature). Currently in spec phase as of 2026-05-09. Implementation begins in Slice A. This tests folder opens parallel to Slice A — TEST-ESCROW-NNN cases are written as the implementation lands, not retrospectively.

## What bugs we surface during testing

Common categories expected:
- Webhook idempotency edge cases (duplicate event delivery)
- Stripe API race conditions (e.g., transfer fires while milestone state changes)
- Idempotency-key collision during retry
- Multi-tab employer race (two Fund clicks in two tabs)
- Worker Connect account state changes mid-contract (e.g., `restricted` flip)
- Cron job timing (auto-release, contract auto-end)
- Currency precision drift (Decimal vs Number boundary)
- 3-way split arithmetic edge cases (rounding to pence)
- Dispute escalation timing (counterparty silent for exactly 7 days, 6:59 vs 7:01)

## Coverage targets (final, by ship date)

- **Unit (U)** — pure functions in `escrow.service.ts` (compute_payouts, validate_state_transition, etc.)
- **Backend e2e (E2E-B)** — full HTTP flows with `stripe-mock` Docker container; covers every endpoint × every state-transition path × every error case
- **Webhook (E2E-WH)** — webhook handlers with synthetic Stripe events (signed with test secret)
- **Frontend (F)** — React component tests with MSW handlers stubbing escrow API
- **Playwright (PW)** — end-to-end browser tests for critical paths (onboard → fund → submit → approve)

## Layers tagged on each TEST-ESCROW-NNN case

`U` / `E2E-B` / `E2E-WH` / `F` / `PW` — the layer that owns the proof. Some requirements have multi-layer coverage.

## Success criteria

- Every `ESCROW-NNN (Must)` requirement has at least one `TEST-ESCROW-NNN` case that asserts the behavior end-to-end at the appropriate layer
- Coverage matrix at >90% green by feature ship date
- All tests deterministic: no flaky `setTimeout` waits, no real Stripe API calls, all date math via injectable clock
- CI runs in <5 minutes (parallelized via Jest workers)
- `stripe-mock` is run via docker-compose.test.yml; CI step boots it before backend e2e

## Owner

TBA — implementing engineer same as escrow Slice A owner. Tests session opens within 24h of Slice A starting per `tasks/GUIDE.md`.
