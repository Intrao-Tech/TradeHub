# Coverage matrix — tests-escrow

> **Skeleton.** Filled in row-by-row as `TEST-ESCROW-NNN` cases are written. Each `ESCROW-NNN (Must)` requirement from the parent spec must have ≥1 mapped test case. Layers tagged: U (unit), E2E-B (backend e2e), E2E-WH (webhook), F (frontend), PW (Playwright).

## Status legend

- 🟢 green — test exists and passes
- 🟡 yellow — test exists but is skipped or failing (with followup)
- 🔴 red — no test yet
- ⚪ N/A — requirement is documentation-only or doesn't need a test

## Matrix

| ESCROW-NNN | Layer | TEST-ESCROW-NNN | Status | Notes |
|---|---|---|---|---|
| ESCROW-001 | E2E-B | TEST-ESCROW-001 | 🔴 | EscrowMilestone schema migration applied, FK enforced |
| ESCROW-002 | U | TEST-ESCROW-002 | 🔴 | Status state machine validation (allowed transitions) |
| ESCROW-003 | E2E-B | TEST-ESCROW-003 | 🔴 | PlatformSetting singleton row created on migration |
| ESCROW-004 | E2E-B | TEST-ESCROW-004 | 🔴 | EscrowDispute one-per-milestone uniqueness |
| ESCROW-005 | U | TEST-ESCROW-005 | 🔴 | EscrowTransaction status enum extended |
| ESCROW-006 | F | TEST-ESCROW-006 | 🔴 | Frontend renders agreed_amount as sum(milestones) |
| ESCROW-007 | ⚪ | — | ⚪ | Migration is additive; no data backfill test needed |
| ESCROW-020 | E2E-B | TEST-ESCROW-020 | 🔴 | POST /escrow/onboarding/start happy path |
| ESCROW-021 | E2E-B | TEST-ESCROW-021 | 🔴 | GET /escrow/onboarding/status reads Stripe |
| ESCROW-022 | E2E-WH | TEST-ESCROW-022 | 🔴 | account.updated webhook flips connect_*_enabled |
| ESCROW-023 | E2E-WH | TEST-ESCROW-023 | 🔴 | First-time payouts_enabled triggers email (idempotent on retry) |
| ESCROW-024 | E2E-B | TEST-ESCROW-024 | 🔴 | Worker without Connect can apply / accept; not blocked |
| ESCROW-030 | E2E-B | TEST-ESCROW-030 | 🔴 | POST /escrow/:id/milestones happy path + role gating |
| ESCROW-031 | E2E-B | TEST-ESCROW-031 | 🔴 | PATCH milestone allowed only PENDING |
| ESCROW-032 | E2E-B | TEST-ESCROW-032 | 🔴 | DELETE milestone allowed only PENDING |
| ESCROW-033 | F | TEST-ESCROW-033 | 🔴 | Reorder via drag-handle |
| ESCROW-034 | E2E-B | TEST-ESCROW-034 | 🔴 | Add milestone after partial fund |
| ESCROW-035 | E2E-B | TEST-ESCROW-035 | 🔴 | (escrow_id, position) unique race |
| ESCROW-040 | E2E-B | TEST-ESCROW-040 | 🔴 | Fund happy path → Stripe Checkout session |
| ESCROW-040b | E2E-B | TEST-ESCROW-040b | 🔴 | WORKER_NOT_ONBOARDED returns 409 + onboarding_url |
| ESCROW-040c | E2E-B | TEST-ESCROW-040c | 🔴 | BLOCKED_BY_DISPUTE returns 409 |
| ESCROW-040d | E2E-B | TEST-ESCROW-040d | 🔴 | BLOCKED_BY_OTHER_FUNDED returns 409 (lockstep) |
| ESCROW-041 | U | TEST-ESCROW-041 | 🔴 | computePayouts arithmetic correctness (rounding to pence) |
| ESCROW-042 | E2E-B | TEST-ESCROW-042 | 🔴 | Stripe Checkout call signature (idempotency-key, metadata) |
| ESCROW-043 | E2E-WH | TEST-ESCROW-043 | 🔴 | payment_intent.succeeded → FUNDED (idempotent on duplicate) |
| ESCROW-044 | E2E-WH | TEST-ESCROW-044 | 🔴 | payment_intent.payment_failed keeps PENDING |
| ESCROW-045 | E2E-B | TEST-ESCROW-045 | 🔴 | First fund flips EscrowTransaction CREATED → ACTIVE |
| ESCROW-046 | E2E-WH | TEST-ESCROW-046 | 🔴 | Email + chat system msg on FUNDED |
| ESCROW-050 | E2E-B | TEST-ESCROW-050 | 🔴 | Submit happy path |
| ESCROW-051 | E2E-B | TEST-ESCROW-051 | 🔴 | System chat msg on submit |
| ESCROW-052 | E2E-B | TEST-ESCROW-052 | 🔴 | Revise submission resets timer |
| ESCROW-053 | E2E-B | TEST-ESCROW-053 | 🔴 | Withdraw submission → back to FUNDED |
| ESCROW-060 | E2E-B | TEST-ESCROW-060 | 🔴 | Approve happy path |
| ESCROW-061 | E2E-B | TEST-ESCROW-061 | 🔴 | Release fires worker + referrer transfers |
| ESCROW-062 | E2E-WH | TEST-ESCROW-062 | 🔴 | transfer.paid confirmation idempotent |
| ESCROW-063 | E2E-WH | TEST-ESCROW-063 | 🔴 | transfer.failed → RELEASE_FAILED |
| ESCROW-064 | E2E-B | TEST-ESCROW-064 | 🔴 | Auto-release cron after 7 days silent |
| ESCROW-065 | E2E-B | TEST-ESCROW-065 | 🔴 | System chat msg on release |
| ESCROW-066 | E2E-B | TEST-ESCROW-066 | 🔴 | Releasing N unblocks N+1 funding |
| ESCROW-067 | E2E-B | TEST-ESCROW-067 | 🔴 | Last release does NOT auto-end contract |
| ESCROW-070 | E2E-B | TEST-ESCROW-070 | 🔴 | Refund FUNDED milestone |
| ESCROW-071 | E2E-B | TEST-ESCROW-071 | 🔴 | refunds.create idempotency |
| ESCROW-072 | E2E-WH | TEST-ESCROW-072 | 🔴 | charge.refunded confirmation idempotent |
| ESCROW-073 | E2E-B | TEST-ESCROW-073 | 🔴 | Refund of one milestone doesn't end contract |
| ESCROW-074 | E2E-B | TEST-ESCROW-074 | 🔴 | Refund of SUBMITTED returns 409 USE_DISPUTE_FLOW |
| ESCROW-080 | E2E-B | TEST-ESCROW-080 | 🔴 | Dispute filing |
| ESCROW-081 | E2E-B | TEST-ESCROW-081 | 🔴 | Dispute respond accept/reject |
| ESCROW-082 | E2E-B | TEST-ESCROW-082 | 🔴 | Auto-escalate to moderator after 7 days silent |
| ESCROW-083 | E2E-B | TEST-ESCROW-083 | 🔴 | Moderator resolve happy path (50/50 split) |
| ESCROW-084 | E2E-B | TEST-ESCROW-084 | 🔴 | Resolution split payout (transfers + refunds) |
| ESCROW-085 | E2E-B | TEST-ESCROW-085 | 🔴 | Disputed milestone blocks subsequent fund |
| ESCROW-086 | ⚪ | — | ⚪ | Schema-only extensibility for CIArb; no test in MVP |
| ESCROW-087 | E2E-B | TEST-ESCROW-087 | 🔴 | System chat msg on dispute / resolve |
| ESCROW-090 | E2E-B | TEST-ESCROW-090 | 🔴 | Cancel before fund |
| ESCROW-091 | E2E-B | TEST-ESCROW-091 | 🔴 | Cancel sets all milestones + collab CANCELED |
| ESCROW-092 | E2E-B | TEST-ESCROW-092 | 🔴 | Worker decline → full refund |
| ESCROW-093 | E2E-B | TEST-ESCROW-093 | 🔴 | Audit on cancel |
| ESCROW-094 | E2E-B | TEST-ESCROW-094 | 🔴 | System chat msg on cancel |
| ESCROW-095 | E2E-B | TEST-ESCROW-095 | 🔴 | PendingReferralPayout row written when referrer not onboarded |
| ESCROW-096 | E2E-B | TEST-ESCROW-096 | 🔴 | Backfill on referrer onboarding |
| ESCROW-097 | E2E-WH | TEST-ESCROW-097 | 🔴 | account.updated triggers backfill |
| ESCROW-098 | F | TEST-ESCROW-098 | 🔴 | Wallet shows pending payouts |
| ESCROW-110 | F | TEST-ESCROW-110 | 🔴 | /wallet sections render |
| ESCROW-111 | E2E-B | TEST-ESCROW-111 | 🔴 | GET /wallet/me returns expected shape |
| ESCROW-112 | E2E-B | TEST-ESCROW-112 | 🔴 | Retry release with new idempotency-key |
| ESCROW-113 | E2E-B | TEST-ESCROW-113 | 🔴 | Re-onboarding for restricted account |
| ESCROW-120 | F | TEST-ESCROW-120 | 🔴 | /admin/settings form |
| ESCROW-121 | E2E-B | TEST-ESCROW-121 | 🔴 | GET /admin/settings/platform |
| ESCROW-122 | E2E-B | TEST-ESCROW-122 | 🔴 | PATCH validates ranges + audits |
| ESCROW-123 | E2E-B | TEST-ESCROW-123 | 🔴 | Fee preview matches computePayouts |
| ESCROW-130 | F | TEST-ESCROW-130 | 🔴 | /escrow/:id replaces placeholder |
| ESCROW-131 | F | TEST-ESCROW-131 | 🔴 | Lifecycle timeline rendering |
| ESCROW-132 | F | TEST-ESCROW-132 | 🔴 | Add milestone CTA visibility per state |
| ESCROW-133 | E2E-B | TEST-ESCROW-133 | 🔴 | End contract triggers 7-day window |
| ESCROW-134 | F | TEST-ESCROW-134 | 🔴 | Cancel CTA visibility |
| ESCROW-140 | F | TEST-ESCROW-140 | 🔴 | Collab summary card extended |
| ESCROW-141 | E2E-B | TEST-ESCROW-141 | 🔴 | Chat system msgs on every escrow event |
| ESCROW-150 | ⚪ | — | ⚪ | Swagger documentation (manual review) |
| ESCROW-151 | U | TEST-ESCROW-151 | 🔴 | Decimal currency precision boundary |
| ESCROW-152 | E2E-B | TEST-ESCROW-152 | 🔴 | Idempotency-Key on every Stripe call |
| ESCROW-153 | E2E-B | TEST-ESCROW-153 | 🔴 | Audit events emitted (one assertion per event type) |
| ESCROW-154 | E2E-B | TEST-ESCROW-154 | 🔴 | Throttle limits respected |
| ESCROW-155 | E2E-B | TEST-ESCROW-155 | 🔴 | AccountStateGuard + RequiresVerifiedEmail enforced |
| ESCROW-156 | E2E-B | TEST-ESCROW-156 | 🔴 | Email notifications fire (existing MailService spy) |
| ESCROW-157 | E2E-B | TEST-ESCROW-157 | 🔴 | /escrow/providers feature flag |
| ESCROW-158 | E2E-B | TEST-ESCROW-158 | 🔴 | Removed mock endpoints return 404 |
| ESCROW-159 | ⚪ | — | ⚪ | Swagger docs review |
| **Critical paths** | | | | |
| Happy path — onboard → fund → submit → approve → end | PW | TEST-ESCROW-PW-001 | 🔴 | Single browser test, full flow |
| Dispute resolution — fund → submit → dispute → resolve | PW | TEST-ESCROW-PW-002 | 🔴 | Browser e2e |
| Auto-release — fund → submit → 7d silent → auto fires | PW | TEST-ESCROW-PW-003 | 🔴 | Clock-controlled |

## Followup tracking

(Open during implementation — link to `followups.md`.)

## Targets by ship date

- 🟢 ratio for `Must` requirements: ≥90%
- 🟢 ratio for `Should` requirements: ≥70%
- 🟢 ratio for `Could` requirements: ≥50%
- All PW tests green on CI
- No 🟡 (skipped) without a tracked followup
