# Spec — Tests for Contracts & Referrals

## Summary

Lock the Contracts & Referrals refactor behind an automated test suite.
Backend unit + integration coverage for the `CR-NNN` requirement set in
`tasks/in-progress/contracts-and-referrals/spec.md`.

Test IDs are `TEST-CR-NNN`. Each ID maps 1:1 to a `CR-NNN` source
requirement, cited in the test description. Layer tags:

- **U** — unit (Jest, no DB)
- **E2E-B** — backend e2e (Jest + supertest + Postgres Testcontainer)
- **F** — frontend unit (Vitest + React Testing Library)
- **PW** — Playwright (deferred to a separate spec)

## Layer summary

| Layer  | Files                                              | Tests |
| ------ | -------------------------------------------------- | ----- |
| U      | `referral.service.spec.ts`, `contract.service.spec.ts`, `escrow.fee-math.spec.ts` | ~25 |
| E2E-B  | `cr.contract.e2e-spec.ts`, `cr.referral.e2e-spec.ts`, `cr.commission-cap.e2e-spec.ts` | ~30 |
| F      | `ReferralsPage.test.tsx`, `ContractDetailPage.test.tsx`, `useRefAttribution.test.ts` | ~10 |
| PW     | (deferred → tests-cr-playwright)                   | — |

## Requirements

### 1. Schema invariants (DB-level)

- **TEST-CR-001 (Must, E2E-B)** — `Account.referral_code` is `UNIQUE NOT NULL`.
  Insert two accounts with the same code → `P2002`. Maps `CR-009`.
- **TEST-CR-002 (Must, E2E-B)** — `Contract` unique constraint
  `(collaboration_id, position)`. Two contracts at position=1 under the same
  collab → `P2002`. Maps `CR-001`.
- **TEST-CR-003 (Must, E2E-B)** — `Contract.collaboration_id` FK
  `ON DELETE RESTRICT`. Try delete a Collaboration with active contracts →
  refuses. Maps `CR-001`.
- **TEST-CR-004 (Must, E2E-B)** — `Review.contract_id` FK is enforced;
  inserting a Review with NULL `contract_id` rejects. Maps `CR-008`.
- **TEST-CR-005 (Must, E2E-B)** — `EscrowTransaction.contract_id` is unique
  (one escrow per contract). Maps `CR-006`.
- **TEST-CR-006 (Must, E2E-B)** — `PendingReferralPayout.type` is required.
  Insert without type → fails. Maps `CR-013`.

### 2. ReferralService.computeMilestoneCommissions cap math (U)

- **TEST-CR-010 (Must, U)** — no referrers anywhere → returns `[]`. Maps
  `CR-041`.
- **TEST-CR-011 (Must, U)** — only worker has account ref within window →
  returns 1 ACCOUNT line, gross = `platform_fee × account_referral_pct/100`,
  cappedAmount == grossAmount (no cap hit). Maps `CR-041`.
- **TEST-CR-012 (Must, U)** — only employer has account ref → 1 ACCOUNT
  line for employer's referrer. Maps `CR-041`.
- **TEST-CR-013 (Must, U)** — both worker AND employer have account refs →
  2 ACCOUNT lines. Maps `CR-041`.
- **TEST-CR-014 (Must, U)** — project ref W2W → 1 PROJECT_W2W line, gross =
  `agreed_amount × project_referral_w2w_pct/100`. Maps `CR-041`.
- **TEST-CR-015 (Must, U)** — project ref E2E → 1 PROJECT_E2E line, gross =
  `agreed_amount × project_referral_e2e_pct/100`. Maps `CR-041`.
- **TEST-CR-016 (Must, U)** — full stack (worker account + employer account
  + project_w2w) → 3 lines, all uncapped when sum ≤ platform_fee. Maps
  `CR-041`.
- **TEST-CR-017 (Must, U)** — sum exceeds platform_fee → cap factor
  `platform_fee / sum`, all lines scaled, `Σ cappedAmount ≤ platform_fee`
  (rounding allowed). Maps `CR-041` cap clause.
- **TEST-CR-018 (Must, U)** — pence rounding loss accrues to platform
  (each capped amount rounded DOWN to 2dp). Maps `notes.md` worked example.
- **TEST-CR-019 (Must, U)** — account ref window expired (referred_at >
  N months ago, N from settings) → that ACCOUNT line excluded. Maps `CR-107`.
- **TEST-CR-020 (Must, U)** — `account_referral_window_months = NULL`
  (lifetime) → window check passes regardless of `referred_at`. Maps
  `CR-107`.

### 3. Contract lifecycle (E2E-B)

- **TEST-CR-030 (Must, E2E-B)** — `POST /collaborations/:id/contracts` by
  participant creates DRAFT or PROPOSED contract; non-participant gets 403.
  Maps `CR-020`.
- **TEST-CR-031 (Must, E2E-B)** — Conflict 409 if any in-flight contract
  exists (DRAFT/PROPOSED/ACTIVE) on the same collab. Maps `CR-024`.
- **TEST-CR-032 (Must, E2E-B)** — `POST /contracts/:id/propose` flips
  DRAFT → PROPOSED only; from any other state returns 400. Maps `CR-020`.
- **TEST-CR-033 (Must, E2E-B)** — `PATCH /contracts/:id/respond { accept }`
  by counterparty (not initiator) flips PROPOSED → ACTIVE; initiator gets
  403. Maps `CR-020`.
- **TEST-CR-034 (Must, E2E-B)** — Decline flips PROPOSED → ENDED with
  `end_reason=CANCELED`. Maps `CR-020`.
- **TEST-CR-035 (Must, E2E-B)** — `POST /contracts/:id/end` from ACTIVE
  with no funded milestones → ENDED + Collaboration.last_contract_id
  updated. Maps `CR-021`.
- **TEST-CR-036 (Must, E2E-B)** — End refuses with 409 if any milestone is
  FUNDED. Same for SUBMITTED, DISPUTED, RELEASE_FAILED. Maps `CR-021`.
- **TEST-CR-037 (Must, E2E-B)** — End auto-CANCELs PENDING milestones in
  the same transaction. Maps `CR-021`.
- **TEST-CR-038 (Must, E2E-B)** — On accept, `Collaboration.first_contracted_at`
  is set on first ACTIVE contract; not overwritten on subsequent ones. Maps
  `CR-020`.
- **TEST-CR-039 (Must, E2E-B)** — System chat message is posted in the
  relationship's persistent conversation on each contract event (created,
  proposed, accepted, declined, ended). Maps `CR-053`.
- **TEST-CR-040 (Must, E2E-B)** — Audit log row written for each event with
  `action ∈ {contract.created, contract.proposed, contract.accepted,
  contract.declined, contract.ended}`. Maps `CR-130`.

### 4. Hire-again (E2E-B)

- **TEST-CR-050 (Must, E2E-B)** — `POST /collaborations/:id/hire-again` by
  either party creates a new Contract under same collab when no in-flight
  contract exists. New contract.position = max+1. Maps `CR-024`.
- **TEST-CR-051 (Must, E2E-B)** — Refuses 409 if there's an in-flight
  contract. Maps `CR-024`.
- **TEST-CR-052 (Must, E2E-B)** — Conversation persists — same
  `Collaboration.conversation_id` after multiple hire-again cycles. Maps
  `CR-007`.

### 5. Referral attribution (E2E-B)

- **TEST-CR-060 (Must, E2E-B)** — `GET /r/:code` with valid code sets
  `tradehub_ref` cookie + 302 redirect to `/`. Maps `CR-032`.
- **TEST-CR-061 (Must, E2E-B)** — Invalid `:code` redirects without
  setting cookie. Maps `CR-032`.
- **TEST-CR-062 (Must, E2E-B)** — `POST /referral/track-click` validates
  `target_id` exists and matches `target_role`. WORKER role + invalid
  job_post → 400; EMPLOYER role + invalid worker_profile → 400. Maps
  `CR-035`.
- **TEST-CR-063 (Must, E2E-B)** — `POST /referral/track-click` returns
  `referrer_display_name` for valid code+target. Maps `CR-035`.
- **TEST-CR-064 (Must, E2E-B)** — Signup with `referred_by_code` sets
  `Account.referred_by_id` + `referred_at`; without code → both NULL. Maps
  `CR-036`.
- **TEST-CR-065 (Must, E2E-B)** — Signup with code matching the new
  account's own email is silently ignored (referred_by_id stays NULL).
  Maps `CR-039`/`CR-100`.
- **TEST-CR-066 (Should, E2E-B)** — Cookie strategy: cookie present AND new
  account uses different email → attribution succeeds. Maps `CR-036`.

### 6. Commission credit on release (E2E-B)

- **TEST-CR-070 (Must, E2E-B)** — Release with no referrers → no
  PendingReferralPayout rows created. Maps `CR-042`.
- **TEST-CR-071 (Must, E2E-B)** — Release with worker.referred_by_id set
  AND referrer onboarded with payouts_enabled → live Stripe transfer fires
  via mock client + PAID row created with `stripe_transfer_id`. Maps
  `CR-042` (post-followup live-transfer path).
- **TEST-CR-072 (Must, E2E-B)** — Release with referrer NOT onboarded →
  PENDING row created, status='PENDING', no stripe_transfer_id. Maps
  `CR-042`.
- **TEST-CR-073 (Must, E2E-B)** — Mock Stripe transfer rejects → falls back
  to PENDING row (not lost). Maps post-followup live-transfer fallback.
- **TEST-CR-074 (Must, E2E-B)** — Project ref attributed on Contract →
  PROJECT_W2W row created on release with cap-aware amount. Maps `CR-042`.
- **TEST-CR-075 (Must, E2E-B)** — Stack of refs exceeding platform_fee →
  capped proportionally, sum of payout amounts ≤ frozen platform_fee. Maps
  `CR-041` cap.
- **TEST-CR-076 (Must, E2E-B)** — Cap math edge: 4 refs × 25% each = 100%,
  worker payout unchanged. Maps `CR-041`.
- **TEST-CR-077 (Must, E2E-B)** — `referral.commission.paid` audit event
  fires per line; `referral.commission.failed` on errors. Maps `CR-043`.

### 7. Backfill sweep (E2E-B)

- **TEST-CR-080 (Must, E2E-B)** — `payPendingReferralPayouts(referrerId)`:
  no PENDING rows → returns `{paid:0, failed:0}` no-op. Maps post-followup.
- **TEST-CR-081 (Must, E2E-B)** — One PENDING row + referrer onboarded →
  live transfer fires + row flips to PAID. Maps post-followup.
- **TEST-CR-082 (Must, E2E-B)** — Mock transfer rejects → row flips to
  FAILED with `failure_reason` populated. Maps post-followup.
- **TEST-CR-083 (Must, E2E-B)** — Idempotency: calling sweep twice for the
  same referrer doesn't double-pay (each row PAID gets skipped on retry —
  enforced via Stripe idempotency_key + status check). Maps post-followup.
- **TEST-CR-084 (Must, E2E-B)** — `account.updated` webhook with
  `payouts_enabled` flipping false→true triggers backfill. Maps `CR-042`.
- **TEST-CR-085 (Must, E2E-B)** — `POST /referrals/pending-payouts/retry`
  endpoint is auth-gated and fires sweep for the calling user. Maps
  post-followup.

### 8. /referrals UI surface (F)

- **TEST-CR-100 (Must, F)** — `<ReferralsPage>` shows "Your code" section
  with code from `GET /referrals/code`. Maps `CR-040`/`CR-080`.
- **TEST-CR-101 (Must, F)** — Account stats section renders `lifetime_signups`
  count + items list with display names. Maps `CR-080`.
- **TEST-CR-102 (Must, F)** — Pending payouts section with empty list shows
  "No pending payouts." text and hides the Retry button. Maps `CR-080`.
- **TEST-CR-103 (Must, F)** — With ≥1 pending row, Retry button calls
  `retryReferralPendingPayouts()` and refreshes. Maps post-followup.

### 9. Frontend hooks (F)

- **TEST-CR-110 (Must, F)** — `useRefAttribution`: `?ref=ABCD-1234` in URL
  fires `POST /referral/track-click` once on mount + strips param via
  `replaceState`. Maps `CR-083`.
- **TEST-CR-111 (Must, F)** — Without `?ref` in URL, hook is no-op. Maps
  `CR-083`.
- **TEST-CR-112 (Must, F)** — Invalid code → toast not shown, param still
  stripped (silent fail). Maps `CR-083`.

### 10. Anti-fraud guards (E2E-B)

- **TEST-CR-120 (Must, E2E-B)** — Self-ref at signup: cookie code matches
  new account's own email → `referred_by_id` stays NULL. Maps `CR-100`.
- **TEST-CR-121 (Must, E2E-B)** — Self-ref at JobApplication: applicant ===
  project_referrer → silent skip. Maps `CR-101`.
- **TEST-CR-122 (Must, E2E-B)** — E→E target mismatch: cookie target_worker
  ≠ Contract.worker_id → silent skip. Maps `CR-103`.
- **TEST-CR-123 (Must, E2E-B)** — W→W target mismatch: cookie target_jobpost
  ≠ JobApplication.job_post_id → silent skip. Maps `CR-104`.

## Open Questions

- Should `TEST-CR-066` actually require the cookie middleware to be wired
  into the signup request path? Currently the signup path reads the code
  from a DTO field, not the cookie. Decision pending: either wire cookie
  read into auth.service.register OR document that frontend must pass
  `referred_by_code` in the body. Spec currently allows either; tests
  exercise the DTO path only.
- Playwright e2e for the share-button → cookie → signup → commission
  credit full flow is deferred. Owner to decide if it needs separate
  spec or is covered enough by the E2E-B + F splits.

## Decisions Log

- **2026-05-10** — Layer split U / E2E-B / F / PW (no Cypress; Playwright
  for browser tests). Standard TradeHub layering.
- **2026-05-10** — Real Postgres in Testcontainer for E2E-B; in-memory
  Stripe mock (no `stripe-mock` Docker container needed since we don't
  test webhook signing here — that's covered by `tests-escrow/`).
- **2026-05-10** — Reuse `test/util/factories.ts` helpers. Add
  `seedContract`, `seedReferralAttribution` factories in this folder's
  fixtures.
- **2026-05-10** — Tests do NOT replicate Subcontract coverage (that
  feature was deleted). Old `referral.*.spec.ts` deleted as part of
  this folder's `Slice A`.
- **2026-05-10** — `collaboration.service.spec.ts.deferred` (renamed
  during the parent refactor) is replaced by `cr.contract.e2e-spec.ts`
  + `contract.service.spec.ts`. The old `.deferred` file is deleted in
  Slice A.
