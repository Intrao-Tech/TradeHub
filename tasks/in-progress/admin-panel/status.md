# Status

- State: implementation shipped end-to-end on dev DB; awaiting manual
  smoke + the paired `tests-admin-panel/` session before moving to
  `tasks/done/`.
- Owner: Artem (PM); implementing engineer: Claude session
- Created: 2026-05-17
- Started: 2026-05-17
- Implementation finished (dev): 2026-05-24
- Last Updated: 2026-05-24
- Shipped: —

## Workflow

PM-directed two-phase plan: **(1) DB schema first → Vertabelo review → (2)
then API + business logic + UI**. Both phases now complete on the dev DB.
The Vertabelo working artifacts (`db-schema-proposal.sql`, `db-current.sql`)
were dev-only scratchpads and have been deleted — schema source-of-truth is
`backend/prisma/schema.prisma` + migrations under
`backend/prisma/migrations/`.

## Decisions log

> Headline kickoff decisions kept here; the full per-iteration decisions
> log lives in `spec.md` "Decisions Log" section.

- **2026-05-17 — kickoff (3 rounds of clarification, 12 questions).**
  - **Scope:** all-in single iteration. Dashboard (money / queues / funnel
    / live activity feed), full user search + drill-down, all manual money
    actions, reminders engine, support chat, impersonation, tags, notes,
    macros, approval engine.
  - **Staff roles:** 2 levels seed (ADMIN + STAFF). Schema future-proofed
    for multi-role via `staff_member_role` junction (so adding OPS /
    REVIEWER / SUPPORT later is a seed insert, not a migration).
  - **Comms with users:** through existing messaging infra as "TradeHub
    Support" identity. New `support_thread` table parallel to
    `conversation`, extending the existing `message` table (no new
    message table).
  - **Money mutations allowed:** retry failed Stripe transfer, force-
    release / force-refund escrow milestone, mark `payment` PAID/FAILED
    manually, manual verification level override. Each requires `reason`
    + writes `audit_log`.
  - **Approval engine:** rule-based, extensible conditions (amount
    threshold, target action type, document type, user-tag, staff-role).
    ADMIN/STAFF create rules through admin UI. One rule = one action;
    conditions ANDed.
  - **SLA / reminders:** configured via the same rules engine (separate
    `staff_sla_rule` table). Channel: in-platform `notification` only (no
    email/Slack in v1). Future: cron-batch generates SLA-breach
    notifications.
  - **Power features included:** impersonate-as-user (no new table — uses
    `audit_log`), internal tags (lookup + assignment), internal notes
    (append-only), macros for support-chat composer.
  - **Normalisation priority:** 3NF + lookup tables for repeated values +
    junction tables for many-to-many + typed value columns over JSONB
    where queryable. JSONB only for opaque action context payload
    (heterogeneous by action type, not queried in DB).
- **2026-05-24 — RBAC + dispute proposal flow folded into this iteration.**
  See spec.md "Decisions Log" for the per-change reasoning. Net schema
  delta vs the original kickoff plan: `permission`, `role_permission`,
  `escrow_dispute_proposal`, plus 3 new permission keys
  (`disputes.propose`, `disputes.escalate`, `support.initiate`).

## Files

- `spec.md` — full ADMIN-NNN requirement set (the contract).
- `db-design-notes.md` — normalisation decisions, trade-offs, ER overview,
  open questions for PM.
- ~~`db-schema-proposal.sql`~~ — deleted. Schema source-of-truth is
  `backend/prisma/schema.prisma` + migrations.
- ~~`db-current.sql`~~ — deleted (dev-only pg_dump snapshot).

## Move-to-done checklist

- [x] Schema approved by PM after Vertabelo review
- [x] Prisma schema additions (`schema.prisma`) written to match DDL
- [x] Migrations generated and run clean on dev DB (4 migration folders
      under `backend/prisma/migrations/`: `20260524130000_admin_panel`,
      `20260524180000_rbac_permissions`,
      `20260524210000_dispute_proposal_and_perms`,
      `20260524230000_fix_polymorphic_target_trigger`)
- [x] Seed updated to insert default staff roles / admin tags / action
      types / queue types / 31 permission keys
- [x] Backend API endpoints implemented per slice (dashboard / users /
      approvals / SLA / tags / notes / macros / impersonation / support
      chat / RBAC / dispute proposals / employer payments)
- [x] Frontend admin pages implemented per slice
- [x] Frontend type-check + backend build clean (Decisions Log
      2026-05-24)
- [ ] Manual smoke complete (PM iteration in progress)
- [ ] Unit + e2e tests green — separate session per PROMPTS.md (paired
      `tests-admin-panel/` folder to be created when PM finishes manual
      smoke)
