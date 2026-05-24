# Spec — Escrow

> ⚠️ **SCHEMA REVISED 2026-05-11.** The data model was reworked after this
> spec was written. The authoritative schema is `tasks/in-progress/DATA-MODEL.md`
> + `backend/prisma/schema.prisma`. Where this spec's wording disagrees with
> DATA-MODEL.md, the latter wins. Key escrow-domain changes, applied in §1
> Schema below and the 2026-05-11 Decisions Log entry:
> - `escrow_transaction` table **dropped** — `escrow_milestone` references
>   `contract` directly (`escrow_milestone.contract_id`).
> - New unified **`payment`** ledger replaces `pending_worker_payout` +
>   `pending_referral_payout` and absorbs the Stripe id columns that used to
>   live on `escrow_milestone`.
> - `escrow_milestone_attachment.uploaded_by_id` removed (uploader derived).
> - `escrow_dispute.filed_by` (FK) → `filed_by_role` string.
> Business logic / endpoints / state machine below are still valid — only the
> persistence shape changed.

## Summary

Real Stripe Connect Express escrow for fixed-price TradeHub contracts.
Replaces the partial mock in `backend/src/escrow/`. Money flows: Employer →
(Stripe Checkout) → Platform balance (HELD per milestone) → (Connect
transfers) → Worker connected account + Referrer connected account, with
Platform retaining the configured fee. Every money movement is recorded as a
`payment` row. Workflow modelled on Upwork fixed-price contracts with
milestones.

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

### 1. Schema (post-2026-05-11 rework — see DATA-MODEL.md §2.4, §3)

- **ESCROW-001 (Must).** `escrow_milestone` model: `id`, **`contract_id` FK → `contract`** (`onDelete: Restrict`), `position` (Int, ordering 1..N), `title` (VarChar 200), `description` (VarChar 2000 NULL), `amount` (Decimal 12,2), `status` (VarChar 20 default `PENDING`), `created_by_role` (VarChar 10 — 'WORKER' | 'EMPLOYER' — drives editing/decline permissions), `submission_message` (VarChar 2000 NULL), `worker_submitted_at`, `employer_approved_at`, `released_at`, `refunded_at`, `disputed_at` (nullable Timestamptz), `release_attempts` (Int default 0), `refund_reason` (VarChar 500 NULL), the six `frozen_*` columns (fee snapshot — see ESCROW-041/045), `created_at`, `updated_at`. Unique `(contract_id, position)`. Index on `status`. **There is no `escrow_transaction` table** — milestones belong directly to a `contract`. **There are no `stripe_*` id columns on the milestone** — every Stripe object id lives on a `payment` row (ESCROW-005).
- **ESCROW-002 (Must).** `escrow_milestone.status` enum (string-validated): `REQUESTED` (worker requested, awaiting employer approval), `PENDING` (employer-created or approved request, fundable), `FUNDED` (CHARGE payment succeeded), `SUBMITTED` (worker submitted work), `RELEASED` (payout authorised), `DISPUTED`, `REFUNDED`, `CANCELED`, `DECLINED` (employer declined a worker's REQUESTED — row preserved), `RELEASE_FAILED` (a payout transfer failed, transient). Terminal: `RELEASED`, `REFUNDED`, `CANCELED`, `DECLINED`. Transitions: `REQUESTED → PENDING` (approve) | `REQUESTED → DECLINED` (decline); `PENDING → FUNDED` (CHARGE paid); `PENDING → CANCELED` (contract canceled / milestone deleted); `FUNDED → SUBMITTED` | `FUNDED → REFUNDED`; `SUBMITTED → RELEASED` (approve or 7-day auto) | `SUBMITTED → DISPUTED`; `RELEASED → RELEASE_FAILED` (transient — see ESCROW-063). A `RELEASED` milestone whose worker isn't Stripe-onboarded simply has its `WORKER_PAYOUT` `payment` row sitting in `status='PENDING'` (ESCROW-068).
- **ESCROW-003 (Must).** `platform_setting` (singleton row, `id` Int default 1): `client_marketplace_fee_percent`, `freelancer_service_fee_percent` (Decimal 5,2); the referral percentages (`account_referral_pct`, `account_referral_window_months`, `project_referral_w2w_pct`, `project_referral_e2e_pct` — owned by the contracts-and-referrals feature); `stripe_fee_passthrough` (VarChar 20 — `EMPLOYER_PAYS` / `PLATFORM_ABSORBS` / `WORKER_ABSORBS`); `updated_at`, `updated_by` (→ staff_member, nullable). The legacy single `referral_commission_percent` column does **not** exist — referral economics moved to the four percentage columns above.
- **ESCROW-004 (Must).** `escrow_dispute` model: `id`, `milestone_id` (BigInt unique — one dispute per milestone), **`filed_by_role` (VarChar 10 — `WORKER` | `EMPLOYER`)** — the filing party is identified by role; the actual `client_profile` is derived via milestone → contract → collaboration. `reason` (VarChar 2000), `status` (VarChar 20 default `OPEN` — `OPEN` / `RESPONDED` / `MEDIATION` / `RESOLVED` / `ARBITRATION_PENDING`), `response`, `responded_at`, `resolution` (Json — `{ worker_pct, employer_refund_pct, platform_kept_fee }`), `arbitration_required` (Boolean default false), `resolved_by` (→ staff_member, nullable), `resolved_at`, `resolution_reasoning`, `created_at`, `updated_at`.
- **ESCROW-005 (Must).** **`payment` model — the money ledger.** Every money movement tied to a milestone is one row: `id`, `milestone_id` (→ escrow_milestone, `Restrict`), `client_profile_id` (→ client_profile — the counterparty), `type` (VarChar 20 — `CHARGE` | `WORKER_PAYOUT` | `REFERRAL_ACCOUNT` | `REFERRAL_W2W` | `REFERRAL_E2E` | `REFUND`), `amount` (Decimal 12,2), `currency`, `status` (VarChar 20 — `PENDING` | `PAID` | `FAILED` | `CANCELED`), `stripe_id` (VarChar 200, unique nullable — PaymentIntent / Transfer / Refund), `failure_reason`, `created_at`, `settled_at`. Per milestone: 1 `CHARGE`, then on release N payout rows (1 `WORKER_PAYOUT` + 0–3 `REFERRAL_*`) **or** 1 `REFUND`. "Held until the recipient connects Stripe" = a payout row left in `status='PENDING'`. This single table replaces the old `pending_worker_payout` + `pending_referral_payout` tables and the milestone-level `stripe_*` columns.
- **ESCROW-006 (Should).** `contract.agreed_amount` is a snapshot/derived field — the live total is `sum(escrow_milestone.amount)` for the contract.
- **ESCROW-007 (Must).** Dev DB only — schema is applied via a fresh migration + reseed (`PROMPTS.md` reset workflow). No production data migration.
- **ESCROW-008 (Must).** `escrow_milestone_attachment` model: `id`, `milestone_id` FK (`onDelete: Cascade`), `phase` (VarChar 15 — `CREATION` | `SUBMISSION`), `file_url`, `original_name`, `mime_type`, `size_bytes`, `created_at`. **No `uploaded_by` column** — the uploader is derived: `phase='SUBMISSION'` → the contract's worker; `phase='CREATION'` → whichever party `escrow_milestone.created_by_role` names.

### 2. Stripe Connect Express onboarding (path: empty → can-receive-payouts)

- **ESCROW-020 (Must).** New endpoint `POST /escrow/onboarding/start` (auth required, worker role, ACTIVE + email-verified). Creates Stripe Express account (`accounts.create({ type: 'express', country: 'GB', email: worker.email, capabilities: { transfers: { requested: true } } })`). Persists returned `account_id` on `client_profile.stripe_connect_account_id` (idempotent — if already set, reuse). Returns `accountLinks.create(...)` URL with `return_url=/wallet?onboarding=complete` and `refresh_url=/wallet?onboarding=incomplete`.
- **ESCROW-021 (Must).** New endpoint `GET /escrow/onboarding/status` (auth, worker only). Returns `{ has_account: bool, account_id: string?, charges_enabled: bool, payouts_enabled: bool, requirements: Stripe-Account-Requirements-shape, onboarding_url: string? }`. Polled by `/wallet` after onboarding redirect.
- **ESCROW-022 (Must).** Stripe webhook handler `account.updated` (Connect events): updates worker's `client_profile.stripe_connect_account_id` capabilities flags (write to a small denormalised cache `client_profile.connect_charges_enabled`, `connect_payouts_enabled` — add columns in same migration). Required so frontend can read "ready to receive payouts" without a Stripe round-trip per page load.
- **ESCROW-023 (Should).** When worker's `payouts_enabled` flips to `true` for the first time, send `MailService.sendPayoutsEnabled(email, name)`: "You're set up — you can now receive payouts via TradeHub." Idempotent — only fires the FIRST time the flag flips true (compare with previous DB value).
- **ESCROW-024 (Must).** Workers without a Connect account but listed in a collaboration are NOT blocked from any other action — the gate is at first-fund attempt only (per Q4 default).

### 3. Milestones — create / edit / delete

- **ESCROW-030 (Must).** Endpoint `POST /escrow/:id/milestones` (auth, ANY party of the collab — both employer and worker may create). Body: `{ title: string (3-200 chars), description?: string (≤2000 chars), amount: decimal (≥ £5), position?: int }`. Server assigns `position` if omitted (next slot). Validates escrow is not `ENDED` / `CANCELED`. Initial status branches on caller role: employer → `PENDING`, worker → `REQUESTED` (employer must approve before funding can begin). Stores `created_by_role`. Returns the new milestone row.
- **ESCROW-031 (Must).** Endpoint `PATCH /escrow/milestones/:milestoneId` (auth, the milestone's creator). Allows editing `title`, `description`, `amount`, `position` ONLY when status is the editable state for that creator: `PENDING` for employer-created, `REQUESTED` for worker-created. Funded+ milestones are read-only (locked).
- **ESCROW-032 (Must).** Endpoint `DELETE /escrow/milestones/:milestoneId` (auth). PENDING → employer-only (the creator). REQUESTED → only the worker who requested it (the employer uses `decline-request` instead, see ESCROW-036). Funded+ milestones cannot be deleted.
- **ESCROW-033 (Should).** Milestone reordering: `position` is editable on PENDING/REQUESTED milestones via PATCH (ESCROW-031). UI surfaces drag-handle in `/escrow/:id`.
- **ESCROW-034 (Must).** Adding a milestone after the contract is partially funded is allowed (e.g., add milestone #4 after #1, #2, #3 are RELEASED). Same endpoint, same validation. New milestones start at the next `position` index.
- **ESCROW-035 (Should).** Concurrency safety: milestone CRUD inside a Prisma transaction; `position` enforced via `(escrow_id, position)` UNIQUE constraint. Two-tab races resolved by retry.
- **ESCROW-036 (Must).** Endpoint `POST /escrow/milestones/:milestoneId/approve-request` (auth, employer party). Allowed only when `status === 'REQUESTED'`. Transitions `REQUESTED → PENDING`. Returns the updated milestone. The milestone is now fundable on the standard PENDING → FUNDED path. Audit event `escrow.milestone.request_approved`.
- **ESCROW-037 (Must).** Endpoint `POST /escrow/milestones/:milestoneId/decline-request` (auth, employer party). Allowed only when `status === 'REQUESTED'`. Transitions `REQUESTED → DECLINED`. The row is preserved (NOT deleted) so the worker sees the outcome on their side and can re-request with different terms (which creates a new REQUESTED row, not a re-open of this one). Audit event `escrow.milestone.request_declined`.
- **ESCROW-038 (Must).** **Attachments** — model defined in ESCROW-008 (`escrow_milestone_attachment`, no `uploaded_by` column). Endpoint `POST /escrow/milestones/:milestoneId/attachments?phase=CREATION|SUBMISSION` (multipart, field `file`). Constraints:
  - `CREATION` phase: only the milestone's creator (matches `created_by_role`), only while status ∈ `{REQUESTED, PENDING}`. Cap: 3 per milestone per phase.
  - `SUBMISSION` phase: worker only, only while status ∈ `{FUNDED, SUBMITTED}`. Cap: 3.
  - Allowed MIME: PDF, JPEG, PNG, WebP. Max size: 25 MB. Stored under `uploads/milestone-attachments/`.
- **ESCROW-039 (Must).** Endpoint `DELETE /escrow/milestones/attachments/:attachmentId` (auth). Permission is checked against the derived uploader (phase + `created_by_role` + the contract's worker/employer — see ESCROW-008): only that party may delete, and only while the milestone status is still in the corresponding phase window (CREATION → REQUESTED/PENDING; SUBMISSION → FUNDED/SUBMITTED). After the milestone advances past that window, attachments freeze.

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
- **ESCROW-043 (Must).** Webhook handler `payment_intent.succeeded`: looks up the `CHARGE` `payment` row by `payment_intent.metadata.milestone_id` (or `transfer_group` fallback). Flips that `payment` row to `status='PAID'` + sets `stripe_id`/`settled_at`. If milestone status is `PENDING` → set to `FUNDED`. If already `FUNDED` (duplicate webhook) → no-op. If `DISPUTED` / `RELEASED` / `REFUNDED` → log warning, no-op. If `CANCELED` → fire refund (safety net).
- **ESCROW-044 (Must).** Webhook handler `payment_intent.payment_failed`: milestone stays `PENDING`, the `CHARGE` `payment` row flips to `status='FAILED'`. Email employer "Payment failed — try again."
- **ESCROW-045 (Must).** At fund time the milestone's `frozen_*` columns are written — `frozen_client_fee_pct`, `frozen_freelancer_fee_pct`, `frozen_referral_fee_pct` and the derived `frozen_worker_payout`, `frozen_referral_commission`, `frozen_platform_fee`. These freeze the fee configuration so a later admin change to `platform_setting` does not retroactively alter in-flight milestones. There is no contract-level `escrow_transaction` row to transition — the escrow-level status (CREATED/ACTIVE/DISPUTED) is **derived** from the milestone statuses + `contract.status` (no stored column).
- **ESCROW-046 (Should).** Email worker on milestone FUNDED: "Funds in escrow for milestone 'X' — start work." System chat message: "Employer funded milestone 'X' — £500 in escrow."

### 5. Submission — worker submits work (path: FUNDED → SUBMITTED)

- **ESCROW-050 (Must).** New endpoint `POST /escrow/milestones/:milestoneId/submit` (auth, worker party). Validates milestone status is `FUNDED`. Body: `{ message: string (≤2000 chars, optional but encouraged) }` — message goes into chat as a system message linked to milestone. Sets `worker_submitted_at = now()`, status `SUBMITTED`. Triggers email to employer: "Milestone 'X' submitted — 7 days to approve or auto-release fires."
- **ESCROW-051 (Must).** System chat message on submit: "Worker submitted work for milestone 'X'." (per Q21 — overrides `scope.md` "do not post system messages" with explicit Decisions Log override).
- **ESCROW-052 (Should).** Worker can revise submission while status is `SUBMITTED` and employer has not yet approved/disputed. New endpoint `PATCH /escrow/milestones/:milestoneId/submission` body `{ message }`. Resets the 7-day auto-release timer. Idempotent.
- **ESCROW-053 (Should).** Worker can withdraw submission (back to `FUNDED`) if employer hasn't acted. `DELETE /escrow/milestones/:milestoneId/submission`. Sets status back to `FUNDED`, cancels the 7-day timer.

### 6. Release — employer approves OR auto-release after 7 days

- **ESCROW-060 (Must).** New endpoint `POST /escrow/milestones/:milestoneId/approve` (auth, employer party). Validates milestone status is `SUBMITTED`. Triggers release flow inline (Stripe transfers).
- **ESCROW-061 (Must).** Release flow (the `payment` ledger is the single record of every transfer):
  1. Compute payouts from the milestone's `frozen_*` snapshot + the referral lines (`referral.service.computeMilestoneCommissions` — see contracts-and-referrals spec).
  2. Insert a `WORKER_PAYOUT` `payment` row. If the worker's Connect account is `payouts_enabled` → fire `transfers.create` (`Idempotency-Key: payment_${paymentId}`), flip the row to `PAID` with `stripe_id`. If not onboarded → leave the row `status='PENDING'` (held — ESCROW-068).
  3. For each referral line, insert a `REFERRAL_ACCOUNT` / `REFERRAL_W2W` / `REFERRAL_E2E` `payment` row; same live-transfer-or-leave-PENDING logic against the referrer's Connect account.
  4. Update milestone: status `RELEASED`, `employer_approved_at` (or just `released_at` for the auto-release path), `released_at`.
  Every transfer is one `payment` row; there are no Stripe id columns on the milestone.
- **ESCROW-062 (Must).** Webhook handler `transfer.paid`: cross-checks the milestone is `RELEASED` (idempotent) and the transfer amount matches expected payout. If mismatch — flag for admin review (audit log).
- **ESCROW-063 (Must).** Webhook handler `transfer.failed`: the `payment` row flips to `status='FAILED'` with `failure_reason`; the milestone moves to `RELEASE_FAILED` (transient). Worker email "Payout failed — fix your Stripe account at /wallet." Manual retry via `POST /escrow/milestones/:milestoneId/retry-release` (worker or admin) once the Connect account is fixed — retry re-fires the transfer for the `FAILED` `payment` row. **No auto-retry** (per Q25).
- **ESCROW-064 (Must).** Auto-release: scheduled job (Nest cron every hour) finds milestones where `status === 'SUBMITTED' AND worker_submitted_at < now() - 7 days`. For each: invokes the same release flow as ESCROW-061. Audit logged with `actor: 'system'`, `reason: 'auto_release_silent_employer'`. Email to employer + worker + referrer.
- **ESCROW-065 (Should).** System chat message on release: "Milestone 'X' released — £475 to worker, £5 to referrer, £20 platform fee." (or similar breakdown). Auto-release variant: "Milestone 'X' auto-released after 7 days of silence."
- **ESCROW-066 (Must).** Approving / auto-releasing milestone N **unblocks milestone N+1 for funding** (per ESCROW-040's `BLOCKED_BY_DISPUTE` check inverse — blocking is by `DISPUTED` only, not by unreleased prior milestones). Per Upwork: only one funded-but-unreleased milestone at a time per contract — so `ESCROW-040` ALSO checks "no other milestone in `FUNDED` or `SUBMITTED` state on this contract." Lockstep funding.
- **ESCROW-067 (Should).** Release on the LAST milestone does NOT auto-end the contract. Either party must explicitly click "End contract" (per Q14, Upwork pattern). Until ended, employer can add new milestones.
- **ESCROW-068 (Must).** **Release without worker Stripe onboarding (held payouts).** When release runs and the worker has no Connect account or `payouts_enabled === false`, the live transfer cannot fire. Instead of failing the release, the milestone still transitions to `RELEASED` and the `WORKER_PAYOUT` `payment` row is simply left in `status='PENDING'` (its money sits on the platform balance). The release path proceeds — referral `payment` rows are created the same way. On the worker side, `MilestoneRow` shows a "Held — connect Stripe to receive" badge plus a banner with a `/wallet` link until they finish onboarding.
- **ESCROW-069 (Must).** **Sweep on Connect onboarding.** When the `account.updated` webhook flips `payouts_enabled` to `true`, `handleAccountUpdated` sweeps the recipient's held `payment` rows: every `payment` for that `client_profile` with `status='PENDING'` (and a `FAILED` retry set) fires `transfers.create` (`Idempotency-Key: payment_${paymentId}`). Successful rows flip to `PAID` with `stripe_id` + `settled_at`; failures flip to `FAILED` with `failure_reason`. One sweep covers both worker payouts and referral commissions — they are all `payment` rows.
- **ESCROW-068b (Must).** Held payouts are **not** a separate table — they are `payment` rows in `status='PENDING'` (model defined in ESCROW-005). The old `PendingWorkerPayout` / `PendingReferralPayout` tables were merged into `payment`.
- **ESCROW-068c (Must).** `GET /escrow/wallet/me` returns the worker's `payment` rows (active / settled / held) grouped by status. `listMilestones` annotates each milestone with `worker_payout_on_hold` (true iff its `WORKER_PAYOUT` `payment` row is `PENDING`/`FAILED`) so `MilestoneRow` can render the held state without joining the wallet payload.

### 7. Refund — voluntary employer-initiated, before SUBMITTED only

- **ESCROW-070 (Must).** New endpoint `POST /escrow/milestones/:milestoneId/refund` (auth, employer party). Allowed when milestone status is `FUNDED` (work not yet submitted). Body: `{ reason: string (≥10 chars, ≤500 chars) }`.
- **ESCROW-071 (Must).** Refund flow:
  1. Find the milestone's `CHARGE` `payment` row (it holds the PaymentIntent in `stripe_id`). `refunds.create({ payment_intent: chargePayment.stripe_id, refund_application_fee: false, reverse_transfer: false })` with `Idempotency-Key: payment_refund_${milestoneId}`. (`reverse_transfer=false` — no transfer fired yet, milestone wasn't released.)
  2. Insert a `REFUND` `payment` row (counterparty = employer) with the Stripe Refund id, `status='PAID'`.
  3. Update milestone: status `REFUNDED`, `refunded_at`.
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

### 9.5 Referral payouts — referrer without Connect

Referral commissions are **`payment` rows** (`type` ∈ `REFERRAL_ACCOUNT` /
`REFERRAL_W2W` / `REFERRAL_E2E`) — there is no separate pending-referral table.

- **ESCROW-095 (Must).** Superseded — referral payouts are `payment` rows (ESCROW-005). Commission economics + line computation: see contracts-and-referrals spec (`computeMilestoneCommissions`).
- **ESCROW-096 (Must).** Release flow (ESCROW-061) inserts a `REFERRAL_*` `payment` row per commission line. If the referrer's Connect account isn't `payouts_enabled`, the row is left `status='PENDING'` (held); otherwise the transfer fires and it flips to `PAID`.
- **ESCROW-097 (Must).** When a referrer completes onboarding, the ESCROW-069 sweep pays their held `REFERRAL_*` `payment` rows — same code path as worker payouts.
- **ESCROW-098 (Should).** Referrer `/wallet` shows held referral `payment` rows with a "Set up payouts to receive £X" CTA when not onboarded.

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
  - There is **no** "create escrow" endpoint and no `EscrowTransaction` shell — milestones are created directly under a `contract` via `POST /contracts/:contractId/milestones` (ESCROW-030). The contract is the escrow container.
- **ESCROW-159 (Should).** OpenAPI / Swagger documentation describes the full state machine in the `/escrow` tag description. Easier for next maintainer.

### 15. Dispute proposal flow (two-party approval) — supersedes ESCROW-083 one-shot resolve

Added 2026-05-24 (PM iteration). The original moderator one-shot resolve (ESCROW-083) becomes the *execution path* underneath a new proposal layer that both parties must accept.

- **ESCROW-160 (Must).** New model `escrow_dispute_proposal`: `id` BigInt PK, `dispute_id` FK (cascade), `proposed_by_id` (→ staff_member, Restrict), `worker_pct` (Int 0..100), `employer_refund_pct` (Int 0..100), `keep_platform_fee` (Boolean), `reasoning` (VarChar 2000), `status` (VarChar 20 — `PENDING_RESPONSE` / `ACCEPTED` / `REJECTED` / `EXECUTED` / `SUPERSEDED`), `worker_decision` + `employer_decision` (VarChar 10 — `PENDING` / `ACCEPTED` / `REJECTED`), `worker_decided_at` + `employer_decided_at`, `worker_decision_note` + `employer_decision_note` (VarChar 500 nullable), `proposed_at`, `resolved_at` (nullable), `execution_audit_id` (→ audit_log, SET NULL). DB CHECK: `worker_pct + employer_refund_pct = 100`. **Partial UNIQUE** `(dispute_id) WHERE status = 'PENDING_RESPONSE'` — at most one in-flight proposal per dispute.
- **ESCROW-161 (Must).** `POST /escrow/admin/disputes/:disputeId/proposals` (gated `disputes.propose`). Body: `{ worker_pct, employer_refund_pct, keep_platform_fee, reasoning }`. Creates the proposal in `status='PENDING_RESPONSE'`. If a prior proposal exists with `status='PENDING_RESPONSE'`, that one is set to `SUPERSEDED` in the same transaction. Both parties get an in-platform notification.
- **ESCROW-162 (Must).** `GET /escrow/disputes/:disputeId/proposals` returns the dispute's full proposal history with the current `PENDING_RESPONSE` proposal split out as `current`, plus an `arbitration_required` boolean computed from `escrow_dispute.status === 'ARBITRATION_PENDING'`. Both parties + staff with `escrow_disputes.read` can call it.
- **ESCROW-163 (Must).** `POST /escrow/disputes/:disputeId/proposals/:proposalId/decision` body `{ decision: 'ACCEPT' | 'REJECT', note?: string }`. Caller must be the worker OR the employer of the dispute (verified by joining dispute → milestone → contract → collaboration). Updates the caller's per-side field (`worker_decision` or `employer_decision`). When BOTH sides have decided:
  - both ACCEPTED → proposal moves to `EXECUTED`. Engine calls the existing `resolveDispute` execution path (ESCROW-083 → ESCROW-084), records the resulting `audit_log` row id into `execution_audit_id`, and sets `dispute.status='RESOLVED'`.
  - any REJECTED → proposal moves to `REJECTED`. Dispute returns to `MEDIATION`. Staff can propose again or escalate (ESCROW-164).
- **ESCROW-164 (Must).** `POST /escrow/admin/disputes/:disputeId/escalate` (gated `disputes.escalate`) body `{ reason }`. Sets `dispute.status='ARBITRATION_PENDING'`. Any open `PENDING_RESPONSE` proposal is marked `SUPERSEDED`. ARBITRATION_PENDING is out-of-platform per ESCROW-086 — the platform takes no further automatic action; resolution returns via the staff `POST /escrow/admin/disputes/:disputeId/resolve` (ESCROW-083), which now also clears the `ARBITRATION_PENDING` state.
- **ESCROW-165 (Must).** **Filer cancels their own dispute.** `POST /escrow/disputes/:disputeId/cancel` — caller must be the original filer of the dispute. Allowed ONLY when `dispute.status === 'OPEN'` (i.e. no response from the counterparty yet). Restores the milestone to its pre-dispute status (`FUNDED` if no submission ever happened, `SUBMITTED` if `worker_submitted_at IS NOT NULL`). Marks the dispute row with a synthetic `status='CANCELED'` and `cancellation_reason='filed_by_mistake'`. Audit-logged.
- **ESCROW-166 (Must).** Frontend — `DisputeProposalView` (`web/src/components/escrow/DisputeProposalView.tsx`) renders the proposal panel for BOTH client surfaces (worker + employer view) and for the admin Escrow disputes tab. Shows the current proposal's split, the per-side decisions, the history, an Accept/Reject pair for the party still pending, the staff Propose form (gated by perm), and an Escalate button (gated by perm).
- **ESCROW-167 (Must).** Stripe refund call in the dispute execution path (ESCROW-084) MUST NOT pass `refund_application_fee`. That parameter is only valid for Connect destination charges; our flow uses regular PaymentIntent + separate transfers, and Stripe rejects the param with a runtime error in this configuration. See Decisions Log 2026-05-24.

### 16. Employer payments view + `/wallet` → `/payments` rename

Added 2026-05-24 (PM iteration). `/wallet` was a worker-only Stripe-Connect-and-ledger surface; we now expose a parallel employer view at the same URL.

- **ESCROW-170 (Must).** The client-app route `/wallet` is renamed to `/payments` for both worker and employer. The old `/wallet` URL is retained as a `<Navigate to="/payments" replace />` redirect so old Stripe Connect return URLs and stale links still land correctly. Frontend nav label is **Payments** for both surfaces.
- **ESCROW-171 (Must).** Stripe Connect onboarding `return_url` / `refresh_url` now point at `/payments?onboarding=complete` / `/payments?onboarding=incomplete` (was `/wallet?...`). `MilestoneRow` copy + inline links updated accordingly.
- **ESCROW-172 (Must).** **Worker `/payments`** — unchanged behavioural surface: Stripe Connect onboarding banner, active escrow list, released history, failed transfers, held-until-Stripe payouts, pending referral payouts (the existing `WalletPage` body, just renamed externally).
- **ESCROW-173 (Must).** **Employer `/payments`** — new view. Endpoint `GET /escrow/payments/me/employer` (gated `@Roles('EMPLOYER')`, `client_profile_id` resolved from JWT). Returns:
  - `totals[]` — grouped `{ type: 'CHARGE'|'REFUND', status: 'PENDING'|'PAID'|'FAILED'|'CANCELED', count, amount }`
  - `payments[]` (limit 200, newest first) — every `payment` row with `client_profile_id = me` and `type IN ('CHARGE','REFUND')`. Includes milestone (`id`, `title`, `contract_id`, `status`) + worker (`id`, `display_name`, `slug`) for the table row.
  - `open_disputes[]` — every `escrow_dispute` whose milestone's contract belongs to me and whose `status` is not in {RESOLVED, CANCELED, ARBITRATION_PENDING}. Includes the milestone for the link.
- **ESCROW-174 (Must).** Frontend `EmployerPaymentsView` component renders the totals as four summary cards (Charged · Pending · Failed · Refunded), the open disputes as warning-tinted rows linking to `/escrow/:contract_id`, and the payments table (Type · Status · Milestone · Worker · Date · Amount) with refund amounts prefixed `−` and red failure-reason text below the status badge when present.

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
| 2026-05-10 | **Worker can request milestones (REQUESTED state).** Worker creates a milestone via the same `POST /escrow/:id/milestones` endpoint; backend stores it as `REQUESTED` (not `PENDING`) when the caller is a worker. Employer then approves (`REQUESTED → PENDING`, fundable) or declines (`REQUESTED → DECLINED`, terminal). | Upwork allows workers to propose milestones; mirrors that. Employer cannot edit the worker's request to keep the proposal honest — they can only accept it as-is or decline (worker re-requests with new terms). |
| 2026-05-10 | **DECLINED instead of delete.** When employer declines a worker's REQUESTED milestone, the row stays with `status='DECLINED'`. Worker sees the outcome in the timeline. | The original draft deleted the row; the worker then had no signal that anything happened. Preserving the row gives a clear audit trail and lets worker re-request with adjusted terms knowing what was previously rejected. |
| 2026-05-10 | **Detailed milestones: description + attachments.** Milestone gets a long-form `description` field (≤2000 chars) and a per-phase attachment list (CREATION ≤3 files: PDF/JPEG/PNG/WebP ≤25MB each; SUBMISSION ≤3 files, worker-only). | Construction milestones need spec docs and reference images at proposal time, then deliverable photos at submission time. Per-phase cap (3 each) keeps storage bounded; worker can also add SUBMISSION attachments to demonstrate work done. |
| 2026-05-10 | **Release without worker Stripe onboarding (held payouts).** When release fires and the worker has no payouts-enabled Connect account, the milestone still transitions to `RELEASED` (so the employer's view shows the work as paid) and the worker's net amount is parked as a `PendingWorkerPayout` row. UI on worker side: "Held — connect Stripe to receive" badge + banner with `/wallet` link. Sweep on `account.updated → payouts_enabled=true` mirrors the existing `payPendingReferralPayouts` flow. | Without this, releasing to an unonboarded worker fails the whole release transition and confuses both sides. With this, the employer's commitment is settled, the money is safely parked on the platform, and the worker has a clear path: connect Stripe and the funds sweep automatically. Mirrors the referral pending-payout pattern that already worked. |
| **2026-05-11 (schema rework)** | **`escrow_transaction` table dropped.** A milestone belongs directly to a `contract` (`escrow_milestone.contract_id`). The escrow-level status is derived from milestone statuses + `contract.status`. | The `escrow_transaction` row was a hollow 1:1 satellite of the contract (only `status` + `currency` after earlier slimming). The `contract → escrow_transaction → escrow_milestone` chain confused "transaction" (a payment) with "escrow container". The contract IS the escrow container. |
| **2026-05-11 (schema rework)** | **Unified `payment` ledger.** `pending_worker_payout` + `pending_referral_payout` merged, and the milestone-level `stripe_*` id columns absorbed, into one `payment` table: every money movement (CHARGE / WORKER_PAYOUT / REFERRAL_* / REFUND) is a row with a status. "Pending/held" is `status='PENDING'`, not a separate table. | The old model only recorded *stuck* payouts; live payouts and the employer's charge were scattered (milestone columns / nowhere). A single append-only ledger gives reconcilable money history per client and removes the asymmetry. |
| 2026-05-24 | **Two-party dispute proposal flow (ESCROW-160…167) supersedes one-shot staff resolve.** Staff proposes a split; worker AND employer each `ACCEPT`; engine executes via the existing `resolveDispute` (ESCROW-083). Either side `REJECT` → proposal closes, staff can re-propose or escalate to `ARBITRATION_PENDING`. | Original design had staff directly decide the split. PM wanted both parties to explicitly agree before money moves, with escalation as a fallback rather than the default. Existing one-shot resolve becomes the execution path under the proposal layer; admin extensibility and audit are unchanged. |
| 2026-05-24 | **Filer can cancel an OPEN dispute (ESCROW-165).** Allowed only while no counterparty response exists; restores the milestone to its pre-dispute status. | Disputes were sometimes filed by mistake (mis-click); previously the only path back was admin force-resolve. Self-cancel before the counterparty engages is safe, requires no money movement, and removes a category of admin tickets. |
| 2026-05-24 | **Drop `refund_application_fee` from `refunds.create` calls (ESCROW-167).** | The parameter is only valid for Connect-application-created destination charges; our flow uses regular PaymentIntent + separate transfers and Stripe rejects the call with `"refund_application_fee can only be used by the Connect application that created the charge"`. Removing the parameter resolves the runtime crash that surfaced during dispute resolution testing. |
| 2026-05-24 | **`/wallet` → `/payments` rename + employer view (ESCROW-170…174).** Both worker and employer surfaces live at `/payments`. Worker view unchanged behaviourally; employer view is a new totals-summary + ledger table + open-disputes panel driven by `GET /escrow/payments/me/employer`. `/wallet` retained as a redirect for back-compat with Stripe Connect return URLs. | "Wallet" implied a balance-bearing account, which is a Stripe Connect concept that doesn't apply to employers (they pay through Checkout). "Payments" is accurate for both sides. Employer view answers "where did my money go on this contract" without a SQL console — previously available only to staff. |
| **2026-05-11 (schema rework)** | **`escrow_milestone_attachment.uploaded_by_id` dropped; `escrow_dispute.filed_by` → `filed_by_role`.** Both the uploader and the disputing party are derivable from the milestone's `created_by_role` / `phase` and the contract's collaboration roles. | Don't store what's derivable, and don't add an FK to `client_profile` when a `WORKER`/`EMPLOYER` role string + the existing relationship suffices. Consistent with `created_by_role`. |
