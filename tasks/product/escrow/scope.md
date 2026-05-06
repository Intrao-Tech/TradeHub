# Escrow — Scope (high level)

> Single-page scope sheet for the next AI / engineer picking up Escrow.
> The full spec / brief / requirements / tests are written **after** scope is locked.
> This file exists so the AI starting work knows the boundary, not the design.

## What this feature is

Real Stripe-Connect escrow for TradeHub UK collaborations. Replaces the placeholder `/escrow/:id` route shipped by `tasks/done/collaborations-polish/` and the read-only escrow summary card on `/collaborations/:id` with a working money-movement surface: employer deposits funds → held → released to worker on completion, or refunded / disputed otherwise.

## Sequencing

`auth` → `profiles` → `verification` → `jobs-applications` → `collaborations-polish` → `chat` (in flight) → **escrow (this)** → `reviews-write` → `staff-tools`.

You are working **after** chat ships. Chat is in `tasks/product/chat/` (or `tasks/in-progress/chat/` by the time you start) — do not touch any chat code; the chat summary card on `/collaborations/:id` stays as it is.

## Existing scaffolding (consumed, extended — do not rewrite)

- **Schema (already shipped):** `backend/prisma/schema.prisma:550-572` — `EscrowTransaction` table with `collaboration_id` (unique), `status`, the four amounts (`job_amount` / `platform_fee` / `referral_commission` / `worker_payout`), the four Stripe id columns (`payment_intent` / `charge` / `transfer` / `refund`), the four lifecycle timestamps (`deposit_confirmed_at` / `released_at` / `refunded_at` / `disputed_at`). No schema rewrite — extend with new columns / status values only if you can justify it.
- **Backend module (already exists, partial):** `backend/src/escrow/{escrow.controller.ts, escrow.service.ts, escrow.module.ts, dto/}` — ~350 LoC of plumbing. Extend it; do not throw it away.
- **Stripe webhook hook:** `backend/src/webhooks/stripe.service.ts` already exists. Wire escrow status transitions to its existing event-routing instead of inventing a parallel webhook handler.
- **Frontend placeholder route:** `/escrow/:id` shipped by `collaborations-polish` (`COLLAB-003`) renders an `EmptyState` "Escrow is coming soon". Replace its body. **Do not change the URL** unless you also resolve the Q3 deferred decision in `tasks/done/collaborations-polish/spec.md` Decisions Log (`/escrow/:id` vs `/collaborations/:id?tab=escrow`).
- **Read-only summary card** on `/collaborations/:id` (`COLLAB-022`) becomes interactive: add Fund / Release / Refund buttons (role-gated), keep the layout, replace the placeholder footer link with real navigation.

## What's IN scope

1. **Stripe Connect onboarding for workers.** A worker who wants to receive escrow payouts goes through Connect Express onboarding; status persisted on the worker profile. Onboarding-incomplete workers can still be in collaborations, but escrow funding is blocked with a banner pointing them at onboarding.
2. **Employer-side Fund flow.** "Fund escrow" button on `/collaborations/:id` (employer party only, collab in `CONFIRMED` / `IN_PROGRESS`). Creates a `PaymentIntent` (UK GBP, `application_fee_amount` = platform fee, `transfer_data.destination` = worker's connected account). Redirect to Stripe Checkout or render Stripe Elements — pick one and lock it.
3. **Status state machine.** `CREATED → DEPOSIT_PENDING → HELD → RELEASED` (happy path); `→ REFUNDED` (cancellation); `→ DISPUTED` (any non-terminal). Stripe webhooks (`payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created`, `transfer.paid`) drive the transitions; the existing `webhooks/stripe.service.ts` is the entry point.
4. **Release on completion.** When a collaboration transitions `IN_PROGRESS → COMPLETED` (existing `PATCH /collaborations/:id/status` flow), an automatic transfer fires for the held funds. Either-party-marks-complete is current behaviour; the release ties to that transition. Decide and lock: auto-release on `COMPLETED`, or hold for an explicit "Release to worker" button by the employer? Recommended default: **auto-release** — disputes are the safety valve.
5. **Refund flow.** Employer can request a refund while status is `DEPOSIT_PENDING` or `HELD` and the collab is not `COMPLETED`. Triggers `refunds.create`. Webhook drives the row to `REFUNDED`.
6. **Dispute flow (light).** Employer or worker can flag a dispute via the existing collaboration `POST /collaborations/:id/flag` (already wired to set `Collaboration.flagged = true`). Escrow side: when a flagged collab has an `EscrowTransaction`, the escrow row moves to `DISPUTED` and funds are frozen (no auto-release). Resolution is staff-only via `staff-tools` — out of scope here, but the data shape must support it.
7. **Worker wallet page.** A `/wallet` route (worker-only) listing pending / released / refunded amounts pulled from `EscrowTransaction` rows where the worker is the payout recipient. Pagination by `created_at desc`. No money-movement actions on this page in MVP — read-only ledger.
8. **Replace the `/escrow/:id` placeholder.** Real per-escrow detail page: amounts table (already in collab-polish summary card — reuse), status pill, lifecycle timeline (`created_at` → `deposit_confirmed_at` → `released_at` / `refunded_at` / `disputed_at`), action bar (Fund / Release / Refund / Cancel — role-gated), Stripe receipt link.
9. **Idempotency.** Funding the same collab twice (network retry, double-click, two-tab race) must not produce two `PaymentIntent`s. Use `EscrowTransaction.collaboration_id` unique constraint + Stripe idempotency keys. Same applies to release / refund.
10. **Currency: GBP only.** No multi-currency. Lock and don't entertain it in MVP.
11. **Tests counterpart.** A `tests-escrow/` folder opens the same week implementation starts (mandatory per `tasks/GUIDE.md` Working Principles + every prior feature's precedent). Drives Stripe via the official `stripe-mock` container — never the live API in tests.

## What's OUT of scope (do NOT do these in this feature)

- **Multi-currency, FX, Stripe Tax.** GBP only. International collabs are a future feature.
- **Connect Custom or Standard.** Use **Express** only.
- **Subscription billing for workers / employers.** Separate revenue stream; lives in its own `subscriptions/` feature folder.
- **Marketplace-fee tier changes.** The platform-fee rate is a config constant in this feature; tiered fees / promo codes are deferred.
- **Staff-side dispute resolution UI.** Staff sees the flagged escrow row in `staff-tools` (separate feature) and resolves manually. This feature ships the data shape (`DISPUTED` status, frozen funds) but **no staff UI**.
- **Reviews-write / review-gated release.** Release is collaboration-completion-driven, not review-driven. Reviews ship after escrow.
- **Push / SMS notifications on funding events.** Email only (existing `mail.service.ts`). Push lives in `push-notifications/`.
- **Chat-side escrow status messages.** Do **not** post system messages into the chat conversation when escrow status changes. Chat is the chat feature; status changes live in the escrow card on `/collaborations/:id` and emit a `<Toast>` on the active page. (If we change our minds, that's a 2-line addition later — but keep them decoupled in this feature.)
- **In-line payment in the chat composer.** No "Pay £X" button in messages.
- **Wallet-to-bank withdrawals.** Stripe Connect Express handles payouts to the worker's connected bank account on Stripe's standard schedule. We do not build a withdrawal flow.
- **Anything that touches `backend/src/conversation/`.** Chat is sealed. Don't import from it.

## Hard guardrails

- **Real money is moving.** No `console.log` of full PaymentIntent payloads in shipped code. Webhook signature verification is mandatory (`stripe.webhooks.constructEvent`) — never trust a webhook by URL alone.
- **No frontend-driven amounts.** The employer's "Fund" button does not let them type the amount — `job_amount` comes from `Collaboration.agreed_amount` (already on the collab row). Platform fee is a server-side config constant. Worker payout is `job_amount - platform_fee - referral_commission` — computed server-side, never client-side.
- **No raw Stripe error strings to the user.** Map Stripe error codes through `parseApiError()`-equivalent helper. "Your card was declined" is fine; `"card_declined: insufficient_funds"` is not.
- **Test mode locked in dev / staging.** `STRIPE_SECRET_KEY` starts with `sk_test_` in every non-production environment. CI fails loud if a `sk_live_` key leaks into a non-prod env.
- **GDPR.** Stripe customer / connected-account IDs persist forever (we need them for refunds + audit); the user's name / email / address live on Stripe's side, not ours. Don't replicate the Stripe customer object into our DB.
- **No silent rollback of escrow on collaboration deletion.** A collab with a non-`CREATED` escrow cannot be deleted (backend constraint). Staff-tools handles edge cases manually.

## Open questions for the implementing AI to lock during spec phase

1. Auto-release on `COMPLETED`, or explicit "Release to worker" button? Default: auto-release. Lock during spec.
2. `/escrow/:id` URL stays, or move to `/collaborations/:id?tab=escrow`? Default: `/escrow/:id` stays (the chat feature has set the precedent of a dedicated route per primary noun). Lock during spec.
3. Stripe Checkout (redirect) or Stripe Elements (in-page)? Default: **Checkout** for MVP — less surface area, less PCI scope, faster to ship. Revisit when conversion data justifies.
4. Worker onboarding-required gate: at job-application time, at collab-confirm time, or at first-fund time? Default: **first-fund time** — onboarding is a friction tax; defer it as long as possible. The employer's Fund button shows a "Worker is completing payout setup — they'll be notified, then you can fund" state.
5. Platform-fee model: flat-percent only, or tiered? Default: **flat-percent (config constant)**. Tiering is a separate feature.

## Sealed contracts to consume

- `tasks/done/auth-flow/contract.md` — `Account.status === 'ACTIVE'` + `email_verified` required for funding actions; reuse `AccountStateGuard` + `RequiresVerifiedEmail`. Do not invent parallel rules.
- `tasks/done/profiles/contract.md` — `<VerificationBadge>`, `<StarRating>`, the avatar primitive, postcode regex (`PROF-015`).
- `tasks/done/jobs-applications/contract.md` — `agreed_amount` semantics on the conversion-to-collab path.
- `tasks/done/collaborations-polish/spec.md` — `COLLAB-003` (placeholder route), `COLLAB-022` (read-only summary card you replace), `COLLAB-021` lifecycle (release trigger).
- `tasks/product/chat/spec.md` (or `tasks/in-progress/chat/...` by the time you start) — **read it once** so you understand the chat scope is sealed; do not import from `backend/src/conversation/` and do not modify chat surfaces.

## Deliverables when this scope graduates

When you start work, this folder gains the standard `tasks/GUIDE.md` set:

- `brief.md` — feature framing
- `spec.md` — `ESCROW-NNN` requirements, edge cases, acceptance criteria, decisions log
- `status.md` — state, owner, dates
- `tests-escrow/` — sibling test feature, opened the same week (mandatory)

Then move the whole folder `tasks/product/escrow/` → `tasks/in-progress/escrow/`.

`scope.md` (this file) is **the only file in this folder until spec writing starts**. It exists to delineate boundary, not design.
