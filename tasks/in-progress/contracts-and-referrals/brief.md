# Brief — Contracts & Referrals

## Feature

Two coupled changes that together replace the current `Collaboration` lifecycle and the `Referral`/`ReferralOffer` "subcontract" feature:

1. **Collaboration → Contract refactor** (Upwork-style relationship model). Collaboration becomes a stateless relationship binding (worker ↔ employer + persistent chat). Contract becomes the lifecycle entity holding agreed_amount, status, escrow, milestones. One Collaboration can have N Contracts ("Hire again"). Chat persists across contracts.

2. **New referral system**, two referral types, both trackable on `/referrals`:
   - **Account referral** (Upwork-style): personal code `MIKE-A1B2` → ref-link `/r/CODE` → 302 to `/register?ref=CODE` → register form forwards `referred_by_code` on signup → referrer earns % of platform_fee on every released milestone in any contract where referree is a party, for an admin-configurable window (default 12 months, lifetime option).
   - **Project referral**: per-job link (worker→worker) and per-worker link (employer→employer). Logged-in click writes a server-side `ReferralIntent` row keyed by the actor account → consumed at JobApplication.create or Contract.create → referrer earns % of agreed_amount on every released milestone of that contract. Only credits already-registered users.

> Cookie-based attribution was the original draft on both flows. Replaced 2026-05-10 with pure URL (account-ref) + server-side intent table (project-ref) after cookies proved fragile in cross-origin testing. See spec.md Decisions Log.

Old `Referral`/`ReferralOffer` "subcontract" feature is dropped entirely.

## Problem

**For the contract refactor:** Current model conflates "this is a working relationship" with "this is one paid engagement." Once a Collaboration is `COMPLETED`, there's no first-class way to start fresh work with the same person. Re-using the row would corrupt audit history; creating a new collab loses chat continuity. The Upwork solution is to split: relationship persists, contracts come and go.

**For the new referral system:** The current `/referrals` page is a sub-contracting marketplace (worker A creates lead, sends private offer to worker B, who accepts and gets a contract spawned with referrer-as-employer). It's not a referral system at all — there's no commission, no signup attribution, no per-job sharing. We need actual referral mechanics that drive new-user acquisition (account referrals) and lead distribution (project referrals).

## Why now

- Escrow shipped. Money is now actually flowing through TradeHub. Without referrals, there's no growth mechanism beyond direct signups.
- Hire-again is the most-requested feature from internal stakeholders (Igor, 2026-05-09 standup). Current workaround is to manually create a new collab and lose chat history.
- The current `Subcontract` flow on `/referrals` is misleading users — calling it "Referrals" creates the wrong expectations. Either fix it (this spec) or rename it loud.

## Out of scope

- Multi-tier referrals (A refers B, B refers C → A gets cut from C). MVP is direct refs only.
- Referral promo codes (campaigns, time-limited bonuses). Single permanent personal code per account.
- Vanity codes (custom "MIKES-PLUMBING"). Auto-generated short codes only in MVP.
- Anti-fraud (same-IP block, payment-method dedup). Logged but not blocked.
- Multi-currency. GBP only (matches escrow).
- Multi-conversation per contract. One persistent conversation per Collaboration, all contracts share it.
- Backfilling referral attribution for existing accounts. New attribution starts from migration time forward.
- Subscription-based referral rates (pro tier higher %). Single global rate per type.
