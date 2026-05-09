# Spec — Escrow

## Summary

Real Stripe Connect Express escrow for fixed-price TradeHub collaborations. Replaces the partial mock in `backend/src/escrow/` and the `/escrow/:id` placeholder shipped by `collaborations-polish`. Money flows: Employer → (Stripe Checkout) → Platform balance (HELD per milestone) → (Connect transfers) → Worker connected account + Referrer connected account, with Platform retaining the configured fee. Workflow modelled on Upwork fixed-price contracts with milestones.

Requirements use stable IDs `ESCROW-NNN`. Decisions appended to a Decisions Log at the bottom; new Open Questions raised during implementation go in `Open Questions` (never the Decisions Log).

## Problem

See `brief.md`. Tldr: current escrow is a partial mock that desyncs with Stripe reality, has no Connect onboarding, no milestones, no admin fee config, no `/wallet`, no dispute resolution surface. We cannot accept real customer money safely.

## Goals

- End-to-end Stripe Connect Express integration: worker onboarding, employer fund (Checkout), milestone-by-milestone release, refund, dispute, cancel.
- Idempotent webhook-driven state machine — Stripe events are the source of truth, our DB is the cache.
- Multiple milestones per contract (Upwork pattern); default = single milestone for simple collabs.
- Admin-controlled fee percentages from `/admin/settings`: client marketplace fee, freelancer service fee, referral commission, Stripe-fee passthrough mode.
- Per-milestone state machine with auto-release after 7 days of employer silence.
- Disputed milestones block subsequent milestones (Upwork pattern); resolved by moderator decision (binding on platform; not legal arbitration in MVP).
- `/wallet` page for workers showing pending / released / refunded ledger.
- `/escrow/:id` page replaces placeholder, with per-milestone Fund / Submit / Approve / Dispute controls.
- Audit log on every transition (actor, reasoning, before/after state).
- CIArb extensibility: schema and state machine ready for future binding-arbitration stage without breaking change.

## Non-goals

- Multi-currency / FX. GBP only.
- Stripe Connect Custom or Standard. Express only.
- Stripe Tax integration / VAT calculation.
- Tiered platform-fee model (volume-based, subscription-based). Flat % only in MVP.
- Chat-side payment buttons / in-line "Pay £X" messages.
- Worker-to-bank withdrawals (Stripe Express handles that natively).
- Subscription-billing escrow for workers / employers.
- Push / SMS notifications on escrow events. Email + in-app only.
- Binding arbitration via CIArb / AAA. Schema-extensible but not wired in MVP.
- Multi-party split beyond worker / platform / referrer (e.g., agency cut, sub-contractor splits).

## User Flow

1. **Collab CONFIRMED** (existing — shipped by `collaborations-polish`) — employer + worker have agreed on the collaboration shell.
2. **Chat conversation auto-created** (existing — shipped by `chat`) — `Conversation.collaboration_id` links it.
3. **Employer drafts milestones** on `/escrow/:id` — adds 1..N milestones with title + amount each. `Collaboration.agreed_amount` is computed = sum(milestones).
4. **Employer clicks "Fund milestone 1"** — server checks worker has Stripe Connect Express account (`client_profile.stripe_connect_account_id`).
   - If not onboarded: response carries `{onboarding_url}` + a banner explains "Worker is setting up payouts — they'll be notified, then you can fund." Worker gets email with onboarding link, completes Express form on Stripe (~3 minutes).
5. **Stripe Checkout** opens — employer sees breakdown:
   ```
   Milestone amount:        £500.00
   Service fee (5%):       + £25.00
   Stripe processing:      + £8.10
   ─────────
   Total:                  £533.10
   ```
   Employer pays. Webhook fires `payment_intent.succeeded` → milestone status `FUNDED`. System message in chat: "Milestone 'Foundation work' funded — £500 in escrow."
6. **Worker does the work**, posts progress in chat (existing chat feature).
7. **Worker clicks "Submit work"** on the funded milestone → milestone status `SUBMITTED`. Email + in-app notification to employer: "Milestone X submitted — review within 7 days." System message in chat.
8. **Employer reviews:**
   - **Approve** → release transfer fires (`transfers.create` to worker's connected account + `transfers.create` to referrer if any). Milestone status `RELEASED`. Email worker + referrer. System message in chat. **Subsequent milestone unlocks for funding.**
   - **Dispute** → milestone status `DISPUTED`. Both parties + moderator notified. Subsequent milestones blocked. Counterparty has 7 days to respond → moderator decides if no agreement.
   - **Silent for 7 days** → auto-release fires (same as Approve path). Email both parties + referrer.
9. **Employer adds milestone 2** at any point → repeat from step 4.
10. **Either party clicks "End contract"** when done → 7-day contest window. If silent → collab status `COMPLETED`, reviews window opens (existing reviews feature). Chat stays open in read-only contract-terms mode but messages still flow.
11. **Cancel before fund** — employer or worker can cancel an unfunded milestone. If no funded milestones exist on the contract → entire collab status `CANCELED`, escrow row `CANCELED`, no review window.

## Requirements

### 1. Schema migrations

- **ESCROW-001 (Must).** Add `EscrowMilestone` model: `id`, `escrow_id` FK, `position` (Int, ordering 1..N), `title` (VarChar 200), `amount` (Decimal 12,2), `status` (VarChar 20 default `PENDING`), `worker_submitted_at`, `employer_approved_at`, `released_at`, `refunded_at`, `disputed_at` (all nullable Timestamptz), `stripe_pi_id` (unique), `stripe_charge_id` (unique), `stripe_transfer_id` (unique), `stripe_refund_id` (nullable, can be reused if partial refunds). `created_at`, `updated_at`. Unique constraint `(escrow_id, position)`. Index on `status`. Migration name: `add_escrow_milestones_and_settings`.
- **ESCROW-002 (Must).** `EscrowMilestone.status` enum (string-validated): `PENDING` (created, not funded), `FUNDED` (Stripe charge succeeded), `SUBMITTED` (worker submitted work), `RELEASED` (transfer paid to worker), `DISPUTED`, `REFUNDED`, `CANCELED`. Terminal states: `RELEASED`, `REFUNDED`, `CANCELED` (no further transitions in MVP).
- **ESCROW-003 (Must).** Add `PlatformSetting` model (single-row, `id` Int default 1): `client_marketplace_fee_percent` (Decimal 5,2 default 5.0), `freelancer_service_fee_percent` (Decimal 5,2 default 10.0), `referral_commission_percent` (Decimal 5,2 default 0.5), `stripe_fee_passthrough` (VarChar 20 default `EMPLOYER_PAYS` — values `EMPLOYER_PAYS` / `PLATFORM_ABSORBS` / `WORKER_ABSORBS`), `updated_at`, `updated_by` (BigInt nullable, FK to staff_member.id). Same migration as ESCROW-001.
- **ESCROW-004 (Must).** Add `EscrowDispute` model: `id`, `milestone_id` (BigInt unique — one dispute per milestone in MVP), `filed_by` (BigInt, client_profile.id), `reason` (VarChar 2000), `status` (VarChar 20 default `OPEN` — values `OPEN` / `RESPONDED` / `MEDIATION` / `RESOLVED` / `ARBITRATION_PENDING` for future CIArb), `resolution` (Json nullable — `{ worker_pct, employer_pct, platform_kept_fee }`), `arbitration_required` (Boolean default false — extensibility for future CIArb), `resolved_by` (BigInt nullable, staff_member.id), `resolved_at`, `created_at`. Same migration as ESCROW-001.
- **ESCROW-005 (Must).** Extend `EscrowTransaction.status` enum to include: `CREATED` (no milestones funded), `ACTIVE` (≥1 milestone funded or any in-flight), `DISPUTED` (any milestone is in DISPUTED state), `ENDED` (collab manually ended via "End contract"), `CANCELED` (no milestones ever funded, collab canceled). Terminal: `ENDED`, `CANCELED`. Old amount columns (`job_amount`, `platform_fee`, `referral_commission`, `worker_payout`) remain as **frozen snapshot at first-fund** for audit; live values come from `EscrowMilestone` rows + `PlatformSetting`.
- **ESCROW-006 (Should).** `Collaboration.agreed_amount` becomes a **derived** field — frontend shows it as `sum(EscrowMilestone.amount)` for that collab's escrow. Backend can keep the column (snapshot at first-fund) but it is no longer the source-of-truth for new operations.
- **ESCROW-007 (Must).** No data backfill needed — current `EscrowTransaction` rows have no consumers in production (mock state). Migration is pure additive: new tables + new status values. No `verification`-style data migration required.

### 2. Stripe Connect Express onboarding (path: empty → can-receive-payouts)

- **ESCROW-020 (Must).** New endpoint `POST /escrow/onboarding/start` (auth required, worker role, ACTIVE + email-verified). Creates Stripe Express account (`accounts.create({ type: 'express', country: 'GB', email: worker.email, capabilities: { transfers: { requested: true } } })`). Persists returned `account_id` on `client_profile.stripe_connect_account_id` (idempotent — if already set, reuse). Returns `accountLinks.create(...)` URL with `return_url=/wallet?onboarding=complete` and `refresh_url=/wallet?onboarding=incomplete`.
- **ESCROW-021 (Must).** New endpoint `GET /escrow/onboarding/status` (auth, worker only). Returns `{ has_account: bool, account_id: string?, charges_enabled: bool, payouts_enabled: bool, requirements: Stripe-Account-Requirements-shape, onboarding_url: string? }`. Polled by `/wallet` after onboarding redirect.
- **ESCROW-022 (Must).** Stripe webhook handler `account.updated` (Connect events): updates worker's `client_profile.stripe_connect_account_id` capabilities flags (write to a small denormalised cache `client_profile.connect_charges_enabled`, `connect_payouts_enabled` — add columns in same migration). Required so frontend can read "ready to receive payouts" without a Stripe round-trip per page load.
- **ESCROW-023 (Should).** When worker's `payouts_enabled` flips to `true` for the first time, send `MailService.sendPayoutsEnabled(email, name)`: "You're set up — you can now receive payouts via TradeHub." Idempotent — only fires the FIRST time the flag flips true (compare with previous DB value).
- **ESCROW-024 (Must).** Workers without a Connect account but listed in a collaboration are NOT blocked from any other action — the gate is at first-fund attempt only (per Q4 default).

### 3. Milestones — create / edit / delete

- **ESCROW-030 (Must).** New endpoint `POST /escrow/:id/milestones` (auth, employer party of the collab). Body: `{ title: string (3-200 chars), amount: decimal (≥ £5), position?: int }`. Server assigns `position` if omitted (next slot). Validates collab is `CONFIRMED` or `IN_PROGRESS`, escrow row is `CREATED` or `ACTIVE`. Returns the new milestone row.
- **ESCROW-031 (Must).** New endpoint `PATCH /escrow/milestones/:milestoneId` (auth, employer party). Allows editing `title`, `amount`, `position` ONLY when `milestone.status === 'PENDING'`. Funded+ milestones are read-only (locked).
- **ESCROW-032 (Must).** New endpoint `DELETE /escrow/milestones/:milestoneId` (auth, employer party). Allows deletion ONLY when `milestone.status === 'PENDING'`.
- **ESCROW-033 (Should).** Milestone reordering: `position` is editable on PENDING milestones via PATCH (ESCROW-031). UI surfaces drag-handle in `/escrow/:id`.
- **ESCROW-034 (Must).** Adding a milestone after the contract is partially funded is allowed (e.g., add milestone #4 after #1, #2, #3 are RELEASED). Same endpoint, same validation. New milestones start at the next `position` index.
- **ESCROW-035 (Should).** Concurrency safety: milestone CRUD inside a Prisma transaction; `position` enforced via `(escrow_id, position)` UNIQUE constraint. Two-tab races resolved by retry.

### 4. Funding — Stripe Checkout (path: PENDING → FUNDED)

- **ESCROW-040 (Must).** New endpoint `POST /escrow/milestones/:milestoneId/fund` (auth, employer party). Validates: milestone status is `PENDING`, **no other milestone in same contract is in `DISPUTED` state** (Q11 — Upwork blocking pattern), worker has `payouts_enabled === true` on Connect account. If worker not onboarded: returns `409 WORKER_NOT_ONBOARDED` with `{ onboarding_required: true }` payload. If a previous milestone is `DISPUTED`: returns `409 BLOCKED_BY_DISPUTE`.
- **ESCROW-041 (Must).** Computes amounts server-side from `PlatformSetting`:
  ```
  job_amount               = milestone.amount             (e.g. £500)
  client_fee               = job_amount * client_marketplace_fee_percent
  freelancer_fee           = job_amount * freelancer_service_fee_percent
  referral_commission      = job_amount * referral_commission_percent (only if collab.referral_id != null)
  worker_payout            = job_amount - freelancer_fee
  
  IF stripe_fee_passthrough = EMPLOYER_PAYS:
    estimated_stripe_fee   = (job_amount + client_fee) * 0.015 + 0.20  (UK card rate)
    employer_charge        = job_amount + client_fee + estimated_stripe_fee
  IF stripe_fee_passthrough = PLATFORM_ABSORBS:
    employer_charge        = job_amount + client_fee
    (Stripe deducts from balance; platform fee absorbs the difference)
  IF stripe_fee_passthrough = WORKER_ABSORBS:
    employer_charge        = job_amount + client_fee
    (worker_payout further reduced by stripe_fee at release time)
  ```
- **ESCROW-042 (Must).** Creates Stripe Checkout Session: `mode: 'payment'`, `currency: 'gbp'`, `payment_method_types: ['card']`, `line_items` with breakdown (job, service fee, processing fee separately for transparency), `metadata: { escrow_id, milestone_id, collaboration_id }`, `payment_intent_data.metadata` mirror, `payment_intent_data.transfer_group: 'escrow_<milestone_id>'` (for later transfer linking), `success_url: /escrow/:id?funded=:milestoneId`, `cancel_url: /escrow/:id?canceled=:milestoneId`. Stripe `Idempotency-Key`: `escrow_milestone_${milestoneId}_fund` (so retries don't duplicate session). Returns `{ checkout_url, session_id }`.
- **ESCROW-043 (Must).** Webhook handler `payment_intent.succeeded`: looks up milestone by `payment_intent.metadata.milestone_id` (or `transfer_group` fallback). If milestone status is `PENDING` → set to `FUNDED`, persist `stripe_pi_id`, `stripe_charge_id`. If already `FUNDED` (duplicate webhook) → no-op. If `DISPUTED` / `RELEASED` / `REFUNDED` → log warning, no-op (state was already advanced manually). If `CANCELED` → fire refund (`refunds.create`) — should not happen but safety net.
- **ESCROW-044 (Must).** Webhook handler `payment_intent.payment_failed`: milestone stays `PENDING` (so employer can retry). Email employer "Payment failed — try again."
- **ESCROW-045 (Must).** First successful funding on the contract transitions `EscrowTransaction.status` from `CREATED` → `ACTIVE` (in same transaction as milestone update). Frozen snapshot of `job_amount` (sum of all currently-defined milestones), `platform_fee`, `referral_commission`, `worker_payout` written to the contract-level row at this moment.
- **ESCROW-046 (Should).** Email worker on milestone FUNDED: "Funds in escrow for milestone 'X' — start work." System chat message: "Employer funded milestone 'X' — £500 in escrow."

### 5. Submission — worker submits work (path: FUNDED → SUBMITTED)

- **ESCROW-050 (Must).** New endpoint `POST /escrow/milestones/:milestoneId/submit` (auth, worker party). Validates milestone status is `FUNDED`. Body: `{ message: string (≤2000 chars, optional but encouraged) }` — message goes into chat as a system message linked to milestone. Sets `worker_submitted_at = now()`, status `SUBMITTED`. Triggers email to employer: "Milestone 'X' submitted — 7 days to approve or auto-release fires."
- **ESCROW-051 (Must).** System chat message on submit: "Worker submitted work for milestone 'X'." (per Q21 — overrides `scope.md` "do not post system messages" with explicit Decisions Log override).
- **ESCROW-052 (Should).** Worker can revise submission while status is `SUBMITTED` and employer has not yet approved/disputed. New endpoint `PATCH /escrow/milestones/:milestoneId/submission` body `{ message }`. Resets the 7-day auto-release timer. Idempotent.
- **ESCROW-053 (Should).** Worker can withdraw submission (back to `FUNDED`) if employer hasn't acted. `DELETE /escrow/milestones/:milestoneId/submission`. Sets status back to `FUNDED`, cancels the 7-day timer.

### 6. Release — employer approves OR auto-release after 7 days

- **ESCROW-060 (Must).** New endpoint `POST /escrow/milestones/:milestoneId/approve` (auth, employer party). Validates milestone status is `SUBMITTED`. Triggers release flow inline (Stripe transfers).
- **ESCROW-061 (Must).** Release flow:
  1. Compute payouts from frozen snapshot + current `PlatformSetting` referral % (only referral % is "live" — service fee is frozen at funding).
  2. `transfers.create({ amount: worker_payout_pence, currency: 'gbp', destination: worker.connect_id, transfer_group: 'escrow_<milestone_id>', metadata: { milestone_id, kind: 'worker_payout' } })` with `Idempotency-Key: escrow_milestone_${milestoneId}_release_worker`.
  3. If referral exists: `transfers.create({ amount: referral_pence, destination: referrer.connect_id, transfer_group: 'escrow_<milestone_id>', metadata: { milestone_id, kind: 'referral_commission' } })` with `Idempotency-Key: escrow_milestone_${milestoneId}_release_referral`. If referrer has no Connect account: skip transfer, write `pending_referral_payout` row instead (ESCROW-095).
  4. Update milestone: status `RELEASED`, `employer_approved_at` (or `released_at` for auto-release path), `stripe_transfer_id`, `released_at`.
- **ESCROW-062 (Must).** Webhook handler `transfer.paid`: cross-checks the milestone is `RELEASED` (idempotent) and the transfer amount matches expected payout. If mismatch — flag for admin review (audit log).
- **ESCROW-063 (Must).** Webhook handler `transfer.failed`: milestone status `RELEASE_FAILED` (new transient state), worker email "Payout failed — fix your Stripe account at /wallet." Manual retry via `POST /escrow/milestones/:milestoneId/retry-release` (worker or admin) once Connect account is fixed. **No auto-retry** (per Q25, Upwork pattern).
- **ESCROW-064 (Must).** Auto-release: scheduled job (Nest cron every hour) finds milestones where `status === 'SUBMITTED' AND worker_submitted_at < now() - 7 days`. For each: invokes the same release flow as ESCROW-061. Audit logged with `actor: 'system'`, `reason: 'auto_release_silent_employer'`. Email to employer + worker + referrer.
- **ESCROW-065 (Should).** System chat message on release: "Milestone 'X' released — £475 to worker, £5 to referrer, £20 platform fee." (or similar breakdown). Auto-release variant: "Milestone 'X' auto-released after 7 days of silence."
- **ESCROW-066 (Must).** Approving / auto-releasing milestone N **unblocks milestone N+1 for funding** (per ESCROW-040's `BLOCKED_BY_DISPUTE` check inverse — blocking is by `DISPUTED` only, not by unreleased prior milestones). Per Upwork: only one funded-but-unreleased milestone at a time per contract — so `ESCROW-040` ALSO checks "no other milestone in `FUNDED` or `SUBMITTED` state on this contract." Lockstep funding.
- **ESCROW-067 (Should).** Release on the LAST milestone does NOT auto-end the contract. Either party must explicitly click "End contract" (per Q14, Upwork pattern). Until ended, employer can add new milestones.

### 7. Refund — voluntary employer-initiated, before SUBMITTED only

- **ESCROW-070 (Must).** New endpoint `POST /escrow/milestones/:milestoneId/refund` (auth, employer party). Allowed when milestone status is `FUNDED` (work not yet submitted). Body: `{ reason: string (≥10 chars, ≤500 chars) }`.
- **ESCROW-071 (Must).** Refund flow:
  1. `refunds.create({ payment_intent: milestone.stripe_pi_id, refund_application_fee: false, reverse_transfer: false })` with `Idempotency-Key: escrow_milestone_${milestoneId}_refund`. Note: `refund_application_fee=false` because we used Separate Charges and Transfers (no app fee on the original PI), and `reverse_transfer=false` because no transfer fired yet (milestone hadn't been released).
  2. Update milestone: status `REFUNDED`, `refunded_at`, persist `stripe_refund_id`.
- **ESCROW-072 (Must).** Webhook handler `charge.refunded`: confirms milestone is `REFUNDED` (idempotent), no DB write needed if already advanced.
- **ESCROW-073 (Should).** Refunding a milestone does NOT automatically refund subsequent milestones or end the contract. Each milestone refund is independent. Employer can refund + add a new milestone + fund again.
- **ESCROW-074 (Must).** Refunding a `SUBMITTED` milestone is NOT allowed — it must go through dispute flow (worker has done work, deserves a chance to contest). Returns `409 INVALID_STATE` with explicit message "Use dispute flow for submitted work."

### 8. Dispute — worker contests employer non-action OR employer contests submission

- **ESCROW-080 (Must).** New endpoint `POST /escrow/milestones/:milestoneId/dispute` (auth, EITHER party). Allowed when milestone status is `FUNDED` or `SUBMITTED`. Body: `{ reason: string (≥10 chars, ≤2000 chars) }`. Creates `EscrowDispute` row, sets milestone status `DISPUTED`, escrow contract-level status `DISPUTED`.
- **ESCROW-081 (Must).** Counterparty has 7 days to respond via `POST /escrow/disputes/:disputeId/respond` body `{ response: string (≥10 chars, ≤2000 chars), resolution: 'accept' | 'reject' }`.
   - `accept` with worker's full proposal → moderator skipped, dispute auto-resolves per worker's favor (if employer disputed, worker offers refund split that employer accepts → applied directly).
   - `reject` → dispute escalates to moderator queue.
- **ESCROW-082 (Must).** If counterparty doesn't respond within 7 days → dispute auto-escalates to moderator queue. Audit log `dispute.auto_escalated`.
- **ESCROW-083 (Must).** Moderator queue UI: `/admin/escrow/disputes` (separate from existing verification queue). Lists disputes oldest-first. Click a row → side panel shows: chat history (link to /inbox/:id), milestone details, both parties' statements, prior milestones on this contract (history), uploaded attachments. Moderator action: `POST /admin/escrow/disputes/:disputeId/resolve` body `{ worker_pct: 0..100, employer_refund_pct: 0..100, platform_kept_fee: bool, reasoning: string }`. Validates `worker_pct + employer_refund_pct === 100`. Triggers split payout (transfers + refunds + platform-fee-keep decision).
- **ESCROW-084 (Must).** Resolution payout: `transfers.create` for worker's share (% of `worker_payout`), `refunds.create({ amount: employer_refund_amount })` for employer's share. Stripe `Idempotency-Key` includes dispute id. If `platform_kept_fee === true`, platform retains the configured `client_marketplace_fee_percent + freelancer_service_fee_percent` from the original charge; if false, platform refunds those too (rare — for cases of platform error / staff misconduct).
- **ESCROW-085 (Must).** Disputed milestone blocks subsequent milestone funding (per Q11). Once dispute is `RESOLVED` and milestone moves to `RELEASED` / `REFUNDED`, blocking lifts.
- **ESCROW-086 (Must).** **CIArb extensibility**: schema allows `EscrowDispute.status === 'ARBITRATION_PENDING'`, `arbitration_required: boolean`. In MVP this is never written, but the slot exists. Future feature opens a separate stage between `MEDIATION` and `RESOLVED` where binding third-party arbitration (CIArb in UK / AAA in US) makes the call. Adds no code in MVP — only schema.
- **ESCROW-087 (Should).** System chat message on dispute: "Dispute filed on milestone 'X' — TradeHub mediator will respond within 24h." Resolution: "Dispute resolved — £350 to worker, £150 refund to employer."

### 9. Cancel — voluntary, before any funding

- **ESCROW-090 (Must).** New endpoint `POST /escrow/cancel` (auth, EITHER party). Allowed when **no milestones on the contract have ever been funded** (all are `PENDING` or none exist). Validates `Collaboration.status` is `CONFIRMED` (not yet `IN_PROGRESS`). Body: `{ reason: string }`.
- **ESCROW-091 (Must).** Sets all `PENDING` milestones to `CANCELED`, escrow contract-level status `CANCELED`, `Collaboration.status` to `CANCELED`. Closes chat conversation as "Contract canceled before funding" system message.
- **ESCROW-092 (Must).** Worker can cancel a contract after fund attempt (= "Decline contract" — per Q20). Endpoint `POST /escrow/decline` (auth, worker only). Validates worker is on this collab. Triggers full refund of ALL funded milestones (`refunds.create` per row), sets all milestones to `CANCELED` or `REFUNDED` (depending on prior state), contract status `CANCELED`. No reviews window opens (no completed work).
- **ESCROW-093 (Should).** Audit: every cancel writes `escrow.canceled { reason, canceler_id, refunded_count, refunded_amount }`.
- **ESCROW-094 (Should).** System chat message + email to both parties on cancel.

### 9.5 Pending referral payouts — referrer without Connect

- **ESCROW-095 (Must).** Add `PendingReferralPayout` model: `id`, `referrer_client_profile_id`, `milestone_id`, `amount`, `currency` default GBP, `status` (VarChar 20 default `PENDING`, values `PENDING` / `PAID` / `CANCELED`), `created_at`, `paid_at` nullable, `stripe_transfer_id` nullable. Same migration as ESCROW-001.
- **ESCROW-096 (Must).** Release flow (ESCROW-061) writes a `PendingReferralPayout` row with status `PENDING` instead of attempting transfer when referrer has no Connect account.
- **ESCROW-097 (Must).** When referrer completes onboarding (account.updated webhook → payouts_enabled flips true), trigger backfill: find all `PendingReferralPayout` rows for this referrer, fire `transfers.create` per row. Mark each `PAID`. If transfer fails → status `FAILED`, manual retry by admin. Email referrer on backfill completion.
- **ESCROW-098 (Should).** Referrer `/wallet` shows pending referral payouts with "Set up payouts to receive £X" CTA when not onboarded.

### 10. Wallet — worker self-serve ledger + retry

- **ESCROW-110 (Must).** New page `/wallet` (auth, worker role). Loads:
  - Connect onboarding status banner (incomplete / pending / complete)
  - Active escrow (FUNDED / SUBMITTED milestones across all contracts) — "£X due to be released"
  - Released history — "£Y received in last 30 days"
  - Pending referral payouts (if user is also a referrer for any other collab)
  - Failed transfers needing retry (RELEASE_FAILED milestones — manual retry button)
- **ESCROW-111 (Must).** New endpoint `GET /wallet/me` returns the above as a JSON payload. Reuses existing milestone serializer.
- **ESCROW-112 (Must).** Failed transfer retry endpoint `POST /escrow/milestones/:milestoneId/retry-release` (auth, worker or admin). Validates status is `RELEASE_FAILED` and Connect account is now in `payouts_enabled === true` state. Re-fires `transfers.create` with **new** `Idempotency-Key` (suffix `_retry_${attemptNumber}`). Persists `release_attempts` counter on milestone (add column).
- **ESCROW-113 (Should).** Worker can re-trigger Connect onboarding link if account becomes `restricted` later (e.g., Stripe re-KYC). Reuse `POST /escrow/onboarding/start` — idempotent (returns new `accountLinks.create` URL for existing account).

### 11. Admin settings — fee configuration

- **ESCROW-120 (Must).** New page `/admin/settings` (auth, ADMIN role only — NOT moderator). Surfaces a form:
  - Client marketplace fee % (decimal, 0-50, default 5.0)
  - Freelancer service fee % (decimal, 0-50, default 10.0)
  - Referral commission % (decimal, 0-25, default 0.5)
  - Stripe fee passthrough (dropdown: `EMPLOYER_PAYS` / `PLATFORM_ABSORBS` / `WORKER_ABSORBS`)
  - Save button + confirmation modal "These changes will apply to NEW escrow funding only — in-flight contracts use frozen snapshot."
- **ESCROW-121 (Must).** New endpoint `GET /admin/settings/platform` (auth, ADMIN). Returns current `PlatformSetting` row.
- **ESCROW-122 (Must).** New endpoint `PATCH /admin/settings/platform` (auth, ADMIN). Updates the singleton row. Validates ranges (0-50% for fees, 0-25% for referral, allowed enum for passthrough). Audit log `platform.settings_changed { from, to, actor }`. Updates `updated_by` to current admin.
- **ESCROW-123 (Should).** Public read endpoint `GET /escrow/fee-preview?amount=1000` (auth required, any role) computes the breakdown for a given amount based on current `PlatformSetting` — used by frontend to preview "if I fund £1000, employer pays £X, worker gets £Y" before clicking Fund. Idempotent, read-only, no Stripe call.

### 12. Escrow detail page (`/escrow/:id`)

- **ESCROW-130 (Must).** Replaces the placeholder shipped by `collaborations-polish`. Top: contract summary (parties, status pill, total funded / released / refunded). Middle: milestone list (drag-handle for reorder when PENDING, per-row status pill, amount, action buttons). Action bar per row depends on state + viewer role:
  - PENDING + employer: Fund / Edit / Delete / Reorder
  - FUNDED + employer: Refund / Dispute
  - FUNDED + worker: Submit work / Dispute (after 7d if no employer action — surface "Submit work to start review timer" hint)
  - SUBMITTED + employer: Approve / Dispute (button shows "X days remaining for review" countdown)
  - SUBMITTED + worker: Revise submission / Withdraw submission / Dispute
  - DISPUTED: read-only with "Mediator reviewing" banner
  - RELEASED / REFUNDED / CANCELED: read-only with timestamp
- **ESCROW-131 (Must).** Bottom: lifecycle timeline (created → first fund → submissions → releases → ended). Read-only.
- **ESCROW-132 (Must).** "Add milestone" button (employer only, when contract is not ENDED/CANCELED). Inline form with title + amount inputs.
- **ESCROW-133 (Must).** "End contract" button (either party, available when at least one milestone is `RELEASED` or all milestones are terminal). Triggers 7-day contest window (per Q14). Other party gets email + in-app notification. If silent → contract auto-ends; if other party clicks "Contest end" → opens dispute flow on the most recent disputed milestone, or a new dispute on the contract level.
- **ESCROW-134 (Must).** Page-level actions: "Cancel contract" (only when no milestones funded yet, per ESCROW-090).

### 13. Collaboration detail integration

- **ESCROW-140 (Must).** `/collaborations/:id` summary card (shipped by `collaborations-polish` `COLLAB-022`) is **extended** to show: total contract value (sum milestones), funded amount, released amount, pending milestones. CTA "Manage payment →" links to `/escrow/:id`. Replaces the read-only read-only placeholder copy.
- **ESCROW-141 (Should).** When a milestone is FUNDED / SUBMITTED / RELEASED / DISPUTED / REFUNDED / CANCELED, post a system message to the collab's chat conversation (per Q21). System messages are rendered with a distinct style (different background, "system" badge, no avatar) and can be filtered out via UI toggle "Hide system messages."

### 14. Cross-cutting

- **ESCROW-150 (Must).** All endpoints under `/escrow/*` documented in Swagger via `@ApiOperation` + DTO classes.
- **ESCROW-151 (Must).** All money amounts handled as `Prisma.Decimal` in backend, never JS Number. Frontend displays with two decimal places, `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })`.
- **ESCROW-152 (Must).** All Stripe calls use `Idempotency-Key` header (escrow id + operation + retry counter). Documented in `notes.md`.
- **ESCROW-153 (Must).** Audit events written via existing `AuditService`:
  - `escrow.milestone.created { milestone_id, amount }`
  - `escrow.milestone.funded { milestone_id, amount, payment_intent_id }`
  - `escrow.milestone.submitted { milestone_id }`
  - `escrow.milestone.released { milestone_id, worker_amount, referral_amount, platform_fee, transfer_ids, actor: 'employer' | 'system' }` (auto-release writes `actor: 'system'`)
  - `escrow.milestone.refunded { milestone_id, amount, reason }`
  - `escrow.milestone.disputed { milestone_id, dispute_id, filed_by }`
  - `escrow.dispute.resolved { dispute_id, milestone_id, resolution, resolved_by }`
  - `escrow.contract.ended { escrow_id, ended_by }`
  - `escrow.contract.canceled { escrow_id, canceled_by }`
  - `escrow.transfer.failed { milestone_id, attempt, error_code }`
  - `platform.settings_changed { from, to, actor }`
  - `connect.onboarding.started { worker_id, account_id }`
  - `connect.onboarding.completed { worker_id, account_id }`
- **ESCROW-154 (Must).** Rate limits via `@Throttle`:
  - `POST /escrow/milestones/:id/fund` — 5/hour per IP (avoid Stripe billing burst)
  - `POST /escrow/milestones/:id/dispute` — 3/hour per user (anti-abuse)
  - `POST /escrow/onboarding/start` — 5/hour per IP
  - `PATCH /admin/settings/platform` — 60/hour per IP (admin actions)
- **ESCROW-155 (Must).** All money-bearing endpoints require `AccountStateGuard + @RequiresVerifiedEmail()` (existing decorators from auth-flow).
- **ESCROW-156 (Should).** Email notifications via `MailService` (existing, fire-and-forget):
  - Funded → worker: "Funds in escrow — start work"
  - Submitted → employer: "Review work — 7 days left"
  - Released → worker, referrer (if any): "£X released to your account"
  - Auto-released (silent employer) → worker, employer, referrer: "Auto-released after 7 days"
  - Dispute filed → other party + admin queue trigger: "Dispute on milestone X"
  - Refunded → both: "Refund processed — £X"
  - Cancel → both
  - Onboarding required (employer tries to fund) → worker
  - Payouts enabled (first time) → worker
  - Transfer failed → worker
- **ESCROW-157 (Must).** Frontend feature flag: `GET /escrow/providers` returns `{ stripe_connect: bool, charges_enabled: bool }`. SPA hides Fund / Withdraw CTAs when `false`. Mirrors verification's `/verification/providers` pattern.
- **ESCROW-158 (Must).** Removal of mock endpoints from existing `escrow.controller.ts`:
  - `POST /escrow/:id/confirm-deposit` — REMOVED (webhook does this; staff endpoint was creating desync)
  - `POST /escrow/:id/release` — REMOVED (replaced by per-milestone approve)
  - `POST /escrow/:id/refund` — REMOVED (replaced by per-milestone refund)
  - `POST /escrow/:id/deposit` — REPLACED by `POST /escrow/milestones/:id/fund`
  - `POST /escrow/:id/dispute` — REMOVED (replaced by per-milestone dispute)
  - `POST /escrow/collaboration/:id` (create) — KEPT but extended: now creates an empty `EscrowTransaction` shell that can hold milestones (employer adds them via ESCROW-030 separately).
- **ESCROW-159 (Should).** OpenAPI / Swagger documentation describes the full state machine in the `/escrow` tag description. Easier for next maintainer.

## Edge Cases

- **Two-tab race on fund.** Employer opens `/escrow/:id` in two tabs, both load the same milestone in PENDING state, both click Fund. Resolved: `Idempotency-Key: escrow_milestone_${milestoneId}_fund` → Stripe returns the same `PaymentIntent` for both. Backend's atomic `UPDATE WHERE status='PENDING'` advances state once; second update no-ops.
- **Worker submits, then immediately employer disputes (same second).** Optimistic lock via `UPDATE WHERE status='SUBMITTED'`. Whoever wins flips status; second action gets `409 INVALID_STATE`.
- **Webhook arrives before our DB transaction commits.** `payment_intent.succeeded` arrives milliseconds after we returned 302 to Stripe Checkout success URL. If our `POST /escrow/milestones/:id/fund` Prisma transaction hasn't committed → webhook handler can't find the milestone → log warning, no-op. Stripe will redeliver the event with backoff; on retry our DB has caught up. Mitigated by short transactions in the fund handler.
- **Stripe webhook retries after our 200.** Stripe's at-least-once delivery may redeliver. Webhook handler is idempotent (checks current milestone status before writing).
- **Connect account becomes `restricted` mid-contract.** Worker has FUNDED milestones in flight. On release, transfer fails. Milestone moves to `RELEASE_FAILED`, worker emailed, retry button visible after they fix the account.
- **Referrer onboards mid-contract.** First milestone released without referral transfer → `PendingReferralPayout` written. Referrer onboards → backfill job runs, fires `transfers.create` for all pending rows.
- **Auto-release fires after employer disputes (race).** If employer dispute lands within the 1-hour cron tolerance, dispute wins (DB optimistic lock — `UPDATE WHERE status='SUBMITTED'`). Auto-release sees `DISPUTED` → no-op.
- **Worker submits work, contract is then canceled by mutual agreement.** ESCROW-090 cancel only allowed if no milestones funded. Once anything is funded, exit is via dispute flow + moderator decision OR explicit refund (employer).
- **Employer adds milestone after "End contract" pending.** If contract is in 7-day end-window and employer adds milestone — adding milestone resets the end-window timer (treated as continued activity).
- **Stripe payment intent `requires_action` (3DS).** Stripe Checkout handles 3DS in their hosted UI. If user fails 3DS → PI fails → milestone stays `PENDING`. Employer can retry.
- **Partial refunds (rare).** MVP: full refund only via ESCROW-070. Partial refunds happen ONLY through dispute resolution by moderator (ESCROW-083).

## Acceptance Criteria

- All `ESCROW-NNN (Must)` requirements satisfied with backend code, frontend wiring, and tests in `tests-escrow/`.
- Manual smoke test: full flow from worker onboarding → contract creation with 2 milestones → fund #1 → submit → approve → fund #2 → submit → silent employer → auto-release fires → end contract → reviews window opens. All on test mode keys.
- Dispute smoke test: fund → submit → employer disputes → 7-day silence → moderator queue → moderator resolves 50/50 → split transfers fire correctly.
- `npm run lint` clean both backend and frontend.
- `tsc --noEmit` clean.
- `vite build` clean.
- All Swagger endpoints documented and accessible at `/api/docs`.
- `tests-escrow/` opens parallel to first slice; coverage matrix at >90% green by feature ship date.
- No `console.log` of full PaymentIntent payloads in shipped code.
- Webhook signature verification mandatory; CI fails if `STRIPE_*_WEBHOOK_SECRET` missing in non-test env.
- Idempotency keys present on every Stripe write call.
- Audit log entries for every state transition.
- Test mode locked: CI fails loud if `STRIPE_SECRET_KEY` starts with `sk_live_` in non-prod.

## Open Questions

All initial scope.md Open Questions resolved 2026-05-09 — see Decisions Log below. New questions raised during implementation must be appended **here** (not the Decisions Log) until resolved.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-09 | **Q1: Manual release.** Employer clicks "Approve" to release; auto-release fires only after 7 days of employer silence post-submission (Q6). | Upwork pattern: client decides when work is acceptable; auto-release exists as a safety valve so worker doesn't get stranded. Manual + auto hybrid is safer than pure auto on collab `COMPLETED`. |
| 2026-05-09 | **Q2: `/escrow/:id` separate URL.** | Money has its own surface. Email links land here directly. Mirrors chat's `/inbox/:id` precedent (each primary noun gets a dedicated route). |
| 2026-05-09 | **Q3: Stripe Checkout (redirect).** | Less PCI surface, faster to ship, fewer bugs than embedding Elements. Conversion data can justify Elements upgrade later. |
| 2026-05-09 | **Q4: Worker onboarding gate at first-fund time.** | Onboarding is friction; defer it until necessary. Employer's first Fund attempt blocks with banner if worker not onboarded; worker emailed; employer can retry once worker completes. |
| 2026-05-09 | **Q5: Admin-controlled fees.** Four fields in `/admin/settings`: client marketplace fee %, freelancer service fee %, referral commission %, Stripe fee passthrough mode. ADMIN role only (not moderator). | Owner asked for runtime configurability without code changes. PlatformSetting singleton row, audit on change, applies to NEW funding only (in-flight contracts use frozen snapshot from first-fund). |
| 2026-05-09 | **Q5b: Stripe fee passthrough = `EMPLOYER_PAYS` default.** Employer's Stripe Checkout charge = job_amount + service fee + estimated Stripe fee. | Upwork pattern — client marketplace fee covers processing. Most transparent: employer sees the breakdown, worker gets the agreed amount, platform takes the configured cut. Other modes (`PLATFORM_ABSORBS` / `WORKER_ABSORBS`) configurable for edge cases. |
| 2026-05-09 | **Q6: Hybrid 7-day auto-release.** Worker submits → employer has 7 days to approve / dispute → auto-release if silent. Triggers referrer commission too. | Upwork-equivalent (they use 14d). Shorter for our market (7d) — UK construction projects move faster than freelance contracts. Worker isn't stranded; employer has a clear deadline. |
| 2026-05-09 | **Q7: Multiple milestones from start.** UI defaults to "single milestone" but employer can split into N. | User asked for milestones at start. Same complexity ceiling as `chat` feature; manageable inside one feature scope. Schema: `EscrowMilestone` table FK to `EscrowTransaction`. |
| 2026-05-09 | **Q8: Cancel before fund — escrow row stays as `CANCELED`.** Collab also goes `CANCELED`. | Audit trail preserved. Future analytics: how often do contracts get canceled before funding? Feeds product decisions. |
| 2026-05-09 | **Q9: Referrer without Connect — `PendingReferralPayout` row.** When referrer onboards, backfill job pays out automatically. | Doesn't block release to worker. Doesn't lose the commission. Aligns with "set up payouts to receive £X" friction model. |
| 2026-05-09 | **Q10: Edit milestones only when `PENDING`.** FUNDED+ are read-only. | Once money is in escrow, contract terms are immutable (per Stripe / accounting hygiene). Edits to FUNDED would require refund + re-fund cycle, which is what dispute flow handles. |
| 2026-05-09 | **Q11: Block subsequent milestone funding when one is `DISPUTED`.** Lockstep funding (one funded-but-unreleased milestone at a time per contract). | Upwork verified pattern. Protects employer from continuing on potentially bad work; protects worker from accumulating unpaid submissions. Simpler state machine. |
| 2026-05-09 | **Q12: Per-milestone referral commission.** Each release fires referral transfer alongside worker transfer. | Fairness for referrer — earns proportionally as work is delivered. Doesn't wait for full contract close. Simpler accounting (each release is independently accountable). |
| 2026-05-09 | **Q14: Explicit "End contract" required.** Releasing the LAST milestone does NOT auto-close. Either party clicks "End contract" → 7-day contest window → collab `COMPLETED` → reviews open. | Upwork pattern. Allows employer to add a follow-up milestone without re-creating the collab. Reviews window opens predictably on a clear event, not on payment-flow side-effects. |
| 2026-05-09 | **Q15: Add milestones mid-contract.** Allowed at any time before contract is ENDED. | Upwork pattern. Common case: employer realizes additional scope after starting. Avoids fragmenting one engagement into multiple collabs. |
| 2026-05-09 | **Q16: `Collaboration.agreed_amount` is derived.** Source of truth = sum of milestone amounts. Frozen at first-fund moment for audit. | Cleaner data model: no two columns can disagree. Frontend computes the live total; backend uses snapshot for audit. |
| 2026-05-09 | **Q17: 7-day auto-release timer.** Resets if worker revises submission. Doesn't reset on employer view-only actions. | Worker has agency to update; employer has agency to approve/dispute. Timer is a clear deadline, not a moving target. |
| 2026-05-09 | **Q18: Email notifications per ESCROW-156.** Funded → worker; Submitted → employer; Released → worker + referrer; Auto-released → all three; Dispute → both + admin; Refund → both; Onboarding required → worker; Payouts enabled (first) → worker; Transfer failed → worker. | Best-practice email hygiene: notify each party only when action is required of them OR money has moved on their behalf. Send via existing `MailService`, fire-and-forget. |
| 2026-05-09 | **Q19: Per-milestone actions on `/escrow/:id`. Summary on `/collaborations/:id`.** | Single source of truth for escrow operations. `/collaborations/:id` already shows summary card; extending it for actions would clutter the existing collab UI. `/escrow/:id` is the dedicated money surface. |
| 2026-05-09 | **Q20: Worker decline → full refund + collab CANCELED.** ESCROW-092. No reviews window opens. | Upwork pattern: if worker pulls out, employer gets fully refunded, no penalty for either side aside from the lost time. Encourages workers to set realistic expectations before accepting. |
| 2026-05-09 | **Q21: System chat messages on escrow events.** Overrides scope.md "do not post system messages" rule. | Upwork pattern — chat is the single timeline for the contract's lifecycle. Funding, submissions, releases, disputes are first-class events; users expect them in the conversation. Filter toggle "Hide system messages" available for users who prefer clean chat. |
| 2026-05-09 | **Q22 / Q23: Stripe Connect Express only.** | Locked in scope.md. Custom = too much KYC custody burden. Standard = workers shouldn't own a Stripe Dashboard. Express = hosted onboarding, light custom dashboard, supports `transfers.create` from platform balance. |
| 2026-05-09 | **Q24: Admin override always allowed.** Force release / refund / cancel / adjust amounts from `/admin/escrow/:id`. Audit log includes `admin_override: true` + reasoning text. | Stuck states happen (worker disappears, employer disputes via wrong channel, Stripe quirks). Admin needs an unblocked path. Auditable so it's not abused. |
| 2026-05-09 | **Q25: Failed transfer = manual retry by worker via `/wallet`.** No auto-retry. | Upwork pattern. Auto-retry on the same broken Connect account just creates more failed transfers + Stripe noise. Worker fixes account, clicks retry, fresh idempotency key. |
| 2026-05-09 | **Q26 / Q27 / Q28 / Q29: VAT not handled. GBP only. Stripe-default receipts only. Refund of platform fee on dispute resolution = moderator's choice.** | Upwork doesn't handle VAT either — UK self-employed workers issue their own invoices. GBP-only: scope locked. Stripe-default receipts cover MVP. Moderator-discretion fee refund handles edge cases (e.g., platform error vs worker error). |
| 2026-05-09 | **CIArb extensibility.** Schema includes `EscrowDispute.arbitration_required: boolean default false` and a reserved status `ARBITRATION_PENDING`. Not wired in MVP — but no migration needed when we eventually sign a CIArb contract and add the binding-arbitration stage. | Forward-compatibility without committing to legal complexity now. ~10 lines of schema, 0 lines of code in MVP. |
| 2026-05-09 | **Removed mock endpoints from existing `escrow.controller.ts`.** ESCROW-158 lists them. The current `confirmDeposit` / `release` / `refund` staff endpoints are removed because they create desync between DB state and Stripe reality. New per-milestone endpoints replace them with proper Stripe-driven state transitions. | Consistency with how verification's `PATCH /documents/:id/status` was removed in favor of `POST /verification/documents/:id/review`. One canonical mutation path per state transition; webhooks are the source of truth. |
| 2026-05-09 | **No binding arbitration in MVP.** Moderator decision is final on the platform. | CIArb requires legal partnership, ToS update, mediator agreement, fee structure (per Upwork: $291 each split). Not a 1-week scope. Schema-extensible per above; we add when we have the legal partner signed. |
| 2026-05-09 | **One-funded-milestone-at-a-time lockstep.** Employer cannot fund milestone N+1 until milestone N is RELEASED, REFUNDED, or CANCELED. | Upwork's exact behavior. Forces dispute resolution before continuing, prevents employer from running ahead and stacking liabilities. |
