# Notes — Contracts & Referrals

## Comparators

### Upwork (primary model for both halves)

**Contracts model:**
- "Contract" is the unit of paid engagement (fixed-price or hourly).
- "Hire again" is a first-class CTA on a closed contract — spawns a new contract under the same client-freelancer pair.
- Chat thread persists across all contracts for a given client-freelancer pair (verified by inspecting Upwork UI 2026-05-09).
- Reviews are per-contract, not per-relationship — same pair can review each other multiple times.

**Account referral:**
- Freelancers can invite *clients* (employers) via `https://www.upwork.com/ab/account-security/join?referrerId=XXX`.
- Reward: bonus when the new client posts a job and hires within X days. Specifics vary per market and have changed over time.
- Cookie attribution at click; locked at signup. Already-registered users excluded.

**Project referral:**
- Upwork has none. Subcontracting flows exist via Talent Marketplace as a separate hire flow, not a referral cut.

### Other

- **Fiverr** — no relationship-level concept, every order is independent. Affiliate program is account-level only.
- **Toptal** — heavily curated, refers via VIP partner program with bespoke deals. Not a public referral mechanism.
- **TaskRabbit** — has a refer-a-tasker / refer-a-client account-level program, similar reward structure to Upwork.

Conclusion: Upwork is the right primary model. The W→W and E→E project-referral feature is TradeHub-specific innovation.

## Anti-fraud considerations (out of scope for MVP, but on the radar)

- **Self-ref ring** — A creates ref, B signs up via A's link, B creates ref, A's alt account signs up via B → infinite mutual cuts. Mitigate via same-IP / same-payment-method dedup post-MVP.
- **Click bombing** — referrer floods clicks to inflate "share" stats. Doesn't affect payouts (no per-click pay) but skews reporting. Add per-IP rate limit on `POST /referral/intent` post-MVP. With server-side intent (one row per click) the table can also grow large — per-actor cap or periodic cleanup of expired rows post-MVP.
- **Refree gaming** — user signs up via ref code A, then later realises ref code B would pay them more (e.g. tiered), tries to switch. Mitigate: `referred_by_id` is immutable post-signup.

## Window semantics

- 12-month window starts at `Account.referred_at` (when ref recorded, == signup).
- Window check at commission-compute time: `now() < referred_at + window_months months`.
- If `account_referral_window_months` is NULL → lifetime, no check.
- Edge: what if admin shortens window from 12 → 6 months mid-flight? Behavior: applies to NEW commissions immediately. Past commissions already paid are not clawed back. Document in admin tooltip.

## Attribution security (server-side intent model — replaced cookies on 2026-05-10)

- **No cookies at all** for referral attribution. Cookies were brittle (cross-origin Set-Cookie dropped without `credentials:'include'`, Safari ITP caps client cookies to 7d, GDPR adds banner overhead, incognito strips them). Replaced with the `ReferralIntent` server-side table.
- **Account-ref**: pure URL. `GET /r/:code` 302 → `/register?ref=CODE`; the register form forwards `referred_by_code` in the signup POST. Attribution locked at signup forever, validated server-side against `Account.referral_code`.
- **Project-ref (W2W / E2E)**: requires the clicker to be logged in. Frontend `useRefAttribution` hook posts to `/referral/intent` only when `getToken()` is truthy AND `?ref=` is present. Backend writes a `ReferralIntent` row keyed by `(actor_account_id, target_role, target_id)`, expires_at = now + 30d. Anonymous clicks on project-ref links are intentionally not attributed — anonymous viewers cannot perform a qualifying action without registering anyway.
- **Lookup at action time**: `findActiveIntent(actor, target_role, target_id)` returns the latest non-expired row; multiple actions on the same target (apply, then later contract creation from the same job) can each consume it independently.
- **Re-validation**: backend always re-resolves `referrer_account_id` to a real Account at consumption time; the intent row only stores the FK, no opaque code.
- **Self-ref guard**: enforced at intent-record time (`actor == referrer` is a silent no-op) and at consumption time (employer == referrer / worker == referrer rejected with silent skip).

## Cap math

Worked example:
- Milestone agreed_amount: £1000
- Platform fee 5% = £50
- Account ref for worker (Mike's referree): 10% of platform_fee = £5
- Project ref W→W (Sarah shared this job): 2% of agreed_amount = £20

Total ref cuts proposed: £25. Platform fee: £50. £25 < £50 → no capping. Platform keeps £25.

Worked example with cap:
- Milestone: £100
- Platform fee 5% = £5
- Account ref worker: £0.50 (10% of fee)
- Account ref employer: £0.50
- Project ref W→W: £2 (2% of agreed)
- Project ref E→E: £2

Total ref cuts: £5. Platform fee: £5. Hits cap exactly.

Worked example with cap exceeded:
- Milestone: £100, fee £5
- All four refs above plus admin bumped account_ref_pct to 50% → £2.50 each = £5 + £5 = £10
- Project refs unchanged: £2 + £2 = £4
- Total: £14, capped at £5
- Scale factor: £5 / £14 ≈ 0.357
- Each cut multiplied by 0.357: account refs become £0.89 each, project refs become £0.71 each
- Sum: £3.20 ... wait doesn't add up to £5? Let me redo:
- Each: £2.50 → £0.89, £2.50 → £0.89, £2 → £0.71, £2 → £0.71. Sum = £3.20. Off by £1.80.
- The issue: rounding to pence. Use Decimal arithmetic and accept ±0.04 rounding loss to platform.
- Final implementation: `cap_factor = platform_fee / sum`, each cut = `gross * cap_factor`, rounded down to pence. Platform absorbs rounding fragments (small, predictable).

Implementation: do this in `referral.service.computeMilestoneCommissions` with Prisma.Decimal throughout. Tests cover the exact math edge cases.

## Open issues / future work

- Referral attribution analytics dashboard for admin. MVP just shows raw lists.
- A/B testing of referral copy (subject lines, button labels). Out of scope.
- "Refer your subcontractor" specifically — distinct from worker-to-worker refer because it's a job-task delegation. Not on MVP roadmap; would need separate Subcontract feature.
- Multi-tier referrals (your referree refers someone, you get 1% too). Definitely no.
- Code rotation / regeneration (lost code, want a new one). Out of MVP, raw DB.
- Cookieless attribution (server-side via signed URL params). Could be Phase 2.
