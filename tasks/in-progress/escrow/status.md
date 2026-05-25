# Status

- State: in-progress (spec drafted + milestone-detail features; **schema reworked 2026-05-11 — code rewrite pending**)
- Owner: Igor (PM); implementing engineer: Claude session
- Created: 2026-05-09 (folder moved from product/ via scope.md → spec drafting)
- Started: 2026-05-09
- Last Updated: 2026-05-11
- Shipped: —

> **2026-05-11 — schema rework.** After a full DB audit the escrow data model
> was redesigned. Authoritative schema: `tasks/in-progress/DATA-MODEL.md` +
> `backend/prisma/schema.prisma` + `db-schema-full.sql`. Spec (`spec.md` §1 +
> Decisions Log) updated; `contract.md` §1 superseded (banner added). Headline
> escrow changes: `escrow_transaction` table dropped (milestone → contract
> directly); unified `payment` ledger replaces `pending_worker_payout` +
> `pending_referral_payout` and the milestone Stripe-id columns;
> `escrow_milestone_attachment` has no `uploaded_by`; `escrow_dispute.filed_by`
> → `filed_by_role`. **Backend/frontend code + migration + seed must be
> rewritten against the new schema** — this is the next phase.

## Notes

- **2026-05-09** — Folder moved `product/` → `in-progress/`. `scope.md` from product phase migrated into `brief.md` framing + `notes.md` references. Full SDD set drafted: `brief.md`, `spec.md` (101 ESCROW-NNN requirements with Decisions Log), `notes.md` (Upwork research + Stripe Connect patterns), `contract.md` (sealed schema + endpoints + slice plan + audit events). Sibling `tests-escrow/` scaffolded with `brief.md`, `spec.md` placeholder, `coverage-matrix.md` skeleton, `status.md`.
- **Headline architectural decisions** (full Decisions Log in `spec.md`):
  - **Money flow**: Stripe Connect Express. Separate Charges and Transfers pattern (charge lands on platform, then platform makes independent transfers to worker + referrer). Supports 3-way split.
  - **Multiple milestones from start** (Upwork pattern). Lockstep funding — one funded-but-unreleased milestone at a time per contract.
  - **Manual release** with **7-day auto-release** safety valve if employer goes silent post-submission.
  - **Stripe fee passthrough = `EMPLOYER_PAYS`** by default (Upwork-style: client absorbs processing fee in their charge).
  - **Admin-controlled fees** from `/admin/settings`: client marketplace fee %, freelancer service fee %, referral commission %, Stripe fee passthrough mode. ADMIN-only (not moderator).
  - **Worker onboarding gate at first-fund time** — workers without Connect can apply, accept collabs; blocked only when employer tries to fund.
  - **Per-milestone disputes block subsequent funding** (Upwork verified pattern). Resolution via moderator decision; no binding arbitration in MVP (CIArb extensibility via `EscrowDispute.arbitration_required` schema slot).
  - **Explicit "End contract" required** to close — releasing the last milestone does NOT auto-close. Either party clicks "End contract" → 7-day silent contest window → COMPLETED → reviews window opens.
  - **`Collaboration.agreed_amount` becomes derived** = sum of milestone amounts. Frozen snapshot at first-fund for audit.
  - **System chat messages on every escrow event** (overrides scope.md "do not post system messages" rule per explicit owner request).
  - **Removed mock endpoints** from existing `escrow.controller.ts` — webhook is now source-of-truth for all state transitions.
- **Slice plan**: 6 slices over ~3 weeks of dev. A — schema + Connect onboarding; B — milestones + fund; C — submit + release + auto-release; D — refund + dispute + cancel; E — wallet + admin settings + system chat msgs; F — audit + cleanup + provider flag.
- **Tests counterpart**: `tests-escrow/` opens parallel to Slice A; coverage drives `TEST-ESCROW-NNN` 1:1 against `ESCROW-NNN`. Real Stripe API never used in tests — `stripe-mock` Docker container or in-memory mock.
- **Webhook setup verified 2026-05-09**: `stripe listen --forward-to ... --forward-connect-to ...` running, both `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET` set in `.env`, `payment_intent.succeeded` test trigger returned `[200]` from local backend. Connect activated in Stripe sandbox via Marketplace business model. Test connected account auto-created (acct_1TVGTqEJxf4yoGty).
- **2026-05-24 dispute proposal flow + employer payments view + `/wallet` → `/payments` rename** (during the admin-panel iteration — see `tasks/in-progress/admin-panel/spec.md` for the cross-feature context):
  - New table `escrow_dispute_proposal` (migration `20260524210000_dispute_proposal_and_perms`) — staff proposes a split, both parties must accept before execution; partial UNIQUE blocks concurrent in-flight proposals on the same dispute. CHECK constraint on `worker_pct + employer_refund_pct = 100`. See ESCROW-160…167.
  - New endpoints: propose / decide / escalate / cancel-by-filer. Existing `resolveDispute` becomes the execution path under the proposal layer.
  - Frontend `DisputeProposalView` shared across worker, employer, and admin surfaces.
  - Stripe refund call drops `refund_application_fee` (incompatible with separate-transfer flow — runtime crash fixed).
  - Marketplace route `/wallet` renamed to `/payments` for both surfaces; old URL retained as redirect for Stripe Connect return URLs. New employer view at `/payments` driven by `GET /escrow/payments/me/employer` returning totals + ledger + open disputes (ESCROW-170…174).
- **2026-05-10 milestone-detail features added** (migration `milestone_request_attachments_worker_payout`):
  - REQUESTED + DECLINED milestone states (worker can request milestones; employer approves or declines, declined preserves the row).
  - `description` field on milestones (≤2000 chars).
  - `EscrowMilestoneAttachment` table — phase-aware (CREATION / SUBMISSION), max 3 per phase, PDF/JPEG/PNG/WebP ≤25MB, served from `/uploads/milestone-attachments/`.
  - `PendingWorkerPayout` table + sweep on Connect onboarding — release fires even when worker is not Stripe-onboarded, money is held on platform balance, swept to worker on `account.updated → payouts_enabled=true`.
  - Frontend: `MilestoneRow` shows REQUESTED/DECLINED badges, employer Approve/Decline buttons on REQUESTED, attachment list per phase with role-aware add/remove, "Held — connect Stripe" badge + wallet link when worker has held payout. `WalletPage` shows `pending_worker_payouts` as a "Held until you set up Stripe" section.
  - Spec rows added: ESCROW-002 (status enum extended), ESCROW-030/031/032 (creator-aware perms), ESCROW-036/037 (approve/decline-request), ESCROW-038/039 (attachments), ESCROW-068/068b/068c/069 (held payouts + sweep).

## Source inputs available to the implementing AI

- Spec phase output (this folder): `brief.md`, `spec.md`, `notes.md`, `contract.md`, `status.md` (current file).
- Product doc: `docs/TradeHub_UK_Technical_Specification_v2.docx` (§7 Payments and Escrow, §10 Operational requirements).
- Product workflow doc: `PROMPTS.md` at repo root — the canonical prompt patterns.
- Existing backend code: `backend/src/escrow/{escrow.controller.ts, escrow.service.ts, escrow.module.ts, dto/}`. Mock-mode methods will be removed in Slice F per ESCROW-158.
- Existing schema: `backend/prisma/schema.prisma:550-572` — `EscrowTransaction` (will get `milestones[]` relation), `:801-841` — `Conversation` (system messages added), `Collaboration:488-518` (existing).
- Webhook entry: `backend/src/webhooks/stripe.service.ts` — already verified for both platform + Connect signatures, just adds new event handlers.
- Stripe SDK: `backend/src/stripe/stripe.module.ts` exposes `STRIPE_CLIENT` token (Stripe Node SDK).
- Adjacent shipped specs (consumed via `contract.md`): `tasks/done/auth-flow/`, `tasks/done/profiles/`, `tasks/done/jobs-applications/`, `tasks/done/collaborations-polish/`, `tasks/done/chat/`, `tasks/done/reviews/`, `tasks/done/verification/`.
- Frontend touchpoints: `web/src/pages/EscrowPlaceholderPage.tsx` (replace body), `web/src/pages/CollaborationDetailPage.tsx` (extend summary card), `web/src/pages/AdminPage.tsx` (add escrow disputes + settings tabs).

## Move-to-done checklist

Before this folder moves to `tasks/done/`:

- [ ] All `ESCROW-NNN (Must)` requirements implemented and passing tests
- [ ] Slice A through F all merged to develop
- [ ] `tests-escrow/` is shipped with TEST-ESCROW-NNN coverage matrix at >90% green
- [ ] Manual smoke test passed (full flow: onboarding → fund → submit → approve → end contract; dispute flow: fund → submit → dispute → moderator resolves)
- [ ] `npm run lint` clean both backend and frontend
- [ ] `tsc --noEmit` clean both
- [ ] `vite build` clean
- [ ] Stripe-mock CI tests green
- [ ] No `console.log` of PaymentIntent payloads in shipped code
- [ ] All audit events from ESCROW-153 emitted in expected scenarios
- [ ] Webhook signature verification mandatory (CI fails if env missing)
- [ ] Idempotency keys present on every Stripe write call (manual review)
- [ ] Test mode locked: CI fails loud if `STRIPE_SECRET_KEY` starts with `sk_live_` in non-prod
- [ ] OpenAPI docs accessible at `/api/docs`
- [ ] PRs merged in slice order (A → F); each commit message follows `feat(escrow):` / `fix(escrow):` / `chore(escrow):` convention
- [ ] Followups documented in `followups.md` (open production bugs surfaced but not blocking ship)
- [ ] `status.md` updated: State `done`, Shipped date filled
