# Contract — Contracts & Referrals

Sealed technical decisions for the implementation session. Read after `spec.md`.

## Schema (final)

### New: `Contract`

```prisma
model Contract {
  id                    BigInt   @id @default(autoincrement())
  collaboration_id      BigInt
  position              Int
  status                String   @default("DRAFT") @db.VarChar(20)
  end_reason            String?  @db.VarChar(20)
  agreed_amount         Decimal? @db.Decimal(12, 2)
  project_type          String?  @db.VarChar(100)
  site_postcode         String?  @db.VarChar(10)
  job_post_id           BigInt?
  initiated_by          String   @db.VarChar(10)
  project_referrer_id   BigInt?
  project_referrer_role String?  @db.VarChar(10)
  started_at            DateTime? @db.Timestamptz()
  ended_at              DateTime? @db.Timestamptz()
  created_at            DateTime @default(now()) @db.Timestamptz()
  updated_at            DateTime @updatedAt @db.Timestamptz()

  collaboration       Collaboration       @relation(fields: [collaboration_id], references: [id], onDelete: Restrict)
  job_post            JobPost?            @relation(fields: [job_post_id], references: [id])
  project_referrer    Account?            @relation("ContractProjectReferrer", fields: [project_referrer_id], references: [id])
  escrow_transaction  EscrowTransaction?
  reviews             Review[]

  @@unique([collaboration_id, position])
  @@index([status])
  @@index([project_referrer_id])
  @@map("contract")
}
```

### Slim: `Collaboration` (fields removed)

Drop: `status`, `agreed_amount`, `project_type`, `site_postcode`, `job_post_id`, `referral_id`, `started_at`, `ended_at`, `confirmed_at`, `flagged`, `flag_reason`, `initiated_by`.

Add: `last_contract_id BigInt?`, `first_contracted_at DateTime?`.

Final shape:

```prisma
model Collaboration {
  id                   BigInt   @id @default(autoincrement())
  worker_id            BigInt
  employer_id          BigInt
  last_contract_id     BigInt?
  first_contracted_at  DateTime? @db.Timestamptz()
  created_at           DateTime @default(now()) @db.Timestamptz()
  updated_at           DateTime @updatedAt @db.Timestamptz()

  worker      WorkerProfile   @relation("CollabWorker", fields: [worker_id], references: [id])
  employer    EmployerProfile @relation("CollabEmployer", fields: [employer_id], references: [id])
  last_contract Contract?     @relation("CollabLastContract", fields: [last_contract_id], references: [id])

  contracts    Contract[]
  conversation Conversation?

  @@index([worker_id])
  @@index([employer_id])
  @@map("collaboration")
}
```

### Drop: `Referral`, `ReferralOffer`

Remove tables entirely. Remove FK from `Collaboration.referral_id` (already removed above).

### Account additions

```prisma
referral_code      String   @unique @db.VarChar(16)
referred_by_id     BigInt?
referred_at        DateTime? @db.Timestamptz()

referrer           Account? @relation("AccountReferrer", fields: [referred_by_id], references: [id])
referred_accounts  Account[] @relation("AccountReferrer")

contract_project_refs Contract[] @relation("ContractProjectReferrer")
```

### JobApplication additions

```prisma
project_referrer_id   BigInt?
project_referrer_role String?  @db.VarChar(10)

project_referrer Account? @relation("ApplicationProjectReferrer", fields: [project_referrer_id], references: [id])
```

### EscrowTransaction changes

- Rename `collaboration_id` → `contract_id` (FK Contract)
- Drop: `end_initiated_at`, `end_initiated_by`, `ended_at`
- Old `referral_commission` field stays as snapshot but loses its semantic anchor — the `referral_commission_percent` setting it was tied to is being deleted

### PlatformSetting additions / removals

- Drop: `referral_commission_percent`
- Add: `account_referral_pct Decimal(5,2) @default(10.00)`
- Add: `account_referral_window_months Int? @default(12)` (NULL = lifetime)
- Add: `project_referral_w2w_pct Decimal(5,2) @default(2.00)`
- Add: `project_referral_e2e_pct Decimal(5,2) @default(2.00)`

### PendingReferralPayout additions

- Add: `type String @db.VarChar(20)` (no default — required field)
- Add: `contract_id BigInt?` (so a project ref payout knows which contract; NULL for legacy ACCOUNT-only)

### Review changes

- Rename `collaboration_id` → `contract_id`
- Update unique constraint: `@@unique([contract_id, reviewer_role])`

## Migration

Single migration: `contracts_and_referrals_refactor`.

```bash
cd backend && npx prisma migrate dev --name contracts_and_referrals_refactor
```

After migration: `npx prisma db seed` regenerates everything.

## API surface

### New

```
POST   /collaborations/:id/hire-again        → { contract_id }
GET    /contracts/:id                        → ContractDetail
POST   /contracts/:id/propose                → ACTIVE→PROPOSED
PATCH  /contracts/:id/respond                → { accept: bool } → ACTIVE/ENDED
POST   /contracts/:id/end                    → { end_reason } → ENDED
GET    /escrow/by-contract/:contractId       → EscrowDetail (replaces by-collab in new code)

GET    /r/:code                              → set cookie + 302 /
POST   /referral/track-click                 → { code, target_id, target_role } → 200 { referrer_display_name }
GET    /referral/who-referred?code=CODE      → { display_name } (public, lightweight)

GET    /referrals/code                       → { code, link }
GET    /referrals/account-stats              → { window_months, lifetime_signups, ..., items[] }
GET    /referrals/project-shares             → { items[] }
GET    /referrals/incoming                   → { referrer, total_earned_from_you }
GET    /referrals/pending-payouts            → { items[] }
```

### Removed

```
GET    /referrals                  (subcontract list)
GET    /referrals/me               (subcontract own)
POST   /referrals                  (subcontract create)
PATCH  /referrals/:id              (subcontract update)
DELETE /referrals/:id              (subcontract cancel)
POST   /referrals/:id/offers       (subcontract offer)
PATCH  /referrals/offers/:id/respond
GET    /referrals/offers/me
```

### Compat aliases (kept for one release)

```
GET /escrow/by-collaboration/:collabId  → returns escrow of latest active contract under collab
```

## Module layout

```
backend/src/
├── contract/                  ← NEW
│   ├── contract.module.ts
│   ├── contract.service.ts
│   ├── contract.controller.ts
│   └── dto/
│       ├── create-contract.dto.ts
│       ├── end-contract.dto.ts
│       └── respond-contract.dto.ts
├── referral/                  ← REWRITE FROM SCRATCH
│   ├── referral.module.ts
│   ├── referral.service.ts
│   ├── referral.controller.ts
│   ├── referral-cookie.middleware.ts
│   └── dto/
│       └── track-click.dto.ts
├── escrow/                    ← UPDATE: contract_id everywhere
└── collaboration/             ← SLIM: relationship-only
```

## Constants

`backend/src/contract/contract.constants.ts`:

```ts
export const CONTRACT_STATUS = {
  DRAFT: 'DRAFT',
  PROPOSED: 'PROPOSED',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
} as const;

export const CONTRACT_END_REASON = {
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELED',
  ABANDONED: 'ABANDONED',
  DISPUTED_LOST: 'DISPUTED_LOST',
} as const;
```

`backend/src/referral/referral.constants.ts`:

```ts
export const REFERRAL_TYPE = {
  ACCOUNT: 'ACCOUNT',
  PROJECT_W2W: 'PROJECT_W2W',
  PROJECT_E2E: 'PROJECT_E2E',
} as const;

export const REF_COOKIE_NAMES = {
  ACCOUNT: 'tradehub_ref',
  PROJECT: 'tradehub_ref_project',
} as const;

export const REF_COOKIE_TTL_DAYS = 30;
export const REFERRAL_CODE_REGEX = /^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/;
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
```

## Slice plan

Implementation broken into 4 slices. Commit one slice per logical group, but **do not commit** in this session per owner request — leave uncommitted for review.

### Slice A: Schema + base seed (cannot run anything else without it)
- Update `schema.prisma` per contract above
- Migration: `contracts_and_referrals_refactor`
- Rewrite `seed.ts` per CR-122
- Verify migration runs + seed succeeds

### Slice B: Contract domain backend
- New `contract/` module
- Refactor `EscrowService` `collaboration_id` → `contract_id`
- Slim `CollaborationService`
- Add hire-again endpoint
- All endpoints in `Contract` API surface
- Audit events for contract.* added

### Slice C: Referral domain backend
- Rewrite `referral/` module from scratch
- `referral-cookie.middleware.ts` global
- All `/referral/*` and `/referrals/*` endpoints
- Hook signup, JobApplication.create, Contract.create flows
- `computeMilestoneCommissions` + escrow.release integration
- Audit events for referral.* added

### Slice D: Frontend (rewrite) + admin
- `CollaborationDetailPage` rewrite (relationship view + contract list)
- `ContractDetailPage` new
- `ReferralsPage` rewrite (6 sections)
- "Share for commission" buttons on JobDetail + WorkerProfile
- "End contract" + "Hire again" UI
- `PlatformSettingsTab` new fields
- App routing updates
- Frontend ref-attribution toast + signup banner

## Pre-flight before declaring slice done

```bash
cd backend && npm run lint && npx prisma validate && npm run build
cd web && npm run lint:tokens && ./node_modules/.bin/vite build
```

Manual smoke on each slice — full referral flow signup-to-payout for at least one combination.
