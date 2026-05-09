# Brief

## Feature

Real Stripe Connect escrow for fixed-price collaborations on TradeHub UK. Replaces the placeholder `/escrow/:id` route shipped by `tasks/done/collaborations-polish/` and the partial mock in `backend/src/escrow/` with a working money-movement surface: employer funds milestones → platform holds → released to worker on milestone approval, with refund / dispute / cancel paths.

## Problem

Current state of escrow on TradeHub:

- **`backend/src/escrow/escrow.service.ts`** is a partial mock. `confirmDeposit`, `release`, and `refund` are pure DB updates — no `transfers.create`, no `refunds.create`, no real Stripe side-effects. The real Stripe calls happen ONLY in the webhook handler (`backend/src/webhooks/stripe.service.ts`), so staff endpoints can produce DB state that diverges from Stripe reality.
- **No worker Stripe Connect onboarding.** `client_profile.stripe_connect_account_id` exists but nothing populates it.
- **No `application_fee_amount` / `transfer_data.destination`.** The Checkout currently creates a basic charge to the platform account — there's no Connect routing to worker accounts.
- **No `/escrow/:id` real page.** The placeholder shipped by `collaborations-polish` shows an `EmptyState`.
- **No `/wallet`.** Workers have no surface to see their pending / released / refunded funds.
- **No milestones.** Each collab gets one escrow row — can't split a £10k contract into reviewable chunks.
- **No admin override / dispute resolution UI.** Disputes are persisted but stuck — no moderator surface.
- **Hard-coded fees.** Platform fee, referral commission, Stripe-fee passthrough mode are not configurable from the admin panel.

The result: TradeHub cannot accept real customer money safely. Every paying customer is a potential desync incident or a blocked-funds support case.

## Goal

Ship a Stripe Connect Express escrow that handles every money path end-to-end with the same hygiene as `verification`:

- Idempotent webhooks driving state transitions (single source of truth for escrow state)
- Atomic transactional updates with guard conditions (no double-release, no double-refund)
- Audit log on every state transition with actor + reasoning
- Admin-controlled fee percentages from `/admin/settings`
- Worker self-serve onboarding from `/wallet`
- Per-milestone fund / submit / approve / dispute flow (Upwork pattern)
- Full transparency in Stripe Checkout: employer sees a breakdown (job amount, service fee, processing fee, total)

## Users

- **Employer** — funds milestones via Stripe Checkout, approves work, files disputes if needed, can cancel before fund.
- **Worker** — completes Stripe Connect Express onboarding, submits work for milestones, watches `/wallet` for funds, files disputes if employer doesn't approve.
- **Referrer** (optional) — earns admin-configured percentage on each released milestone if collab has a `referral_id`. Receives via Connect transfer if onboarded, otherwise pending balance on platform.
- **Staff (moderator role)** — handles disputed escrows from a queue at `/admin/escrow/disputes`, decides binding split (worker / employer / platform / referral percentages), force-actions on stuck states.
- **Staff (admin role)** — additionally edits platform fee percentages at `/admin/settings`, can override anything with audit-logged reasoning.

## Expected Outcome

- Real GBP can flow through TradeHub for fixed-price collaborations from £10 to £20k.
- Money never sits on Stripe's balance unaccounted-for in our DB; every state transition is reflected in `EscrowTransaction` / `EscrowMilestone` rows + audit log within seconds of the Stripe event.
- A worker can complete Express onboarding in <5 minutes and start receiving payouts.
- An employer can fund a contract in 3 clicks (open `/escrow/:id` → "Fund milestone" → Stripe Checkout → return).
- Disputes resolve via moderator decision in <24h SLA (admin queue surfaces oldest-first).
- Auto-release after 7 days of employer silence — worker isn't stranded if employer ghosts.
- Platform fee + referral commission percentages are editable from `/admin/settings` without a code change.
- Stripe processing fee is paid by employer on top of the contract amount (Upwork-style transparency).

## Constraints

- **GBP only.** No multi-currency, no FX. International collabs are a future feature.
- **Stripe Connect Express only.** Not Custom (too much KYC custody burden), not Standard (workers shouldn't own a Stripe Dashboard).
- **No binding arbitration in MVP.** Moderator decision is final on the platform. Schema must leave room for future CIArb integration (`EscrowDispute.arbitration_required: boolean`, `ARBITRATION_PENDING` state) without breaking the core flow.
- **No multiple currencies, no Stripe Tax, no marketplace-fee tiers, no chat-side payment buttons, no withdrawal flow** (Stripe Connect Express handles payouts to worker's bank on standard schedule).
- **Real money is moving.** No `console.log` of full PaymentIntent payloads, mandatory webhook signature verification, all amounts computed server-side from `Collaboration.agreed_amount` (derived from sum of milestones), never from frontend input.
- **Test mode locked in dev / staging.** `STRIPE_SECRET_KEY` must start with `sk_test_` in non-prod environments — CI fails loud if a `sk_live_` key leaks.
- **Cannot break collaborations-polish, chat, reviews surfaces.** Escrow extends `/collaborations/:id` summary card and replaces `/escrow/:id` placeholder body — does not modify the chat conversation thread or the reviews flow.
- **GDPR.** Stripe customer / connected-account IDs persist forever (we need them for refunds + audit); the user's name / email / address live on Stripe's side, not ours. Don't replicate the Stripe customer object into our DB.

## Why now

- `tasks/done/collaborations-polish/` (shipped 2026-05-06) has a placeholder route waiting for this feature.
- `tasks/done/chat/` (shipped 2026-05-07) auto-creates a chat conversation on collab `CONFIRMED`, which is the immediate predecessor of the fund step.
- `tasks/done/reviews/` (shipped 2026-05-08) requires `Collaboration.status === 'COMPLETED'` to enable review writes — escrow's "End contract" flow is what produces that COMPLETED transition cleanly.
- Sequencing per scope.md and `tasks/done/collaborations-polish/spec.md` Decisions Log: `chat → escrow → reviews-write → staff-tools`. Reviews shipped early (out of order) without escrow dependency, so escrow now is the next domino.
- After escrow ships, `staff-tools` (admin moderation surfaces) is the natural follow-up — escrow disputes are one of the major staff workflows and need a queue + decision UI.
