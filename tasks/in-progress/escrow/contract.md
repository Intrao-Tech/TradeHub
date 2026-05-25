# Contract — Escrow

Sealed technical decisions for the implementation session. Frontend + tests sessions read this as the source of truth for shapes.

---

> ⚠️ **SUPERSEDED IN PART — SCHEMA REVISED 2026-05-11.**
> §1 below (Schema migrations: the SQL DDL + Prisma models + the
> `EscrowTransaction` state machine §1D) describes the **old** data model and
> is **stale**. The authoritative schema is now `tasks/in-progress/DATA-MODEL.md`
> + `backend/prisma/schema.prisma` + `db-schema-full.sql` (repo root).
>
> What §1 gets wrong, and the corrections (full detail in DATA-MODEL.md):
> - **No `escrow_transaction` table.** `escrow_milestone.contract_id` → `contract`
>   directly. §1D's contract-level state machine no longer maps to a row —
>   escrow-level status is derived.
> - **No `stripe_*` id columns on `escrow_milestone`**, and **no
>   `pending_referral_payout` table.** Both folded into the new unified
>   **`payment`** ledger (one row per money movement: CHARGE / WORKER_PAYOUT /
>   REFERRAL_* / REFUND; status PENDING/PAID/FAILED/CANCELED).
> - `escrow_milestone` gained `description`, `created_by_role`,
>   `submission_message`, six `frozen_*` fee-snapshot columns; status enum
>   gained `REQUESTED` / `DECLINED` / `RELEASE_FAILED`.
> - `escrow_milestone_attachment` exists (no `uploaded_by` column);
>   `escrow_dispute.filed_by` → `filed_by_role`.
> - `platform_setting` has the four referral-percentage columns, not a single
>   `referral_commission_percent`.
>
> The §1C milestone state machine, §2 endpoint *logic*, §3 slice plan, §4
> audit events and §5–§9 are still broadly valid — but endpoint paths/shapes
> shift (`escrow_id` → `contract_id`; release/refund/onboarding now read &
> write `payment` rows). Re-derive the precise API surface against the new
> schema during the code-rewrite phase.

---

## 1. Schema migrations

### 1A. `add_escrow_milestones_and_settings`

```sql
-- 4 new tables + 2 new columns on client_profile

CREATE TABLE escrow_milestone (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  escrow_id BIGINT NOT NULL REFERENCES escrow_transaction(id) ON DELETE CASCADE,
  position INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  worker_submitted_at TIMESTAMPTZ,
  employer_approved_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  disputed_at TIMESTAMPTZ,
  release_attempts INT NOT NULL DEFAULT 0,
  stripe_pi_id VARCHAR(200) UNIQUE,
  stripe_charge_id VARCHAR(200) UNIQUE,
  stripe_transfer_id VARCHAR(200) UNIQUE,
  stripe_refund_id VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (escrow_id, position)
);
CREATE INDEX escrow_milestone_status_idx ON escrow_milestone(status);
CREATE INDEX escrow_milestone_escrow_id_idx ON escrow_milestone(escrow_id);

CREATE TABLE platform_setting (
  id INT PRIMARY KEY DEFAULT 1,
  client_marketplace_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 5.0,
  freelancer_service_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 10.0,
  referral_commission_percent DECIMAL(5,2) NOT NULL DEFAULT 0.5,
  stripe_fee_passthrough VARCHAR(20) NOT NULL DEFAULT 'EMPLOYER_PAYS',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by BIGINT REFERENCES staff_member(id),
  CHECK (id = 1)
);
INSERT INTO platform_setting (id) VALUES (1);

CREATE TABLE escrow_dispute (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  milestone_id BIGINT NOT NULL UNIQUE REFERENCES escrow_milestone(id) ON DELETE CASCADE,
  filed_by BIGINT NOT NULL REFERENCES client_profile(id),
  reason VARCHAR(2000) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  resolution JSONB,
  arbitration_required BOOLEAN NOT NULL DEFAULT false,
  resolved_by BIGINT REFERENCES staff_member(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX escrow_dispute_status_idx ON escrow_dispute(status);

CREATE TABLE pending_referral_payout (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  referrer_client_profile_id BIGINT NOT NULL REFERENCES client_profile(id),
  milestone_id BIGINT NOT NULL REFERENCES escrow_milestone(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  stripe_transfer_id VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX pending_referral_referrer_idx ON pending_referral_payout(referrer_client_profile_id, status);

ALTER TABLE client_profile
  ADD COLUMN connect_charges_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN connect_payouts_enabled BOOLEAN NOT NULL DEFAULT false;
```

Migration name: `20260509_add_escrow_milestones_and_settings`. No data backfill — all new columns/tables are additive. Existing `escrow_transaction` rows (if any from mock testing) keep their data; new flow uses milestone children.

### 1B. Prisma schema additions

Mirror SQL above into `backend/prisma/schema.prisma` after the existing `EscrowTransaction` model:

```prisma
model EscrowMilestone {
  id                    BigInt    @id @default(autoincrement())
  escrow_id             BigInt
  position              Int
  title                 String    @db.VarChar(200)
  amount                Decimal   @db.Decimal(12, 2)
  status                String    @default("PENDING") @db.VarChar(20)
  worker_submitted_at   DateTime? @db.Timestamptz()
  employer_approved_at  DateTime? @db.Timestamptz()
  released_at           DateTime? @db.Timestamptz()
  refunded_at           DateTime? @db.Timestamptz()
  disputed_at           DateTime? @db.Timestamptz()
  release_attempts      Int       @default(0)
  stripe_pi_id          String?   @unique @db.VarChar(200)
  stripe_charge_id      String?   @unique @db.VarChar(200)
  stripe_transfer_id    String?   @unique @db.VarChar(200)
  stripe_refund_id      String?   @db.VarChar(200)
  created_at            DateTime  @default(now()) @db.Timestamptz()
  updated_at            DateTime  @updatedAt @db.Timestamptz()

  escrow   EscrowTransaction @relation(fields: [escrow_id], references: [id], onDelete: Cascade)
  dispute  EscrowDispute?
  pending_referral_payouts PendingReferralPayout[]

  @@unique([escrow_id, position])
  @@index([status])
  @@index([escrow_id])
  @@map("escrow_milestone")
}

model PlatformSetting {
  id                              Int      @id @default(1)
  client_marketplace_fee_percent  Decimal  @default(5.0)  @db.Decimal(5, 2)
  freelancer_service_fee_percent  Decimal  @default(10.0) @db.Decimal(5, 2)
  referral_commission_percent     Decimal  @default(0.5)  @db.Decimal(5, 2)
  stripe_fee_passthrough          String   @default("EMPLOYER_PAYS") @db.VarChar(20)
  updated_at                      DateTime @updatedAt @db.Timestamptz()
  updated_by                      BigInt?

  updater StaffMember? @relation(fields: [updated_by], references: [id])

  @@map("platform_setting")
}

model EscrowDispute {
  id                    BigInt    @id @default(autoincrement())
  milestone_id          BigInt    @unique
  filed_by              BigInt
  reason                String    @db.VarChar(2000)
  status                String    @default("OPEN") @db.VarChar(20)
  resolution            Json?
  arbitration_required  Boolean   @default(false)
  resolved_by           BigInt?
  resolved_at           DateTime? @db.Timestamptz()
  created_at            DateTime  @default(now()) @db.Timestamptz()
  updated_at            DateTime  @updatedAt @db.Timestamptz()

  milestone EscrowMilestone @relation(fields: [milestone_id], references: [id], onDelete: Cascade)
  filer     ClientProfile   @relation("DisputeFiler", fields: [filed_by], references: [id])
  resolver  StaffMember?    @relation(fields: [resolved_by], references: [id])

  @@index([status])
  @@map("escrow_dispute")
}

model PendingReferralPayout {
  id                          BigInt   @id @default(autoincrement())
  referrer_client_profile_id  BigInt
  milestone_id                BigInt
  amount                      Decimal  @db.Decimal(12, 2)
  currency                    String   @default("GBP") @db.VarChar(3)
  status                      String   @default("PENDING") @db.VarChar(20)
  stripe_transfer_id          String?  @db.VarChar(200)
  created_at                  DateTime @default(now()) @db.Timestamptz()
  paid_at                     DateTime? @db.Timestamptz()

  referrer  ClientProfile   @relation("ReferralPayoutReferrer", fields: [referrer_client_profile_id], references: [id])
  milestone EscrowMilestone @relation(fields: [milestone_id], references: [id], onDelete: Cascade)

  @@index([referrer_client_profile_id, status])
  @@map("pending_referral_payout")
}

// Extend ClientProfile
model ClientProfile {
  // ... existing fields
  connect_charges_enabled  Boolean @default(false)
  connect_payouts_enabled  Boolean @default(false)
  // ... existing relations
  filed_disputes           EscrowDispute[] @relation("DisputeFiler")
  referral_payouts         PendingReferralPayout[] @relation("ReferralPayoutReferrer")
}

// Extend EscrowTransaction
model EscrowTransaction {
  // ... existing fields
  // status enum extended: CREATED, ACTIVE, DISPUTED, ENDED, CANCELED
  milestones EscrowMilestone[]
}
```

### 1C. `EscrowMilestone.status` state machine

```
                     ┌──── REFUNDED (terminal — voluntary, before SUBMITTED)
                     │
     PENDING ──fund──→ FUNDED ──submit──→ SUBMITTED ──approve──→ RELEASED (terminal — happy path)
        │              │                    │           or
        │              │                    │       auto-release
        ↓              ↓                    │       after 7 days
     CANCELED      DISPUTED                 │
     (terminal     (filed by either         │
      — pre-fund   party — blocks           │
      cancel)     subsequent funding) ◄────┘
                     │
                     ↓
                 RESOLUTION
                  (moderator decides)
                     ├─→ RELEASED (transfers fired, partial or full)
                     ├─→ REFUNDED (transfers fired, partial or full)
                     └─→ split (some to worker, some refund) — both terminal states recorded

RELEASE_FAILED is a transient state set by webhook transfer.failed; manual retry returns to RELEASED.
```

### 1D. `EscrowTransaction.status` state machine (contract-level)

```
CREATED ──first_milestone_funded──→ ACTIVE
                                       │
                                       ├──any_milestone_DISPUTED──→ DISPUTED
                                       │                              │
                                       │                              └──last_dispute_resolved──→ ACTIVE
                                       │
                                       ├──end_contract──→ ENDED (terminal)
                                       │
                                       └──worker_decline_or_cancel_unfunded──→ CANCELED (terminal)

CREATED ──cancel_unfunded──→ CANCELED (terminal — never had a single funded milestone)
```

---

## 2. Endpoints

### 2A. Worker Connect onboarding

#### `POST /escrow/onboarding/start`
Auth: JwtAuthGuard + @Roles('WORKER') + AccountStateGuard + @RequiresVerifiedEmail()

Request body: empty.

Response 200:
```json
{
  "account_id": "acct_...",
  "onboarding_url": "https://connect.stripe.com/express/onboarding/...",
  "expires_at": "2026-05-09T22:00:00Z"
}
```

Errors:
- `403 NOT_WORKER` — caller isn't a worker
- `503 STRIPE_NOT_CONFIGURED`

Audit: `connect.onboarding.started { worker_id, account_id }`

#### `GET /escrow/onboarding/status`
Auth: JwtAuthGuard + @Roles('WORKER')

Response 200:
```json
{
  "has_account": true,
  "account_id": "acct_...",
  "charges_enabled": false,
  "payouts_enabled": false,
  "details_submitted": true,
  "requirements": { "currently_due": ["business_profile.url"], "past_due": [] },
  "onboarding_url": "https://connect.stripe.com/express/...?refresh_token=..." 
}
```

When account fully onboarded: `payouts_enabled: true`, `requirements` empty, `onboarding_url` null.

### 2B. Milestone CRUD

#### `POST /escrow/:escrowId/milestones`
Auth: employer party of the collab.

Request:
```json
{ "title": "Foundation work", "amount": "500.00", "position": 1 }
```

Response 201: full milestone row.

Errors:
- `403 NOT_EMPLOYER` — caller isn't the employer party
- `400 INVALID_STATE` — escrow contract is `ENDED` / `CANCELED`
- `400 AMOUNT_TOO_SMALL` — amount < £5.00
- `400 POSITION_CONFLICT` — `(escrow_id, position)` collision

Audit: `escrow.milestone.created { milestone_id, amount, position }`

#### `PATCH /escrow/milestones/:milestoneId`
Auth: employer party.

Request body partial: `{ title?, amount?, position? }`. Allowed only when `milestone.status === 'PENDING'`.

Response 200: updated milestone.

Errors:
- `409 INVALID_STATE` — milestone is FUNDED+

#### `DELETE /escrow/milestones/:milestoneId`
Auth: employer party. Allowed only when `milestone.status === 'PENDING'`.

Response 204.

### 2C. Funding

#### `POST /escrow/milestones/:milestoneId/fund`
Auth: employer party. Throttle: 5/hour per IP.

Request body: empty.

Response 200:
```json
{
  "checkout_url": "https://checkout.stripe.com/...",
  "session_id": "cs_test_...",
  "breakdown": {
    "job_amount": "500.00",
    "client_marketplace_fee": "25.00",
    "estimated_stripe_fee": "8.10",
    "total_charge": "533.10",
    "worker_payout_at_release": "450.00",
    "platform_keep_at_release": "78.10",
    "referral_commission_at_release": "5.00"
  }
}
```

Errors:
- `409 WORKER_NOT_ONBOARDED` body `{ onboarding_required: true }` — worker has no Connect account or `payouts_enabled: false`
- `409 BLOCKED_BY_DISPUTE` — another milestone on this contract is DISPUTED
- `409 BLOCKED_BY_OTHER_FUNDED` — another milestone is FUNDED or SUBMITTED (lockstep funding)
- `409 INVALID_STATE` — milestone status not PENDING
- `503 STRIPE_NOT_CONFIGURED`

Stripe Idempotency-Key: `escrow_milestone_${milestoneId}_fund`

Audit: (deferred to webhook) `escrow.milestone.funded { milestone_id, amount, payment_intent_id }`

### 2D. Submission / Release / Refund / Dispute / Cancel

#### `POST /escrow/milestones/:milestoneId/submit`
Auth: worker party.

Body: `{ message?: string (≤2000 chars) }`

Response 200: updated milestone.

Errors: `409 INVALID_STATE` if not FUNDED.

Side effects: chat system message, email to employer, audit `escrow.milestone.submitted { milestone_id }`.

#### `POST /escrow/milestones/:milestoneId/approve`
Auth: employer party.

Response 200: updated milestone with embedded transfer details.

Side effects: `transfers.create` to worker + referrer (or PendingReferralPayout if referrer not onboarded), chat system message, emails to worker + referrer, audit `escrow.milestone.released { milestone_id, worker_amount, referral_amount, platform_fee, transfer_ids, actor: 'employer' }`.

Idempotency-Key: `escrow_milestone_${milestoneId}_release_worker`, `escrow_milestone_${milestoneId}_release_referral`.

#### `POST /escrow/milestones/:milestoneId/refund`
Auth: employer party. Allowed when status is FUNDED (not SUBMITTED).

Body: `{ reason: string (≥10, ≤500 chars) }`

Response 200: updated milestone.

Errors: `409 INVALID_STATE` if not FUNDED, `409 USE_DISPUTE_FLOW` if SUBMITTED.

Idempotency-Key: `escrow_milestone_${milestoneId}_refund`.

Audit: `escrow.milestone.refunded { milestone_id, amount, reason }`.

#### `POST /escrow/milestones/:milestoneId/dispute`
Auth: either party. Throttle: 3/hour per user.

Body: `{ reason: string (≥10, ≤2000 chars) }`

Response 201: dispute row + updated milestone.

Audit: `escrow.milestone.disputed { milestone_id, dispute_id, filed_by }`.

#### `POST /escrow/disputes/:disputeId/respond`
Auth: counterparty (the party who didn't file).

Body: `{ response: string, resolution: 'accept' | 'reject' }`

Response 200: updated dispute. If `accept` and the counter-proposal is accepting full opposing position → automatic resolution applied; otherwise escalates to moderator.

#### `POST /admin/escrow/disputes/:disputeId/resolve`
Auth: STAFF role (moderator or admin).

Body: `{ worker_pct: number, employer_refund_pct: number, platform_kept_fee: boolean, reasoning: string (≥30 chars) }`

Validation: `worker_pct + employer_refund_pct === 100`.

Response 200: resolved dispute row + updated milestone.

Side effects: split transfers + refunds fire; chat system message; emails.

Audit: `escrow.dispute.resolved { dispute_id, milestone_id, resolution, resolved_by }`.

#### `POST /escrow/cancel`
Auth: either party. Allowed when no milestones funded.

Body: `{ reason: string }`

Response 200: updated escrow + collab.

Audit: `escrow.contract.canceled { escrow_id, canceled_by }`.

#### `POST /escrow/decline` (worker decline post-fund)
Auth: worker party.

Body: `{ reason: string }`

Response 200: full refund of all FUNDED milestones, updated escrow + collab.

Audit: `escrow.contract.canceled { escrow_id, canceled_by, reason: 'worker_decline', refunded_count, refunded_amount }`.

#### `POST /escrow/end-contract`
Auth: either party.

Response 200: triggers 7-day contest window. Other party emailed + in-app notification.

If silent for 7 days → cron job auto-completes the contract.

Audit: `escrow.contract.end_initiated { escrow_id, initiated_by }`, then `escrow.contract.ended { escrow_id, ended_by }` on actual close.

### 2E. Wallet + admin settings

#### `GET /wallet/me`
Auth: JwtAuthGuard.

Response 200:
```json
{
  "onboarding": {
    "has_account": true,
    "payouts_enabled": true,
    "onboarding_url": null
  },
  "active_escrow": [
    { "milestone_id": "...", "title": "...", "amount": "500.00", "status": "FUNDED", "contract_id": "...", "expected_payout": "450.00" }
  ],
  "released_history": [
    { "milestone_id": "...", "title": "...", "amount": "450.00", "released_at": "..." }
  ],
  "pending_referral_payouts": [
    { "id": "...", "amount": "5.00", "milestone_title": "...", "created_at": "..." }
  ],
  "failed_transfers": [
    { "milestone_id": "...", "amount": "...", "reason": "..." }
  ]
}
```

#### `GET /admin/settings/platform`
Auth: ADMIN role.

Response 200: full `PlatformSetting` row.

#### `PATCH /admin/settings/platform`
Auth: ADMIN role. Throttle: 60/hour.

Body: subset of `client_marketplace_fee_percent`, `freelancer_service_fee_percent`, `referral_commission_percent`, `stripe_fee_passthrough`.

Validates ranges. Writes audit `platform.settings_changed { from, to, actor }`.

#### `GET /escrow/fee-preview?amount=1000`
Auth: any role.

Response 200: breakdown for given amount based on current PlatformSetting. Pure read; no Stripe call.

### 2F. Removed mock endpoints

The following are REMOVED in this feature (per ESCROW-158):

- `POST /escrow/:id/confirm-deposit` — webhook does this; staff endpoint was creating desync.
- `POST /escrow/:id/release` — replaced by per-milestone approve.
- `POST /escrow/:id/refund` — replaced by per-milestone refund.
- `POST /escrow/:id/deposit` — replaced by `POST /escrow/milestones/:milestoneId/fund`.
- `POST /escrow/:id/dispute` — replaced by per-milestone dispute.

These endpoints are deleted from `escrow.controller.ts`. The 410 Gone response is intentional — there were no production callers (mock-only).

`POST /escrow/collaboration/:collaborationId` (create escrow shell) is KEPT but extended: now creates an `EscrowTransaction` with no milestones; employer adds them via ESCROW-030.

### 2G. Webhook events

Wired in `webhooks/stripe.service.ts`:

| Event | Handler | Effect |
|---|---|---|
| `payment_intent.succeeded` | onPaymentIntentSucceeded | milestone PENDING → FUNDED, EscrowTransaction CREATED → ACTIVE on first |
| `payment_intent.payment_failed` | onPaymentIntentFailed | milestone stays PENDING, employer emailed |
| `charge.refunded` | onChargeRefunded | milestone → REFUNDED (idempotent) |
| `charge.dispute.created` | onChargeDisputeCreated | milestone → DISPUTED (chargeback by employer's bank — different from app dispute), admin alerted |
| `charge.dispute.closed` | onChargeDisputeClosed | log only |
| `transfer.paid` | onTransferPaid | milestone RELEASED confirmed (idempotent) |
| `transfer.failed` | onTransferFailed | milestone → RELEASE_FAILED, worker emailed, retry available |
| `transfer.reversed` | onTransferReversed | log warn, admin alerted |
| `account.updated` | onAccountUpdated | update `client_profile.connect_*_enabled` flags; on first `payouts_enabled=true`, send onboarding-complete email + trigger PendingReferralPayout backfill |
| `account.application.deauthorized` | onAccountDeauthorized | flag `client_profile.connect_*_enabled=false`, email worker |
| `payout.paid` / `payout.failed` | onPayout | log only (Stripe pays worker on its own schedule) |

Mail dispatch is fire-and-forget; idempotency via state-check before write.

---

## 3. Slice plan (PRs)

### Slice A — Schema + Connect onboarding (~3 days)

**Backend**
- Migration: add 4 tables + 2 columns
- `escrow.module.ts`: extend
- `escrow.service.ts`: `startOnboarding`, `getOnboardingStatus`
- `escrow.controller.ts`: 2 new endpoints
- `webhooks/stripe.service.ts`: handle `account.updated`, `account.application.deauthorized`
- `mail.service.ts`: `sendPayoutsEnabled`

**Frontend**
- `web/src/pages/WalletPage.tsx`: new (replaces nothing)
- Onboarding banner with redirect
- `App.tsx`: register `/wallet` route + nav link

**Tests** (parallel session, separate folder `tests-escrow/`)
- `connect-onboarding.e2e-spec.ts` — onboarding URL creation, webhook flag flip
- `wallet.spec.ts` — banner states

**Commits**: `feat(escrow): connect onboarding + /wallet placeholder` (1-2 commits)

### Slice B — Milestones + Fund flow (~4 days)

**Backend**
- `escrow.service.ts`: milestone CRUD + fund
- `escrow.controller.ts`: 4 new endpoints (POST milestones, PATCH, DELETE, POST fund)
- `webhooks/stripe.service.ts`: handle `payment_intent.succeeded` for milestones
- `escrow.constants.ts`: enum for status

**Frontend**
- `web/src/pages/EscrowDetailPage.tsx`: replace placeholder body
- Milestone list component
- Fund button → Stripe Checkout redirect
- Success/cancel return URL handling

**Tests**
- `escrow-fund.e2e-spec.ts` — milestone CRUD, fund happy path, idempotency
- `escrow-milestones.spec.ts` — frontend tests

**Commits**: `feat(escrow): milestones + fund flow` (2-3 commits)

### Slice C — Submission + Release + Auto-release (~3 days)

**Backend**
- `escrow.service.ts`: submit, approve, retry-release
- Auto-release cron job (`@Cron('0 * * * *')` — hourly)
- `webhooks/stripe.service.ts`: handle `transfer.paid`, `transfer.failed`
- PendingReferralPayout backfill (triggered by `account.updated` flagging payouts_enabled true for the first time)

**Frontend**
- Submit / Approve buttons on `/escrow/:id`
- 7-day countdown UI

**Tests**
- `escrow-release.e2e-spec.ts` — full release flow, transfer idempotency
- `escrow-auto-release.spec.ts` — cron job + 7-day timing

**Commits**: `feat(escrow): submission + release + auto-release` (2-3 commits)

### Slice D — Refund + Dispute + Cancel (~4 days)

**Backend**
- `escrow.service.ts`: refund, dispute, dispute respond, dispute resolve, cancel, decline, end-contract
- `escrow.controller.ts`: ~8 new endpoints
- Cron job for end-contract auto-close (7-day silent contest window)
- Moderator queue endpoints

**Frontend**
- Refund / Dispute buttons on `/escrow/:id`
- `/admin/escrow/disputes` queue UI
- Dispute resolution form

**Tests**
- `escrow-refund.e2e-spec.ts`
- `escrow-dispute.e2e-spec.ts`
- `escrow-cancel.e2e-spec.ts`

**Commits**: `feat(escrow): refund + dispute + cancel + moderator queue` (3-4 commits)

### Slice E — Wallet + Admin settings + System messages + Polish (~3 days)

**Backend**
- `wallet.controller.ts` + service
- `admin/settings.controller.ts` + service
- System chat messages on every escrow event (Q21) — extends `chat.gateway.ts` to broadcast system messages
- Email notifications wired (per ESCROW-156)

**Frontend**
- `/wallet` full ledger
- `/admin/settings` form
- Chat system message styling (collapsible group, distinct background)
- "Hide system messages" toggle

**Tests**
- `wallet.spec.ts` — full ledger
- `platform-settings.spec.ts` — admin form + audit
- System message visibility tests

**Commits**: `feat(escrow): wallet + admin settings + chat system messages` (3 commits)

### Slice F — Audit + state cleanup + observability (~2 days)

**Backend**
- Move escrow status strings to `constants.ts` enum
- Audit log on every transition (verify ESCROW-153 coverage)
- `/escrow/providers` feature flag endpoint
- Remove mock endpoints (per ESCROW-158)
- OpenAPI/Swagger documentation pass

**Frontend**
- Hide all escrow CTAs when `/escrow/providers` returns `{ stripe_connect: false }`
- Polish: loading states, error boundaries, accessibility pass

**Tests**
- Audit log coverage tests
- Provider flag tests

**Commits**: `chore(escrow): audit + state cleanup + provider flag + remove mocks` (2 commits)

**Total**: ~19 days of implementation. With tests session running in parallel via PROMPTS.md §2, the full feature ships in ~3 weeks.

---

## 4. Audit events

Written via `AuditService.log(account_id, action, entity_type?, entity_id?, metadata?, ip?)`.

| Event | When | metadata |
|---|---|---|
| `connect.onboarding.started` | `POST /escrow/onboarding/start` succeeds | `{ worker_id, account_id }` |
| `connect.onboarding.completed` | webhook `account.updated` flips `payouts_enabled` true (first time) | `{ worker_id, account_id }` |
| `escrow.milestone.created` | `POST /escrow/:id/milestones` | `{ milestone_id, amount, position }` |
| `escrow.milestone.funded` | webhook `payment_intent.succeeded` | `{ milestone_id, amount, payment_intent_id }` |
| `escrow.milestone.submitted` | `POST .../submit` | `{ milestone_id, message_length }` |
| `escrow.milestone.released` | `POST .../approve` OR auto-release cron | `{ milestone_id, worker_amount, referral_amount, platform_fee, transfer_ids, actor }` |
| `escrow.milestone.refunded` | `POST .../refund` | `{ milestone_id, amount, reason }` |
| `escrow.milestone.disputed` | `POST .../dispute` | `{ milestone_id, dispute_id, filed_by }` |
| `escrow.dispute.responded` | `POST /escrow/disputes/:id/respond` | `{ dispute_id, milestone_id, resolution }` |
| `escrow.dispute.resolved` | `POST /admin/escrow/disputes/:id/resolve` | `{ dispute_id, milestone_id, resolution, resolved_by }` |
| `escrow.contract.end_initiated` | `POST /escrow/end-contract` | `{ escrow_id, initiated_by }` |
| `escrow.contract.ended` | 7-day silent OR explicit confirm | `{ escrow_id, ended_by }` |
| `escrow.contract.canceled` | `POST /escrow/cancel` OR `/decline` | `{ escrow_id, canceled_by, reason, refunded_count?, refunded_amount? }` |
| `escrow.transfer.failed` | webhook `transfer.failed` | `{ milestone_id, attempt, error_code }` |
| `platform.settings_changed` | `PATCH /admin/settings/platform` | `{ from: PlatformSetting, to: PlatformSetting, actor }` |

`account_id` is the **subject** (the user the action affects, usually the contract party). Staff actions (moderator dispute resolve, admin settings change) record `staff_member_id` in metadata.

---

## 5. Frontend additions

### New components

- `web/src/components/escrow/MilestoneRow.tsx` — single milestone with status pill + action buttons
- `web/src/components/escrow/MilestoneList.tsx` — drag-handle reorder for PENDING
- `web/src/components/escrow/AddMilestoneForm.tsx` — inline add form
- `web/src/components/escrow/FeeBreakdown.tsx` — shows breakdown (job amount + service fee + Stripe + total) before Fund click; reused on Fund button hover + Checkout intent
- `web/src/components/escrow/DisputeFilingDialog.tsx` — modal capturing dispute reason
- `web/src/components/escrow/CancelContractDialog.tsx` — confirmation modal
- `web/src/components/escrow/EndContractDialog.tsx` — 7-day notice text + confirm
- `web/src/components/admin/EscrowDisputeQueueTab.tsx` — moderator queue UI on AdminPage
- `web/src/components/admin/DisputeResolutionForm.tsx` — moderator decision form
- `web/src/components/admin/PlatformSettingsTab.tsx` — admin fee-config form
- `web/src/components/wallet/OnboardingBanner.tsx` — Connect status + setup CTA
- `web/src/components/wallet/EscrowLedger.tsx` — pending / released / refunded ledger sections
- `web/src/components/wallet/PendingReferralPayouts.tsx`

### Updated components

- `web/src/pages/EscrowPlaceholderPage.tsx` → `EscrowDetailPage.tsx` — full escrow surface
- `web/src/pages/CollaborationDetailPage.tsx` — extend summary card with funded/released amounts (ESCROW-140)
- `web/src/pages/AdminPage.tsx` — new "Escrow Disputes" + "Settings" tabs
- `web/src/components/ConversationListItem.tsx` — render system messages with distinct style (already partially shipped by chat feature)

### New pages

- `web/src/pages/WalletPage.tsx` — `/wallet` route (worker primary use case; visible to all auth users for self-discovery)

### Helpers / hooks

- `web/src/components/escrow/api.ts` — escrow REST client functions
- `web/src/hooks/useEscrow.ts` — reactive hook for `/escrow/:id`
- `web/src/hooks/useWallet.ts` — reactive hook for `/wallet/me`
- `web/src/hooks/useConnectOnboarding.ts` — polls `/escrow/onboarding/status`

---

## 6. Environment variables

```env
# Already configured
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_CONNECT_WEBHOOK_SECRET="whsec_..." # same as STRIPE_WEBHOOK_SECRET in local dev with stripe listen

# New for escrow
PLATFORM_BASE_URL="http://localhost:3000"  # for Stripe Checkout return URLs (already exists as FRONTEND_URL — reuse)
ESCROW_AUTO_RELEASE_HOURS=168              # 7 days, configurable per env
ESCROW_END_CONTRACT_HOURS=168              # 7 days
ESCROW_DISPUTE_RESPONSE_HOURS=168          # 7 days
```

Defaults baked into code; env vars override per environment.

---

## 7. Removal / deprecation list

| Endpoint | Status | Reason |
|---|---|---|
| `POST /escrow/:id/confirm-deposit` | REMOVED | webhook does this; staff endpoint was creating desync |
| `POST /escrow/:id/release` | REMOVED | replaced by per-milestone approve |
| `POST /escrow/:id/refund` | REMOVED | replaced by per-milestone refund |
| `POST /escrow/:id/deposit` | REMOVED | replaced by `POST /escrow/milestones/:id/fund` |
| `POST /escrow/:id/dispute` | REMOVED | replaced by per-milestone dispute |
| `POST /escrow/collaboration/:id` | KEPT | now creates empty shell; milestones added separately |

DTO files removed: `escrow/dto/create-escrow.dto.ts` becomes minimal (just collab id, no amounts — amounts come from milestones).

---

## 8. Acceptance pre-flight

Before marking each `ESCROW-NNN` requirement done:
1. `cd backend && npm run lint` clean
2. `cd backend && npx prisma format` and `npx prisma migrate dev` clean
3. `cd backend && npx tsc --noEmit` clean
4. `cd backend && npm test` (relevant suites pass)
5. `cd web && npm run lint:tokens` clean
6. `cd web && npm test` (relevant suites pass)
7. `cd web && npx tsc --noEmit` clean
8. `cd web && ./node_modules/.bin/vite build` clean
9. Manual smoke: feature flow in light + dark, at 375px and desktop
10. Stripe CLI: `stripe trigger payment_intent.succeeded` + `stripe trigger transfer.paid` produce expected DB state changes
11. No `console.log` of full PaymentIntent payloads in shipped code

---

## 9. Sealed contracts consumed (don't modify)

- `tasks/done/auth-flow/contract.md` — `AccountStateGuard + @RequiresVerifiedEmail()` for all money-bearing endpoints; reuse
- `tasks/done/profiles/contract.md` — `<VerificationBadge>`, `<StarRating>`, avatar primitive, postcode regex
- `tasks/done/jobs-applications/contract.md` — `agreed_amount` on collab → derived from milestone sum (this feature)
- `tasks/done/collaborations-polish/spec.md` — `COLLAB-003` placeholder route to replace, `COLLAB-022` summary card to extend, `COLLAB-021` lifecycle (release trigger via "End contract")
- `tasks/done/chat/spec.md` — `CHAT-*` requirements; this feature posts system messages into existing conversation, does not modify chat surfaces
- `tasks/done/reviews/spec.md` — `REVIEW-*` requirements; this feature triggers `Collaboration.status === 'COMPLETED'` which opens reviews window
- `tasks/done/verification/spec.md` — pattern reference for state machines, audit events, providers feature flag
