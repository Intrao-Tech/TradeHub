# Notes — Escrow

Working notes for the implementing AI / engineer. Research, links, technical decisions, comparator findings, references for the implementation slices.

## Comparator: Upwork (canonical reference for our model)

User explicitly named Upwork as the reference. Spec mirrors Upwork's fixed-price contract behavior.

### What we copy from Upwork

| Behavior | Upwork pattern | Our equivalent (ESCROW-NNN) |
|---|---|---|
| Hosted payment page | Stripe Checkout / similar | ESCROW-040, Stripe Checkout (Q3) |
| Milestones for fixed-price contracts | Multiple milestones per contract, fund-one-at-a-time | ESCROW-001, ESCROW-002, ESCROW-066 |
| Auto-release after silence | 14 days | ESCROW-064 (we use 7d — UK construction moves faster) |
| Dispute escalation | 3-stage: Refund request → Mediation → Binding arbitration | ESCROW-080..083 (we do 2-stage in MVP, CIArb extensibility for future) |
| Contract close requires explicit "End contract" | Yes | ESCROW-067, ESCROW-133 (Q14) |
| Chat stays open after contract close | Yes | ESCROW-141 (Q21 system messages keep chat as the timeline) |
| Worker without Connect can't receive payouts | Yes (worker must complete onboarding) | ESCROW-022, ESCROW-024 (Q4 — gate at first-fund time) |
| Disputed milestone blocks subsequent funding | Yes (per Upwork community + support docs) | ESCROW-040 BLOCKED_BY_DISPUTE (Q11) |
| Review window opens AFTER contract end | 14d double-blind review (we have reviews shipped) | ESCROW-067 + reviews feature |

### What we deliberately deviate from Upwork

| Behavior | Upwork | Our deviation | Why |
|---|---|---|---|
| Auto-release window | 14 days | 7 days | UK construction projects move faster. If user feedback says too aggressive, easy config change. |
| Binding arbitration | AAA, $291 split | Moderator decision is final (no third-party arbitration) | MVP scope. CIArb integration is a future feature with legal partnership prerequisites. |
| Client marketplace fee | 10% (varies; recently changed from 5%) | Configurable from `/admin/settings`, default 5% | Owner asked for runtime configurability without code changes. Default starts low; admin tunes. |
| Freelancer service fee tiering | 5%/10%/20% based on lifetime billings with same client | Flat % | Tiered pricing is a separate `subscriptions/` feature. Locked in scope.md Q5. |
| Multi-currency | USD primary, others available | GBP only | Locked in scope.md. UK marketplace. |

### Sources consulted

- [How Fixed-Price Payment Protection works for freelancers on Upwork](https://support.upwork.com/hc/en-us/articles/211063748-How-Fixed-Price-Payment-Protection-works-for-freelancers-on-Upwork)
- [How payments for milestones and fixed-price contracts work](https://support.upwork.com/hc/en-us/articles/211063718-How-payments-for-milestones-and-fixed-price-contracts-work)
- [Understanding milestones on fixed-price contracts](https://support.upwork.com/hc/en-us/articles/44564821903763-Understanding-milestones-on-fixed-price-contracts)
- [Closing contracts](https://support.upwork.com/hc/en-us/articles/35117936386579-Closing-contracts)
- [How to file a dispute when client doesn't pay a milestone](https://support.upwork.com/hc/en-us/articles/211068528-Dispute-non-release-of-a-milestone-payment)
- [What is arbitration on Upwork](https://support.upwork.com/hc/en-us/articles/14044146250259-Arbitration)
- [Upwork Dispute Process Demystified](https://www.upwork.com/resources/upwork-dispute-process)
- [How to troubleshoot failed payments on Upwork](https://support.upwork.com/hc/en-us/articles/38726168165011-How-to-troubleshoot-failed-payments-on-Upwork)
- [How to troubleshoot withdrawal issues on Upwork](https://support.upwork.com/hc/en-us/articles/211063828-How-to-troubleshoot-withdrawal-issues-on-Upwork)

## Stripe Connect Express — implementation patterns

### Why Express (not Custom, not Standard)

- **Standard**: connected user has full Stripe Dashboard access, manages their own account. Bad fit — workers shouldn't own a Stripe Dashboard, and we can't customize their UX.
- **Custom**: platform owns full liability and KYC custody. Bad fit — too much regulatory burden for a marketplace MVP.
- **Express** ✓: hosted onboarding, lightweight custom dashboard, platform-managed account with limited but sufficient capabilities (`transfers`, `payouts`).

### Onboarding URL pattern (ESCROW-020)

```ts
const account = await stripe.accounts.create({
  type: 'express',
  country: 'GB',
  email: worker.email,
  capabilities: {
    transfers: { requested: true },
    // We don't request `card_payments` because workers don't accept charges directly.
  },
});

await prisma.clientProfile.update({
  where: { id: workerProfileId },
  data: { stripe_connect_account_id: account.id },
});

const accountLink = await stripe.accountLinks.create({
  account: account.id,
  return_url: `${frontendUrl}/wallet?onboarding=complete`,
  refresh_url: `${frontendUrl}/wallet?onboarding=incomplete`,
  type: 'account_onboarding',
});

return { onboarding_url: accountLink.url };
```

### Payment + Transfer pattern (ESCROW-040 + ESCROW-061)

We use **Separate Charges and Transfers** — recommended Stripe Connect pattern for marketplaces.

**Why**: charge lands on platform balance, then platform makes independent transfers. This supports our 3-way split (worker + platform + referrer) cleanly.

**Alternative considered: Destination charges with `on_behalf_of`** — funds route directly to worker, platform takes app fee. Rejected because: (a) doesn't support 3-way split natively, (b) platform doesn't control timing of transfer (which we need for milestone-based release), (c) referrer payment becomes a separate concern.

### Idempotency key pattern (ESCROW-152)

Every Stripe write call has an `Idempotency-Key`:

```
escrow_milestone_${milestoneId}_fund               (one-shot fund)
escrow_milestone_${milestoneId}_release_worker     (one-shot release to worker)
escrow_milestone_${milestoneId}_release_referral   (one-shot release to referrer)
escrow_milestone_${milestoneId}_refund             (one-shot full refund)
escrow_milestone_${milestoneId}_retry_release_${attemptNumber}   (manual retry, new key)
escrow_dispute_${disputeId}_resolve_worker         (dispute split — worker share)
escrow_dispute_${disputeId}_resolve_employer       (dispute split — employer refund)
```

Stripe stores these for 24h (free tier) — sufficient for double-click prevention. Manual retries use a new key suffix to avoid hitting the cached "already processed" response.

### Webhook event coverage

We rely on these Stripe events as source-of-truth (in `webhooks/stripe.service.ts`):

**Platform events:**
- `payment_intent.succeeded` → milestone `FUNDED`
- `payment_intent.payment_failed` → milestone stays `PENDING` (employer retries)
- `charge.refunded` → milestone `REFUNDED` (idempotent)
- `charge.dispute.created` → milestone `DISPUTED` (chargeback initiated by employer's bank — rare, but possible). Different from our app-level dispute; treat as urgent and notify admin.

**Connect events:**
- `account.updated` → update `client_profile.connect_*_enabled` flags
- `transfer.paid` → milestone `RELEASED` (idempotent)
- `transfer.failed` → milestone `RELEASE_FAILED`
- `payout.paid` / `payout.failed` → informational, log only (Stripe pays worker on its own schedule)
- `account.application.deauthorized` → worker disconnected their Connect account; flag for follow-up email

### Stripe-mock for tests

`tests-escrow/` will use Stripe's official `stripe-mock` Docker container. Never the real Stripe API in tests.

```yaml
# docker-compose.test.yml addition
services:
  stripe-mock:
    image: stripe/stripe-mock:latest
    ports:
      - 12111:12111
      - 12112:12112  # HTTPS
```

Backend test setup points `STRIPE_SECRET_KEY` to a stripe-mock-compatible token and overrides Stripe SDK to point at `http://localhost:12111`.

## Existing scaffolding to consume — DO NOT rewrite

These are already shipped and working:

- **Schema** — `EscrowTransaction` model already in `backend/prisma/schema.prisma:550-572` with all the fields we need (job_amount, platform_fee, etc.) and the unique constraint on `collaboration_id`. Migration adds `EscrowMilestone`, `PlatformSetting`, `EscrowDispute`, `PendingReferralPayout` ON TOP — no schema rewrite.
- **Webhook controller** — `backend/src/webhooks/stripe.controller.ts` already verifies signatures with both platform and Connect secrets. Just add new event handlers in `webhooks/stripe.service.ts`.
- **Stripe client** — `backend/src/stripe/stripe.module.ts` exports `STRIPE_CLIENT` token; inject it.
- **PrismaService** — already global; inject as usual.
- **AuditService** — already exists in `backend/src/audit/`; use for state transitions.
- **MailService** — already exists in `backend/src/mail/`; add new `sendEscrowFunded` etc. methods following existing pattern.
- **Frontend `/escrow/:id` placeholder** — already shipped by `tasks/done/collaborations-polish/` (`COLLAB-003`). Replace its body in `web/src/pages/EscrowPlaceholderPage.tsx` (rename to `EscrowDetailPage.tsx`).
- **Frontend collab summary card** — already shipped by `tasks/done/collaborations-polish/` (`COLLAB-022` in `web/src/pages/CollaborationDetailPage.tsx:719`). Extend with funded/released amounts.
- **Frontend Connect onboarding link in `/wallet`** — `/wallet` route doesn't exist yet, this feature ships it.

## Slice plan (high-level — full breakdown in contract.md)

```
Slice A — Schema + Connect onboarding
  Backend: migration for 4 new tables + columns
           POST /escrow/onboarding/start, GET /escrow/onboarding/status
           webhook handler account.updated
  Frontend: /wallet placeholder + onboarding banner
  Tests: connect-onboarding.e2e-spec.ts

Slice B — Milestones + Fund flow
  Backend: POST /escrow/:id/milestones (CRUD)
           POST /escrow/milestones/:id/fund → Stripe Checkout
           webhook payment_intent.succeeded → milestone FUNDED
  Frontend: /escrow/:id detail page (replaces placeholder)
            milestone list + Fund button
  Tests: escrow-fund.e2e-spec.ts, escrow-milestones.spec.ts

Slice C — Submission + Release + Auto-release
  Backend: POST /escrow/milestones/:id/submit
           POST /escrow/milestones/:id/approve → transfers.create
           webhook transfer.paid → RELEASED
           cron job for auto-release after 7d
           PendingReferralPayout backfill on referrer onboarding
  Frontend: Submit / Approve buttons on /escrow/:id
            "X days remaining" countdown
  Tests: escrow-release.e2e-spec.ts, escrow-auto-release.spec.ts

Slice D — Refund + Dispute + Cancel
  Backend: POST /escrow/milestones/:id/refund
           POST /escrow/milestones/:id/dispute + dispute respond/resolve
           moderator queue endpoints
           POST /escrow/cancel + POST /escrow/decline
  Frontend: Refund / Dispute buttons on /escrow/:id
            /admin/escrow/disputes queue UI
  Tests: escrow-refund.e2e-spec.ts, escrow-dispute.e2e-spec.ts

Slice E — Wallet + Admin settings + Polish
  Backend: GET /wallet/me, GET /admin/settings/platform, PATCH /admin/settings/platform
  Frontend: /wallet page (full ledger), /admin/settings page
  System chat messages on every escrow event (per Q21)
  Email notifications wired (per ESCROW-156)
  Tests: wallet.spec.ts, platform-settings.spec.ts

Slice F — Audit + state cleanup + observability
  Move escrow status strings to constants.ts enum
  Audit log every transition
  /escrow/providers feature flag endpoint
  Remove mock endpoints (ESCROW-158)
  Documentation pass
```

## Commit hygiene

Per `PROMPTS.md` §3:
- `feat(escrow): <slice>` for each implementation slice
- `fix(escrow): <bug>` for bug fixes
- `chore(escrow): <maintenance>` for non-functional changes (this current commit drafts the spec)

## Risks / things to watch

| Risk | Mitigation |
|---|---|
| Webhook delivered before our DB write commits | Short Prisma transaction in fund handler; if webhook arrives early, log + no-op (Stripe redelivers) |
| Two webhook deliveries for same event (Stripe retries) | Idempotent handlers (check current state before write) |
| Connect onboarding incomplete but worker is in a collaboration | Don't gate at collab-confirm; gate at first-fund attempt only |
| Mid-release dispute (timing race) | DB transaction at release: `UPDATE WHERE status='SUBMITTED' AND id=...`. If row already DISPUTED, transfer not fired. |
| Referrer never onboards | `PendingReferralPayout` row stays PENDING indefinitely; admin can manually pay out via Stripe dashboard if needed; no funds lost |
| Stripe-mock vs real API behavior diverges | Use stripe-mock in tests, manual smoke on test mode keys before declaring slice done |
| Admin changes fee % mid-contract | New rate applies to NEW funding; in-flight contracts use frozen snapshot from first-fund. Documented in /admin/settings UI. |
| Worker disputes after auto-release fired (within seconds) | DB optimistic lock — first state change wins; second is `409 INVALID_STATE` |
| Refund of fully-funded milestone where worker has done partial work | Goes through dispute, not voluntary refund. Voluntary refund (ESCROW-070) only on FUNDED, never on SUBMITTED. |
| Stripe `requires_action` (3DS challenge) | Stripe Checkout handles 3DS in their hosted UI; if user fails, PI fails, milestone stays PENDING, employer retries. |
| Currency precision | Always `Prisma.Decimal`, never JS Number. Convert to pence (Int) ONLY at the Stripe API boundary. |

## Future extensions (not in this feature)

- Binding arbitration via CIArb (UK) when legal partnership signed. Schema-ready (ESCROW-086).
- Tiered platform fees based on subscription tier. Lives in `subscriptions/` feature.
- Multi-currency / FX. Lives in a future `international-collabs/` feature.
- Push / SMS notifications. Lives in a future `notifications-v2/` feature.
- Wallet-to-bank withdrawals (currently Stripe Express handles this; we don't need a custom flow).
- Partial refunds (currently dispute-resolution-only; could surface as a dedicated UI).
- Escrow templates ("standard 3-milestone web build", "5-milestone construction project") — productivity feature for repeat employers.
- Ledger export (CSV / PDF) for tax purposes. Workers' accountants ask for this.
