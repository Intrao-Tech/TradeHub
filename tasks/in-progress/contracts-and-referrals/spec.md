# Spec — Contracts & Referrals

## Summary

Refactor `Collaboration` into a stateless relationship + introduce `Contract` as the lifecycle entity (Upwork model). Drop legacy `Referral`/`ReferralOffer` subcontract feature. Introduce a real referral system with two types — Account (signup attribution) and Project (per-job for W→W, per-worker-profile for E→E). Both reward referrers with a % cut paid out of platform_fee on every released milestone, capped at 100% of platform_fee.

Requirement IDs: `CR-NNN` (CR = Contracts & Referrals). Decisions Log appended at bottom.

## Problem

See `brief.md`.

## Goals

- Allow employer + worker to start a new contract with each other without losing chat history or relationship metadata.
- Make "End contract" a first-class operation with explicit reason; auto-close on silence.
- Give every account a referral code + ref link visible on `/referrals`.
- Let workers share a job-link to refer another worker for a specific job.
- Let employers share a worker-link to refer that worker to another employer.
- Pay all referral commissions transparently from platform_fee — no surprise charges to worker or employer.
- Cap total referral commissions per milestone at platform_fee (platform never goes negative).
- Track all incoming + outgoing referrals on `/referrals` for transparency.

## Non-goals

See `brief.md`.

## User Flows

### Hire-again flow

1. Collab #42 between worker M and employer E has Contract #1, status `ENDED`, `end_reason=COMPLETED`.
2. E opens `/collaborations/42` → sees relationship summary + Contract #1 in read-only mode + "Hire again" button.
3. Clicks Hire again → opens "New contract" sheet with worker pre-selected (cannot change). Employer fills project_type, site_postcode, agreed_amount.
4. Submits → Contract #2 row created, `status=PROPOSED`. M gets system-chat msg + email.
5. M opens `/collaborations/42` → sees both contracts + can Accept/Decline Contract #2.
6. M accepts → Contract #2 `status=ACTIVE`. Milestones can now be added on `/contracts/{id}/escrow` (path replaces old `/escrow/:collab_id`).

### End contract flow

1. Contract #1 has 3 milestones, 2 RELEASED, 1 PENDING.
2. Either party clicks End contract → modal: pick reason (COMPLETED / CANCELED / ABANDONED). If any milestone is FUNDED/SUBMITTED → blocked with "Resolve in-flight milestones first."
3. End fires → Contract `status=ENDED`, end_reason set, `ended_at=now()`. PENDING milestones auto-CANCELED. System chat msg + email.
4. 14-day review window opens (existing `reviews` feature, retargeted from collab_id → contract_id).
5. Hire-again button appears on the relationship.

### Account referral flow

1. Mike's `Account.referral_code = MIKE-A1B2`. He shares `/r/MIKE-A1B2` on Twitter.
2. Sarah clicks → backend `GET /api/r/MIKE-A1B2` 302-redirects to `/register?ref=MIKE-A1B2` (frontend route). No cookies involved.
3. Sarah lands on the register page. Form reads `?ref=` from URL, calls `GET /api/referral/who-referred?code=MIKE-A1B2` to render "Referred by Mike Thompson" banner, and forwards `referred_by_code: 'MIKE-A1B2'` in the signup POST body.
4. Server validates code on signup, sets `Account.referred_by_id = Mike.id`, `Account.referred_at = now()`. Locked at signup forever — never re-attributed.
5. Sarah completes onboarding, becomes a worker. 60 days later she gets hired by ACME on Contract #88. ACME funds milestone #1 of £500. Eventually milestone releases.
6. Release path: platform_fee = £25 (5%). `account_referral_pct = 10` from `PlatformSetting`. Mike's cut = £2.50. Transfer fires from platform balance to Mike's connected account (or PendingReferralPayout if Mike not onboarded).
7. Mike's `/referrals` → "Account referrals" section shows: Sarah, signed up 2026-05-12, active, earned £2.50 to date.

### Project referral W→W

1. Mike on `/jobs/123` (already-registered worker). Sees "Share for commission" button → clicks → modal shows lifetime link `/jobs/123?ref=MIKE-A1B2`.
2. Mike sends to Bob (already-registered worker).
3. Bob (logged in) opens `/jobs/123?ref=MIKE-A1B2`. Frontend `useRefAttribution` hook fires `POST /api/referral/intent` with `{code: 'MIKE-A1B2', target_id: 123, target_role: 'WORKER'}`. Backend writes a `ReferralIntent` row keyed by `(actor_account_id=Bob, target_role='WORKER', target_id=123)`, expires_at = now+30d. Frontend strips `?ref=` from URL.
4. Bob applies to job 123 → backend looks up the latest active intent for `(Bob, WORKER, 123)`, copies referrer onto `JobApplication.project_referrer_id = Mike.id`, `project_referrer_role = WORKER`.
5. Bob wins → contract created. Backend reads `JobApplication.project_referrer_id` from the matching application (W2W backfill — see CR-038) and copies onto `Contract.project_referrer_id = Mike.id`.
6. On every released milestone of that contract: Mike gets `project_referral_w2w_pct` of `agreed_amount`, paid from platform_fee.

### Project referral E→E

1. ACME (employer) on `/workers/456` profile. Sees "Share with another employer" → modal shows lifetime link `/workers/456?ref=ACME-Z9X8`.
2. ACME sends to BravoBuild (already-registered employer).
3. BravoBuild (logged in) opens `/workers/456?ref=ACME-Z9X8`. Frontend hook fires `POST /api/referral/intent` with `target_role='EMPLOYER', target_id=456`. Backend writes a `ReferralIntent` row.
4. BravoBuild later (could be days) creates a contract with worker 456 from an existing collaboration. Backend reads the latest active intent for `(BravoBuild, EMPLOYER, 456)` → `Contract.project_referrer_id = ACME.id`, `project_referrer_role = EMPLOYER`.
5. If BravoBuild had hired worker 789 instead: no matching intent for that worker_id, no attribution.
6. On every released milestone: ACME gets `project_referral_e2e_pct` of `agreed_amount`.

> **Why server-side intent, not cookies?** Cookies break in too many ways: cross-origin requires `credentials:'include'` plus `SameSite=None;Secure`, Safari ITP caps client-set cookies to 7 days, GDPR adds banner overhead, and incognito/in-app browsers strip them. The intent table is one row per click keyed by the logged-in actor, debuggable via SQL, and survives device-switching for the same account. Anonymous viewers of `/jobs/:id?ref=` or `/workers/:id?ref=` are silently ignored — they can't perform a qualifying action without registering anyway, and the account-ref flow uses `/r/:code` → `/register?ref=` for that case.

## Requirements

### 1. Schema

- **CR-001 (Must).** Add `Contract` model: `id` BigInt PK, `collaboration_id` BigInt FK Collaboration ON DELETE RESTRICT, `position` Int (sequential 1..N within collaboration, unique per collab), `status` VarChar(20) default `DRAFT`, `end_reason` VarChar(20) NULL (only set on `ENDED`), `agreed_amount` Decimal(12,2) NULL (snapshot at fund), `project_type` VarChar(100) NULL, `site_postcode` VarChar(10) NULL, `job_post_id` BigInt FK NULL, `initiated_by` VarChar(10), `project_referrer_id` BigInt FK Account NULL, `project_referrer_role` VarChar(10) NULL ('WORKER' | 'EMPLOYER'), `started_at` Timestamptz NULL (when ACTIVE), `ended_at` Timestamptz NULL, `created_at` default now(), `updated_at` updatedAt. Unique `(collaboration_id, position)`. Indexes: `(status)`, `(project_referrer_id)`.
- **CR-002 (Must).** `Contract.status` enum (string-validated): `DRAFT`, `PROPOSED`, `ACTIVE`, `ENDED`. `end_reason` enum (NULL unless status=ENDED): `COMPLETED`, `CANCELED`, `ABANDONED`, `DISPUTED_LOST`.
- **CR-003 (Must).** Slim `Collaboration`: drop `status`, `agreed_amount`, `project_type`, `site_postcode`, `job_post_id`, `referral_id`, `started_at`, `ended_at`, `confirmed_at`, `flagged`, `flag_reason`, `initiated_by`. Keep: `id`, `worker_id`, `employer_id`, `created_at`, `updated_at`. Add: `last_contract_id` BigInt FK Contract NULL (latest contract for quick hire-again). Add `first_contracted_at` Timestamptz NULL (set when first contract becomes ACTIVE).
- **CR-004 (Must).** Migrate existing data via fresh seed (no in-place data migration — dev-only DB, user accepted reset). For seed: each existing seeded "completed" collab becomes 1 Contract (position=1, status=ENDED, end_reason=COMPLETED).
- **CR-005 (Must).** Drop `Referral` and `ReferralOffer` tables and all FK references (including `Collaboration.referral_id`). Drop the `referral` and `referral_offer` migrations' indexes.
- **CR-006 (Must).** Update `EscrowTransaction.collaboration_id` → `EscrowTransaction.contract_id` (FK Contract). Unique constraint moves with it. Remove `EscrowTransaction.end_initiated_at`, `end_initiated_by`, `ended_at` (these move to Contract).
- **CR-007 (Must).** Update `Conversation.collaboration_id` stays as-is (chat persists at relationship level). System messages add `metadata.contract_id` for filtering on the UI.
- **CR-008 (Must).** Update `Review.collaboration_id` → `Review.contract_id`. Reviews are per-contract, not per-relationship.
- **CR-009 (Must).** Add `Account.referral_code` VarChar(16) UNIQUE NOT NULL — generated on account creation, format `^[A-Z0-9]{4}-[A-Z0-9]{4}$`. Backfill existing accounts in seed.
- **CR-010 (Must).** Add `Account.referred_by_id` BigInt FK Account NULL (set at signup time only, never updated). Add `Account.referred_at` Timestamptz NULL.
- **CR-011 (Must).** Add `JobApplication.project_referrer_id` BigInt FK Account NULL. Add `JobApplication.project_referrer_role` VarChar(10) NULL.
- **CR-012 (Must).** Extend `PlatformSetting` with: `account_referral_pct` Decimal(5,2) default 10.00, `account_referral_window_months` Int NULL default 12 (NULL = lifetime), `project_referral_w2w_pct` Decimal(5,2) default 2.00, `project_referral_e2e_pct` Decimal(5,2) default 2.00. Drop the old `referral_commission_percent` column (replaced by the three new ones).
- **CR-013 (Must).** Extend `PendingReferralPayout` with `type` VarChar(20) NOT NULL ('ACCOUNT' | 'PROJECT_W2W' | 'PROJECT_E2E'). Default no longer makes sense — every row must declare its type at insert.
- **CR-014 (Must).** Migration name: `contracts_and_referrals_refactor`. Single migration to keep schema atomic. New seed regenerates all data.
- **CR-015 (Must).** Add `ReferralIntent` model: `id` BigInt PK, `actor_account_id` BigInt FK Account ON DELETE CASCADE (the logged-in user who clicked the link), `referrer_account_id` BigInt FK Account ON DELETE CASCADE (the link owner), `target_role` VarChar(10) ('WORKER' for job links / 'EMPLOYER' for worker links), `target_id` BigInt (job_post_id or worker client_profile_id), `expires_at` Timestamptz NOT NULL, `created_at` default now(). Index `(actor_account_id, target_role, target_id, expires_at)`. Migration name: `referral_intent` (separate from `contracts_and_referrals_refactor` — added in a follow-up architecture revision documented in the Decisions Log on 2026-05-10). Replaces cookie-based attribution.

### 2. Backend — Contract domain

- **CR-020 (Must).** New module `backend/src/contract/` with `contract.module.ts`, `contract.service.ts`, `contract.controller.ts`, `dto/`. Methods on service: `createContract(collabId, dto)` → DRAFT row; `proposeContract(contractId, actor)` → DRAFT→PROPOSED; `acceptContract(contractId, worker)` → PROPOSED→ACTIVE + sets `Collaboration.first_contracted_at` if null; `declineContract(contractId, worker)` → PROPOSED→ENDED + end_reason=CANCELED; `endContract(contractId, actor, end_reason)` → ACTIVE→ENDED with rules; `getContract(contractId)` → with milestones + escrow + counterparty; `listContractsForCollab(collabId)` → array.
- **CR-021 (Must).** `endContract` rules: refuses if any milestone is `FUNDED` or `SUBMITTED` (returns 409 with msg "Resolve in-flight milestones first"). On success: PENDING milestones auto-CANCELED, ENDED set, system chat msg posted, email both parties, `Collaboration.last_contract_id` updated.
- **CR-022 (Must).** Migrate all `EscrowService` references from `collaboration_id` → `contract_id`. `getEscrowByCollaboration` becomes `getEscrowByContract`. New endpoint `GET /escrow/by-contract/:contractId`. Keep a thin compat alias `GET /escrow/by-collaboration/:collabId` that returns the latest active contract's escrow (single-contract back-compat for any frontend not yet migrated).
- **CR-023 (Must).** `CollaborationService` shrinks: only relationship CRUD (find/create-on-first-contract), no status transitions. The "create collab + create contract" becomes a 2-step internal flow used by referral acceptance, employer-invite, and worker-accept-job flows.
- **CR-024 (Must).** Hire-again endpoint: `POST /collaborations/:id/hire-again` → creates new Contract under same Collaboration, status=DRAFT, returns id. Same auth gating as current "create collab".
- **CR-025 (Must).** `Contract.status` transitions are emitted as audit events: `contract.proposed`, `contract.accepted`, `contract.declined`, `contract.ended`. Action types in audit module.

### 3. Backend — Referral domain

> **Architecture revision 2026-05-10:** referral attribution is server-side, keyed by the logged-in actor account. The cookie middleware described in earlier drafts of CR-031..035 has been deleted. Cookies are no longer used at any point in the referral flow. See Decisions Log for rationale.

- **CR-030 (Must).** New module `backend/src/referral/` (replaces existing — old module deleted entirely). Files: `referral.module.ts`, `referral.service.ts`, `referral.controller.ts`, `dto/`. (No cookie middleware.)
- **CR-031 (Must).** `ReferralService.recordProjectIntent({ code, actor_account_id, target_id, target_role })`: validates the code maps to a real account, validates the target exists (job_post for `WORKER`, worker_profile for `EMPLOYER`), and inserts a `ReferralIntent` row with `expires_at = now + 30d`. Self-ref (`actor == referrer`) is a silent no-op returning `{ recorded: false, referrer_display_name: null }`.
- **CR-032 (Must).** `ReferralService.findActiveIntent(actor_account_id, target_role, target_id)`: returns the latest non-expired intent for the tuple (last-click wins). Reads only — does NOT delete the row. Multiple downstream actions on the same target (apply, then later contract creation) can each consume it.
- **CR-033 (Must).** `GET /r/:code` (public, no auth) — validates code shape against `REFERRAL_CODE_REGEX`, then 302-redirects to `${FRONTEND_URL}/register?ref=${code}`. Invalid shape → redirect to `${FRONTEND_URL}` with no param. No cookies set, no DB writes. Account-ref flow is pure URL.
- **CR-034 (Must).** `POST /referral/intent` (auth required). Body: `{ code, target_id, target_role: 'WORKER' | 'EMPLOYER' }`. Calls `recordProjectIntent` with `actor_account_id = req.user.accountId`. Returns `{ recorded: bool, referrer_display_name: string | null, target?: { type: 'JOB' | 'WORKER', id, title } }`. Anonymous calls (no JWT) → 401 — anonymous viewers are intentionally not attributed; they hit `/r/:code` for the account-ref flow instead.
- **CR-035 (Must).** Frontend `useRefAttribution` hook fires `POST /referral/intent` only when (a) `?ref=` is present in URL AND (b) user is logged in. After the call (success or failure), strips `?ref=` via `setSearchParams`. Anonymous viewers: hook just strips the param — no API call.
- **CR-036 (Must).** Signup flow: `RegisterDto.referred_by_code` carries the URL `?ref=` value forwarded by the frontend register form. `auth.service.register` looks up the referrer by code, sets `Account.referred_by_id` + `referred_at` only if code valid AND not self-ref (referrer.email != new email). Locked at signup forever — never re-attributed.
- **CR-037 (Must).** JobApplication flow: `JobApplicationService.apply(jobPostId, workerId, dto)` calls `ReferralService.findActiveIntent(workerId, 'WORKER', jobPostId)`. If a row exists AND `referrer != applicant` → set `JobApplication.project_referrer_id` + `project_referrer_role = 'WORKER'`. Audit + best-effort email notification to referrer. Mismatch / no intent = silent skip.
- **CR-038 (Must).** Contract creation flow has TWO ordered attribution sources, first wins:
  1. **E→E intent**: when employer initiates the contract, look up `findActiveIntent(employer_id, 'EMPLOYER', collab.worker_id)`. If found and `referrer != employer`, set `Contract.project_referrer_id` + `project_referrer_role = 'EMPLOYER'`.
  2. **W→W backfill**: if no E→E intent and `dto.job_post_id` is set, look up the matching `JobApplication(job_post_id, worker_id=collab.worker_id)`. If it has `project_referrer_id` set with `role='WORKER'`, copy onto the contract. This carries the W2W chain across the apply → hire boundary, where URL state is gone but the durable JobApplication row persists the referrer.
  - Mismatch / no source = silent skip. Audit + best-effort email notification to referrer fire only when one of the sources succeeded.
- **CR-039 (Must).** Self-referral guards: account ref where new account email == referrer email is silently ignored (signup); project ref where actor == referrer is silently ignored at intent-record time (CR-031); contract attribution refuses `referrer == employer` and `referrer == worker`.
- **CR-040 (Must).** `/referrals` endpoints (auth required, returns data for `req.user.account_id`):
  - `GET /referrals/code` — `{ code, link: "https://app/r/CODE" }`
  - `GET /referrals/account-stats` — `{ window_months, lifetime_signups, active_signups, expired_signups, total_earned_gbp }` + paginated list of referred accounts with `signed_up_at`, `window_ends_at`, `earned_to_date`.
  - `GET /referrals/project-shares` — paginated list of own project ref attributions with status (pending click, applied, contract created, milestone released, total earned).
  - `GET /referrals/incoming` — who referred this user + how much they have earned from this user's contracts (transparency).
  - `GET /referrals/pending-payouts` — accumulated PendingReferralPayout rows for this user.
- **CR-041 (Must).** `referral.service.computeMilestoneCommissions(milestone, contract, contract_employer_account, contract_worker_account)` returns a list of `{ referrer_account_id, type, gross_amount }`. Logic:
  1. Compute `platform_fee` for this milestone (from frozen pct snapshot).
  2. **Account ref for worker**: if `worker_account.referred_by_id` is set AND within window (or window=null) → `gross = platform_fee * account_referral_pct / 100`.
  3. **Account ref for employer**: same check on employer account.
  4. **Project ref**: if `Contract.project_referrer_id` is set → `gross = agreed_amount * project_referral_w2w_pct/100` (if role=WORKER) or `* project_referral_e2e_pct/100` (if role=EMPLOYER). Note: this is `agreed_amount` not `platform_fee` — referral cut uses contract value as base because it rewards the lead introducer.
  5. **Cap total**: sum of all gross_amounts. If sum > platform_fee → scale all proportionally so sum == platform_fee. (Worker payout never reduced; only platform's cut shrinks.)
  6. Return ordered list with proportional caps applied.
- **CR-042 (Must).** `escrow.service.executeRelease()` calls `referral.service.computeMilestoneCommissions(...)`, fires Stripe transfers for each (or PendingReferralPayout if referrer not onboarded). Existing single-referrer logic replaced.
- **CR-043 (Must).** Audit events: `referral.account.attributed` (on signup), `referral.project.attributed` (on application/contract create), `referral.commission.paid` (on milestone release with referrer).
- **CR-044 (Must).** `auth.service.generateReferralCode()` — generates `^[A-Z0-9]{4}-[A-Z0-9]{4}$` excluding ambiguous chars (no 0/O/1/I/L). Retries on collision. Called on Account creation. Backfill existing accounts in seed.

### 4. Backend — Notifications

- **CR-050 (Must).** Email + system-chat msg + in-app notification on `referral.account.attributed`: "X signed up via your link." Recipient: referrer.
- **CR-051 (Must).** Email + in-app on `referral.project.attributed`: "Your link to job/profile X was used by Y." Recipient: referrer.
- **CR-052 (Must).** Email + in-app on `referral.commission.paid`: "You earned £Y.YY from Z's contract." Recipient: referrer. Includes contract id, milestone title, link to `/referrals`.
- **CR-053 (Must).** Email + system chat msg on `contract.proposed`, `contract.accepted`, `contract.declined`, `contract.ended` (replaces existing collab-status emails). Posted in the relationship's persistent conversation.
- **CR-054 (Should).** Existing escrow milestone emails (`milestone.funded`, `submitted`, `released`) reword to reference contract title not collab id.

### 5. Frontend — Contract & Collaboration UI

- **CR-070 (Must).** New page `web/src/pages/CollaborationDetailPage.tsx` (replaces existing). Shows: relationship summary card (worker, employer, first_contracted_at, total contracts) + persistent conversation pane + Contract list (each with status badge + link to contract detail). "Hire again" button visible to either party when no ACTIVE/PROPOSED contract exists.
- **CR-071 (Must).** New page `web/src/pages/ContractDetailPage.tsx` for `/contracts/:contractId`. Shows: contract summary (status, agreed_amount, project_type, site_postcode), counterparty, escrow milestone block (current `EscrowPlaceholderPage` body refactored to component), End contract button, Accept/Decline buttons (PROPOSED state, worker side), audit event timeline.
- **CR-072 (Must).** "End contract" dialog: pick reason (COMPLETED / CANCELED / ABANDONED). DISPUTED_LOST is set automatically on dispute resolution, not user-pickable. Confirms with double-click pattern.
- **CR-073 (Must).** "Hire again" sheet: pre-populated worker, fields: project_type, site_postcode, agreed_amount placeholder text. Submit creates DRAFT, then PROPOSED.
- **CR-074 (Must).** Update `CollaborationListPage.tsx` to show last contract status per relationship row.
- **CR-075 (Must).** Update `App.tsx` routing: `/escrow/:collabId` → `/contracts/:contractId/escrow` (compat redirect from old URL to latest active contract for that collab). New route `/contracts/:contractId`.

### 6. Frontend — Referral UI

- **CR-080 (Must).** Rewrite `web/src/pages/ReferralsPage.tsx` from scratch. Sections:
  1. **Your code** — large display of code, copy button, social share buttons (Copy link / X / WhatsApp / Email).
  2. **Account stats** — lifetime: signups / active / earned. Table of referred accounts (display_name, signed_up_at, window_ends_at, earned).
  3. **Job shares (W→W)** — table of own project shares for jobs (job title, link, clicks, applications, hires, earned). "Share new job" button → opens share modal asking for job url/id.
  4. **Worker shares (E→E)** — table of own project shares for workers (worker name, link, clicks, contracts, earned). "Share new worker" button → searches workers.
  5. **Incoming attribution** — who referred you + how much they've earned from your contracts.
  6. **Pending payouts** — same as `/wallet`, just a duplicate scoped to referral payouts.
- **CR-081 (Must).** "Share for commission" button on `web/src/pages/JobDetailPage.tsx` (or wherever individual job is rendered to a worker) → modal with copy-able `/jobs/:id?ref=YOURCODE` link + breakdown ("You earn ~£X if a hire results, paid from platform fee").
- **CR-082 (Must).** "Share with another employer" button on worker profile page (employer view only) → modal with copy-able `/workers/:id?ref=YOURCODE` link + breakdown.
- **CR-083 (Must).** Frontend `useRefAttribution` hook on `/jobs/:id` and `/workers/:id` page mount, if `?ref=CODE` in URL AND user is logged in → call `POST /referral/intent` with `code`, `target_id`, `target_role`. Show toast: "Referred by ${display_name}" if the response includes one (and `recorded === true`). Always strip `?ref=` from the URL via `setSearchParams({}, { replace: true })`. If user is anonymous, the hook just strips the param (no API call) — anonymous viewers cannot perform a qualifying action without registering, and account-ref flow uses `/r/:code` instead.
- **CR-084 (Must).** Signup form reads `?ref=CODE` from the URL via `useSearchParams`. If present, fetches referrer display name via `GET /referral/who-referred?code=CODE` (public lookup) and shows "Referred by X" banner. The code is forwarded into the signup POST body as `referred_by_code`. The `/r/:code` backend endpoint redirects there with the param pre-populated, so a fresh visitor lands on the register page with everything ready.
- **CR-085 (Must).** Toast notification when frontend detects ref code being applied (signup or apply or hire).

### 7. Admin

- **CR-090 (Must).** Extend `PlatformSettingsTab.tsx` with the 4 new fields: account_referral_pct, account_referral_window_months (with "lifetime" toggle that nulls the value), project_referral_w2w_pct, project_referral_e2e_pct. Validate sums-not-impossible (each 0-100). Drop the legacy `referral_commission_percent` field.
- **CR-091 (Must).** New admin page section under Settings tab: "Referral overview" — admin can search by ref code or account email to see attribution chain + earnings.
- **CR-092 (Should).** Admin override: ability to manually clear `Account.referred_by_id` or change it (with audit log entry). For MVP: skip UI, raw DB-only.

### 8. Anti-fraud / edge cases

- **CR-100 (Must).** Self-ref guard at signup: `Account.referred_by_id` not set if referrer email == new email. Silent.
- **CR-101 (Must).** Self-ref guard at JobApplication: if applicant Account.id == project_referrer Account.id → silent skip.
- **CR-102 (Must).** Self-ref guard at Contract creation: if employer Account.id == project_referrer Account.id → silent skip.
- **CR-103 (Must).** E→E target mismatch: contract creation only consumes intents matching `(employer_account_id, 'EMPLOYER', collab.worker_id)`. Intent recorded against a different worker_id is left untouched (silent skip on contract creation).
- **CR-104 (Must).** W→W target mismatch: application only consumes intents matching `(worker_account_id, 'WORKER', job_post_id)`. Intents for other jobs ignored.
- **CR-105 (Must).** Multi-click attribution: last-click wins. `findActiveIntent` orders by `created_at desc` so the latest non-expired intent for the tuple is consumed first.
- **CR-106 (Must).** Intent expires after 30 days (`expires_at` column). The lookup filters `expires_at > now`. Expired rows can be left in the DB and reaped lazily; they never resurface in attribution.
- **CR-107 (Must).** Account ref window: 12 months default from signup, configurable. Releases past window do not credit referrer. PendingReferralPayout entries created within window are still paid out even after window closes (already-earned money).
- **CR-108 (Must).** Project ref runs lifetime of contract — every milestone, no window.
- **CR-109 (Should).** Click logging table (light-weight `referral_click_log`) for analytics — `code`, `target_id`, `target_role`, `clicker_account_id` (NULL if unauthenticated), `clicked_at`, `ip_hash`. For MVP: log but do not surface in UI.
- **CR-110 (Should).** Same-IP signup throttle: optional flag in PlatformSetting `account_referral_require_distinct_ip` (default false in MVP). If true, signup rejects if IP recently used by another account-referred signup.

### 9. Migration / Cleanup

- **CR-120 (Must).** Drop entire `backend/src/referral/` legacy module before reintroducing under same path. No file kept.
- **CR-121 (Must).** Remove `Subcontract` UI surface — `ReferralsPage.tsx` rewrite from scratch supersedes; no migration of data needed.
- **CR-122 (Must).** New seed (`backend/prisma/seed.ts`) generates: 5 workers + 3 employers + 1 admin, 8 referral codes (one per non-admin account), 2 referrals (Mike→Sarah account ref + Sarah→Bob job-share project ref), 4 collaborations with 6 total contracts (2 collabs have 2 contracts each to demo "Hire again"), 1 contract ENDED with 2 reviews, 1 contract ACTIVE with 2 RELEASED + 1 PENDING milestone, 1 contract PROPOSED awaiting worker accept, 1 PROPOSED then DECLINED.
- **CR-123 (Must).** Drop migration history is not allowed — all existing migrations remain. The new `contracts_and_referrals_refactor` migration drops the old tables/columns and adds new ones in one transaction.
- **CR-124 (Must).** All TypeScript references to `Collaboration.status`, `Collaboration.agreed_amount`, etc., updated. Any test that reads these fields fixed or deleted (deleted if test no longer makes sense post-refactor — separate test session will rewrite).

### 10. Audit & observability

- **CR-130 (Must).** Audit events list (added to `audit/audit.constants.ts`):
  - `contract.created`, `contract.proposed`, `contract.accepted`, `contract.declined`, `contract.ended`
  - `referral.account.attributed`, `referral.project.attributed`
  - `referral.commission.paid`, `referral.commission.failed`
- **CR-131 (Should).** Structured logger: every commission paid logs `{ contract_id, milestone_id, referrer_id, type, gross_amount, capped, original_sum }`.

## Open Questions

(none — all decisions sealed before spec written)

## Decisions Log

- **2026-05-10** — Collaboration becomes stateless. All lifecycle moves to Contract. Rationale: Upwork model, "Hire again" needs persistent relationship + chat, contract entity owns money.
- **2026-05-10** — Drop legacy Subcontract entirely. No archive. Reason: it confuses the new referral model and was not really a referral system.
- **2026-05-10** — Two referral types: Account (signup, lifetime/window) + Project (per-job W→W, per-worker E→E).
- **2026-05-10** — Project referral only credits **already-registered** users. If new user signs up via project link, only Account ref attribution applies (no double-dipping).
- **2026-05-10** — Commissions paid from platform_fee, capped at 100% (platform never goes negative). Worker payout never reduced.
- **2026-05-10** — Account ref window: default 12 months, admin-configurable, NULL = lifetime.
- **2026-05-10** — E→E attribution requires target_worker_id match — if employer hires a different worker than the one shared, no commission. Anti-spam.
- **2026-05-10** — All commission percentages admin-configurable from Settings tab. No hardcoded business defaults beyond seed values.
- **2026-05-10** — Cookie strategy: separate `tradehub_ref` (account, persists till signup) and `tradehub_ref_project` (project, single-use on apply/hire), both 30-day TTL. **Superseded 2026-05-10 (afternoon) — see entry below.**
- **2026-05-10** — Auto-generated 8-char ref codes (`XXXX-XXXX`), no vanity codes in MVP.
- **2026-05-10** — Conversation persists at Collaboration level across all contracts.
- **2026-05-10** — Reviews migrate from collab-scoped to contract-scoped — each contract gets its own review window.
- **2026-05-10** — Hire-again reuses Collaboration row, just adds new Contract row. No duplicate relationship rows.
- **2026-05-10** — Single-migration refactor (no incremental migration), seed regenerates all data. Dev DB only — owner accepted reset.
- **2026-05-10 (revision)** — **Referral attribution moved from cookies to a server-side `ReferralIntent` table.** Cookie-based attribution turned out to be fragile in real testing: cross-origin `Set-Cookie` was dropped because the frontend `fetch` wrapper omitted `credentials:'include'`, Safari ITP caps client-set cookies to 7 days, GDPR adds banner overhead, and incognito/in-app browsers strip them. Outcome: anonymous traffic on `/jobs/:id?ref=` was never attributed even when everything "worked." Replaced with: (1) account-ref = pure URL param `/r/:code` → `/register?ref=CODE` → register form forwards `referred_by_code`; (2) project-ref = `ReferralIntent` row keyed by the logged-in actor account, written by `POST /referral/intent`, looked up at apply/hire time via `findActiveIntent`. Anonymous viewers of project-ref links are intentionally not attributed (they can't perform a qualifying action anyway). New migration `referral_intent` adds the table; old cookie middleware + helpers (`referral-cookie.ts`, `REF_COOKIE_NAMES`, `REF_COOKIE_TTL_MS`, `POST /referral/track-click`) deleted.
- **2026-05-10 (revision)** — Contract creation gains a **W2W backfill** path (CR-038 step 2). When the contract is created from a `job_post_id`, backend reads `JobApplication.project_referrer_id` from the matching application and copies it onto the contract. Without this, the W2W chain (worker shares link → applicant captured → employer hires from JobPost) was broken at the hire step because the original ref-link URL is long gone by the time the employer creates the contract from `/collaborations/X` days later. The JobApplication row is the durable handoff between the apply event and the hire event.
