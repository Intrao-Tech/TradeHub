# Spec — Admin Panel

> Authoritative schema: `backend/prisma/schema.prisma` + migrations under
> `backend/prisma/migrations/`. The legacy `db-schema-proposal.sql` /
> `db-current.sql` working artifacts under this folder were dev-only
> scratchpads and have been removed — Prisma is the single source of truth.

## Summary

The single internal surface staff use to operate TradeHub: dashboard, user
search/drill-down, the manual money/state actions on escrow + payments, the
two-party approval engine for sensitive actions, an SLA reminder engine for
queue staleness, RBAC (permission catalog + role/permission junction), full
support chat, verification queue, staff management with on/off-duty, and a
catalog editor (specialisations / tags / subscription plans / platform fee
settings). Everything is audit-logged.

The product calls it "Admin"; the URL is `/admin` on the
`internal.tradehub.co.uk` subdomain (`internal.localhost:3000` in dev).
Requirements use stable IDs `ADMIN-NNN`. Decisions appended to a Decisions
Log at the bottom; new Open Questions raised during implementation go into
`Open Questions` (never the Decisions Log).

## Problem

Pre-admin-panel, staff had to operate the platform out of band: SQL
console for "find this user", Stripe dashboard for "refund this milestone",
no audit trail, no second-pair-of-eyes review on money mutations, no
visibility into what action is queued for approval, no consistent way to
talk to users as "TradeHub Support". The platform shipped escrow but had
no operational surface for the people who actually run the business.

This feature builds the operations layer end-to-end.

## Goals

- Land **one operational surface** under `/admin` on the staff subdomain —
  no Stripe dashboard / SQL console fall-throughs for routine work.
- Make every money mutation **gateable by a two-party approval rule** so
  the platform can enforce its own four-eyes policy on refunds, force-
  release, verification overrides, role grants, etc.
- Give every staff action an **audit row** (`audit_log`) with `who / what /
  why / when / target` and the JSON context payload that lets us replay
  state.
- Replace ad-hoc "is this user an admin" boolean checks with a real
  **permission catalog + role↔permission junction** so we can hand a
  support engineer `support.read + support.reply` without giving them
  `payments.write`.
- Ship a real **support chat** (TradeHub-Support identity) so users with
  problems get an in-platform thread instead of email.
- Ship an **SLA engine** that flags stale queue items (verification,
  support, approvals) via in-platform notifications.
- Ship a **catalog editor** (specialisations, tags, subscription plans,
  platform fee settings) so the PM can change vocabulary without a deploy.

## Non-goals

- Email / Slack outbound channels for SLA breaches — in-platform
  `notification` only in v1 (see ADMIN-061).
- Impersonation as a real session swap — v1 records the *intent* in
  `audit_log` only; actual JWT-swap impersonation is Phase 2.
- Macros / saved replies for support — schema present (`support_macro`) but
  composer UI is Phase 2.
- Email digest of pending approvals — in-platform notification only in v1.
- Bulk user actions (mass suspend, mass refund) — single-user / single-row
  in v1.

## User Flow

Staff hits `internal.tradehub.co.uk/admin`. Sidebar groups:

- **Personal** → Notifications (renders the same `NotificationsPage` body
  inline as a tab so the bell's "See all" lands on it rather than nav-
  away).
- **Overview** → Dashboard (live counters, money totals, queue depth).
- **People** → Users · Staff members · Roles & permissions.
- **Operations** → Approvals · Approval rules · SLA · Verification · Escrow
  disputes.
- **Support** → Support threads.
- **Catalog** → Specialisations · Tags · Subscription plans.
- **System** → Platform settings · Audit log.

A money mutation (e.g. force-refund escrow milestone) is requested from a
user/contract drilldown, hits the approval engine, lands in the Approvals
queue, a second staff approves/rejects, the engine executes the action,
writes `audit_log`, and notifies the requester.

## Requirements

### 1. Schema additions (Prisma + migrations)

- **ADMIN-001 (Must).** `staff_member` — shared-PK with `account` (1:1).
  Columns: `id` BigInt PK (= account.id), `display_name` (VarChar 120),
  `is_on_duty` (Boolean default false), `created_at`. Soft-tied to
  `account` so revoking staff = deleting the row, not the account.
- **ADMIN-002 (Must).** `staff_role` lookup. Seed values: `ADMIN`,
  `STAFF`. New roles can be added at runtime by an admin via UI without a
  migration (see ADMIN-040).
- **ADMIN-003 (Must).** `staff_member_role` junction — many-to-many between
  `staff_member` and `staff_role`. `granted_by` (→ staff_member, nullable
  to allow seed grants), `granted_at`. UNIQUE `(staff_member_id, role_id)`.
- **ADMIN-004 (Must).** `permission` — permission-key catalog. Columns:
  `id` Int PK, `key` (VarChar 80, UNIQUE — kebab-namespaced e.g.
  `users.read`, `payments.write`, `escrow_disputes.resolve`),
  `description` (VarChar 200), `created_at`. Seeded with the 31 keys
  enumerated in ADMIN-005.
- **ADMIN-005 (Must).** Seeded permission keys, grouped:
  - **read** (gate tab visibility): `dashboard.read`, `users.read`,
    `staff.read`, `approvals.read`, `support.read`, `verification.read`,
    `escrow_disputes.read`, `audit.read`.
  - **action** (1:1 with `staff_admin_action.action_type` where
    applicable): `payments.write`, `escrow.refund`, `escrow.force_release`,
    `users.suspend`, `users.unsuspend`, `users.delete`,
    `users.verification_level_override`, `staff.roles.grant`,
    `staff.roles.revoke`, `disputes.resolve`, `disputes.propose`,
    `disputes.escalate`.
  - **resource-management**: `approval_rules.manage`, `sla_rules.manage`,
    `specialisations.manage`, `tags.manage`, `plans.manage`,
    `platform.settings.write`, `roles.manage`.
  - **support**: `support.reply`, `support.assign`, `support.initiate`.
  - **verification**: `verification.review`.
- **ADMIN-006 (Must).** `role_permission` — many-to-many junction
  `staff_role` ↔ `permission`. Seed: `ADMIN` gets every permission (CROSS
  JOIN); `STAFF` gets the eight `*.read` perms + `verification.review` +
  `support.reply` + `support.assign`.
- **ADMIN-007 (Must).** `staff_admin_action_type` lookup — the catalog of
  action_types the approval engine can gate (`ESCROW_REFUND`,
  `ESCROW_FORCE_RELEASE`, `PAYMENT_MARK_PAID`, `PAYMENT_MARK_FAILED`,
  `USER_SUSPEND`, `USER_UNSUSPEND`, `USER_DELETE`,
  `USER_VERIFICATION_LEVEL_OVERRIDE`, `STAFF_ROLE_GRANT`,
  `STAFF_ROLE_REVOKE`, `DISPUTE_RESOLVE`). Stored as VarChar 60. Adding a
  new action type = seed insert.
- **ADMIN-008 (Must).** `staff_admin_action` — every requested action,
  whether auto-executed (no rule matched) or queued for approval. Columns:
  `id` BigInt PK, `action_type` (FK), `requested_by` (→ staff_member),
  `target_kind_id` + `target_id` (polymorphic discriminator: `account` /
  `client_profile` / `escrow_milestone` / `payment` / `escrow_dispute` /
  `staff_member`), `context` JSONB (action-specific payload — e.g.
  `{ "reason": "...", "amount_pence": 12345 }`), `status` (`AUTO_APPLIED`
  / `PENDING_APPROVAL` / `APPROVED` / `REJECTED` / `EXECUTED` / `FAILED`),
  `created_at`, `executed_at`, `failure_reason`. Polymorphic target is
  validated by trigger (see ADMIN-013).
- **ADMIN-009 (Must).** `staff_approval_rule` — `id`, `title` (VarChar
  120), `description` (VarChar 500 nullable), `action_type` (FK), how-many
  approvers (Int default 1), `is_active` (Boolean default true),
  `created_by` (→ staff_member), `created_at`, `updated_at`. UNIQUE
  `(action_type, title)`.
- **ADMIN-010 (Must).** `staff_approval_rule_condition` — `id`,
  `rule_id` (FK cascade), `kind_id` (FK `staff_approval_rule_condition_kind`
  lookup — `AMOUNT_GT`, `REQUESTING_STAFF_HAS_ROLE`,
  `DOCUMENT_TYPE_EQUALS`). Conditions on one rule are ANDed. Per-kind
  subtype tables hold the typed value (see ADMIN-011) — no JSONB for
  queryable rule values.
- **ADMIN-011 (Must).** Subtype tables for condition values:
  `staff_approval_rule_condition_amount_gt` (1:1 PK = condition.id, value
  Decimal 12,2); `staff_approval_rule_condition_requesting_staff_has_role`
  (1:1 PK = condition.id, role_id FK); `staff_approval_rule_condition_document_type_equals`
  (1:1 PK = condition.id, document_type VarChar 60). Adding a new
  condition kind = new subtype table + lookup row.
- **ADMIN-012 (Must).** `staff_approval` — one row per approver per
  pending action. `id`, `action_id` (FK cascade), `rule_id` (FK), `decided_by`
  (→ staff_member, nullable), `decision` (`PENDING` / `APPROVE` / `REJECT`),
  `decided_at`, `note` (VarChar 500 nullable). Partial UNIQUE
  `(rule_id, target_kind_id, target_id, requested_by_id) WHERE decision =
  'PENDING'` — blocks duplicate pending approvals from one requester (see
  ADMIN-072).
- **ADMIN-013 (Must).** PostgreSQL trigger
  `check_polymorphic_target_exists` runs `BEFORE INSERT` on every table
  with a `target_kind_id + target_id` polymorphic FK
  (`staff_admin_action`, others added later). Looks up the target row in
  the named table; raises if it doesn't exist. **Returns `NEW`** (not
  `NULL`) — `NULL` from a `BEFORE INSERT` trigger silently skips the
  insert, which once produced `null.id` crashes in the engine (see
  Decisions Log 2026-05-24).
- **ADMIN-014 (Must).** `staff_sla_queue` lookup — `VERIFICATION_PENDING`,
  `SUPPORT_OPEN`, `APPROVAL_PENDING`, `ESCROW_DISPUTE_OPEN`. Adding a
  queue = seed insert + cron handler.
- **ADMIN-015 (Must).** `staff_sla_rule` — `id`, `title`, `queue_id` (FK),
  `threshold_minutes` (Int, ≥ 1), `notify_role_id` (→ staff_role, nullable
  — null = all staff), `notify_assignee` (Boolean default false), `is_active`,
  `created_by`, `created_at`, `updated_at`. A cron sweep every 5 min walks
  active rules → finds queue items older than threshold → enqueues a
  `notification` per recipient (idempotent on `(rule_id, item_id)`).
- **ADMIN-016 (Must).** `audit_log` — append-only. `id`, `actor_staff_id`
  (→ staff_member, nullable for system rows), `action_type` (VarChar 60 —
  application-defined, includes both `staff_admin_action.action_type` and
  free-form events like `IMPERSONATE_START`), `target_kind_id` +
  `target_id` (polymorphic, same trigger as ADMIN-013), `result`
  (`SUCCESS` / `FAILURE`), `context` JSONB, `created_at`. No update / no
  delete in service code; PK index only.
- **ADMIN-017 (Must).** `support_thread` — `id`, `client_profile_id` (FK
  — the user), `assignee_staff_id` (FK nullable), `subject` (VarChar 200),
  `status` (`OPEN` / `CLOSED`), `last_message_at`, `created_at`. Extends
  the existing `message` table (no new message table) — a `support_thread`
  is referenced by `message.support_thread_id` (added).
- **ADMIN-018 (Must).** `support_macro` — schema present, UI Phase 2.
  Columns: `id`, `title`, `body` (Text), `created_by` (→ staff_member),
  `created_at`.
- **ADMIN-019 (Must).** `escrow_dispute_proposal` — see ESCROW spec
  ESCROW-090 series (the data table lives with escrow; the staff
  interaction layer is here).

### 2. RBAC enforcement (backend)

- **ADMIN-030 (Must).** Decorator `@RequirePermissions('users.read', ...)`
  (variadic) on controller methods. Combined with `PermissionsGuard` it
  short-circuits on **ADMIN role** (admin bypasses every perm check so
  admins can't lock themselves out by editing their own role) and
  otherwise checks every listed key against the JWT-resolved permission
  set.
- **ADMIN-031 (Must).** `JwtStrategy.validate()` re-resolves both the
  `account` row AND its current `permissions` set on **every request** —
  not from the token payload. A role/permission revoke takes effect on
  the user's next request without forcing re-login.
- **ADMIN-032 (Must).** Mutation endpoints use `@RequirePermissions(...)`.
  Read-only list endpoints **may** keep `@Roles('STAFF', 'ADMIN')` as a
  cheaper guard since their granular permission is "is staff at all".
- **ADMIN-033 (Should).** Permission keys are referenced as string
  literals at decoration sites — no enum import — so a typo at the call
  site surfaces as a 403 in dev (caught by the seed-vs-grep CI check, to
  be added in tests phase).
- **ADMIN-034 (Must).** `GET /account/me` returns
  `{ account, profiles, member_roles[], permissions[] }`. The frontend
  `useAccountMe` hook caches this at module level and exposes
  `hasPermission(key)` plus `isAdmin` (true iff the account has the
  `ADMIN` role).

### 3. Staff management

- **ADMIN-040 (Must).** `GET /staff` — list all staff with their roles
  (gated `staff.read`). `POST /staff` — create a new `staff_member` from
  an existing `account.email` (gated `staff.write`). `PATCH /staff/:id` —
  update display name / on-duty (`staff.write`). `DELETE /staff/:id` —
  revoke staff (`staff.write`). All write paths audit-logged.
- **ADMIN-041 (Must).** `POST /staff/:id/roles` + `DELETE /staff/:id/roles/:roleId`
  — grant/revoke a role on a staff member. Gated `staff.roles.grant` /
  `staff.roles.revoke`. Goes through the approval engine
  (action_type `STAFF_ROLE_GRANT` / `STAFF_ROLE_REVOKE`).
- **ADMIN-042 (Must).** `GET /admin/roles` + `POST /admin/roles` + `PATCH
  /admin/roles/:id` + `DELETE /admin/roles/:id` — full CRUD on
  `staff_role` gated `roles.manage`. Can't delete a role that has staff
  attached (FK Restrict).
- **ADMIN-043 (Must).** `GET /admin/permissions` (list catalog),
  `PATCH /admin/roles/:id/permissions` (replace the role's permission set
  with the given key list). Gated `roles.manage`. Audit-logged.
- **ADMIN-044 (Must).** `POST /staff/me/duty` toggles
  `is_on_duty`. Reflected in the AppShell role chip (green dot = on
  duty, grey = off). Off-duty does **not** revoke permissions — it's a
  display signal so support/approval routing can prefer on-duty staff.
- **ADMIN-045 (Must).** **Self-action protection.** Service-layer
  guard refuses any action whose `action_type` is in
  `SELF_TARGET_BLOCKED` and whose target resolves to the same
  `staff_member` / `account` as the requester. Set:
  `USER_SUSPEND`, `USER_UNSUSPEND`, `USER_DELETE`,
  `USER_VERIFICATION_LEVEL_OVERRIDE`, `STAFF_ROLE_GRANT`,
  `STAFF_ROLE_REVOKE`. Returns 409 `SELF_TARGET_BLOCKED` with a
  human-readable message. Frontend disables the corresponding buttons
  on the user-detail page when `targetUser.id === me.id`.

### 4. Approval engine

- **ADMIN-050 (Must).** Service `ApprovalEngineService.requestAction(...)`
  is the single entry point for every gateable mutation. Walks active
  rules for the action_type, ANDs the conditions, and either:
  - matches no rule → executes immediately (`status='AUTO_APPLIED'`,
    audit-logged), or
  - matches ≥1 rule → creates `staff_admin_action` (`status='PENDING_APPROVAL'`)
    plus one `staff_approval(decision='PENDING')` row per rule.
- **ADMIN-051 (Must).** `POST /admin/approvals/:id/approve` +
  `/reject` — gated `approvals.read`. Body `{ note?: string }`. Updates
  the caller's pending row. When all pending rows on the action are
  resolved: all `APPROVE` → engine executes the action and writes
  `audit_log`; any `REJECT` → engine sets action `status='REJECTED'` and
  notifies the requester.
- **ADMIN-052 (Must).** `GET /admin/approvals?status=...` returns the
  queue with target context joined for the UI (target user display name,
  milestone title + amount, dispute summary, etc.) — no N+1 fetches in
  the frontend.
- **ADMIN-053 (Must).** Duplicate-approval block. Before creating a new
  pending approval, engine refuses with `ConflictException
  'APPROVAL_ALREADY_PENDING'` if a `(rule, target_kind, target_id,
  requested_by)` row already exists with `decision='PENDING'`. Enforced
  both at app layer and DB (partial UNIQUE, ADMIN-012).
- **ADMIN-054 (Must).** Self-approve block. A staff member whose own
  request is queued cannot approve/reject it — endpoint returns 403
  `SELF_APPROVE_BLOCKED`. Frontend disables the Approve/Reject buttons
  on a row whose `requested_by_id === me.id`.
- **ADMIN-055 (Must).** Notify-the-requester on decision. When the last
  pending row is resolved, engine creates a `notification` for the
  original requester with the outcome and any rejection note.
- **ADMIN-056 (Must).** Pending-visibility on user detail. The user-detail
  page surfaces a "Pending actions on this user" panel (driven by
  `GET /admin/approvals?target_kind=account&target_id=X&status=PENDING_APPROVAL`)
  so the second staff has full context before approving.

### 5. Approval rules

- **ADMIN-060 (Must).** `GET /admin/approval-rules` + `POST` + `PATCH
  /:id` + `DELETE /:id`. Gated `approvals.read` for list/read; mutation
  is admin-only in v1 via `@RequirePermissions('approval_rules.manage')`.
- **ADMIN-061 (Must).** Condition kinds available per action_type are
  filtered by a server-side `ACTION_COMPATIBLE_CONDITIONS` map (e.g.
  `AMOUNT_GT` is meaningful only for money-moving action_types) — both
  the create and update paths reject invalid combinations with 422
  `INCOMPATIBLE_CONDITION`. The UI's condition picker is hydrated from
  the same map so users can't pick an invalid combination.
- **ADMIN-062 (Must).** `PATCH` accepts a full or partial replacement of
  the rule's `conditions[]` with the same kind structure as create. The
  subtype-table value (e.g. amount, role_id, document_type) is editable
  inline; the condition kind itself is not (changing kind = delete +
  recreate so the subtype row stays consistent). UI: single Cancel
  button (row-level toggle, not header / form-bottom dupes).

### 6. SLA engine

- **ADMIN-070 (Must).** `GET /admin/sla-rules` + `POST` + `PATCH /:id` +
  `DELETE /:id`. Gated `dashboard.read` for read; mutation gated
  `sla_rules.manage`.
- **ADMIN-071 (Must).** Cron `SlaEngineService.sweep()` runs every 5 min.
  For each active rule: walks the matching queue (per `queue_id`), finds
  items older than `threshold_minutes`, enqueues a `notification` for
  each recipient under the rule's recipient policy:
  `notify_role_id` → all staff with that role; `notify_assignee` → the
  item's current assignee (if any). De-duplicated via a `(rule_id,
  item_id)` row in an idempotency table so each breach pings once.
- **ADMIN-072 (Should).** Form fields explain who gets notified per
  queue (e.g. for VERIFICATION_PENDING: "the document's assigned
  reviewer, or all staff with `verification.review` if no role gate").
  Phase 2: per-staff opt-out for verbose queues.

### 7. Support chat

- **ADMIN-080 (Must).** `GET /admin/support` (gated `support.read`)
  returns paginated threads with last-message preview + assignee. `POST
  /admin/support/:id/messages` (gated `support.reply`) sends a message
  as the TradeHub-Support identity (display name "TradeHub Support" — the
  sender on the message row is the actual staff member for audit, but
  the user-facing label is system-wide). `PATCH /admin/support/:id/assign`
  (gated `support.assign`) sets `assignee_staff_id`; UI list refreshes
  immediately on assign without a full reload.
- **ADMIN-081 (Must).** `POST /admin/users/:id/message` (gated
  `support.initiate`) — opens (or reuses) a `support_thread` from the
  user-detail page and sends an initial message. The staff member is the
  initiator; subsequent replies use ADMIN-080.
- **ADMIN-082 (Must).** Marketplace surface — `/support` (a user-facing
  route on `app.tradehub.co.uk`) lists the user's own threads and lets
  them open a new one. Reuses the chat composer / message list from the
  existing messaging feature; no duplicate UI.
- **ADMIN-083 (Should).** Macros (`support_macro`) — schema exists; the
  composer's "insert macro" picker is Phase 2.

### 8. Verification queue (re-use of existing module)

- **ADMIN-090 (Must).** The verification module (see `tasks/done/verification/spec.md`)
  is reused — admin surface is a thin list/filter/assign UI on top.
  Permission gating: `verification.read` to see the queue,
  `verification.review` to act on an item.
- **ADMIN-091 (Should).** "Default assign by role" — when a staff member
  opens an unassigned document the queue auto-assigns to them if they
  have `verification.review`.

### 9. Escrow disputes

- **ADMIN-100 (Must).** The admin Escrow disputes tab reuses the escrow
  spec's data model (`escrow_dispute`) and the new dispute proposal flow
  (`escrow_dispute_proposal` — see ESCROW spec ESCROW-090+). Gated
  `escrow_disputes.read`; proposing/deciding requires
  `disputes.propose` / `disputes.resolve`; escalation requires
  `disputes.escalate`.

### 10. Catalog editor

- **ADMIN-110 (Must).** Specialisations CRUD (gated
  `specialisations.manage`). P2002 unique-constraint hits return 409 with
  a friendly message (no Prisma error leakage).
- **ADMIN-111 (Must).** Tags CRUD (gated `tags.manage`). Same P2002
  handling. UI mirrors Specialisations.
- **ADMIN-112 (Must).** Subscription plans CRUD (gated `plans.manage`).
  Rendered as a table (not a JSON dump). Same P2002 handling.
- **ADMIN-113 (Must).** `DELETE` endpoints return 204 with no body —
  controller decorated `@HttpCode(HttpStatus.NO_CONTENT)` so an empty
  body doesn't crash the response serialiser.
- **ADMIN-114 (Must).** Platform settings — `GET /escrow/admin/settings/platform`
  (`platform.settings.write` gates visibility, since the read value is
  not sensitive but exposing the editor implies edit perm) + `PATCH`.
  Throttled (60 / hour). Audit-logged.

### 11. Audit + plans rendering

- **ADMIN-120 (Must).** Audit log tab renders rows as a sortable table
  (timestamp · actor · action_type · target · result · context). Context
  JSONB collapses into an expandable detail row, not a wall of JSON.
- **ADMIN-121 (Must).** Subscription plans tab renders rows as a table
  (same direction as audit — not a JSON dump).
- **ADMIN-122 (Should).** `audit.read` gates Audit log tab visibility.

### 12. Frontend chrome

- **ADMIN-130 (Must).** Admin sidebar groups tabs into named sections
  (`Personal`, `Overview`, `People`, `Operations`, `Support`, `Catalog`,
  `System`). Sections / tabs without permission are hidden (not just
  disabled). Implemented in [AdminPage.tsx](web/src/pages/AdminPage.tsx).
- **ADMIN-131 (Must).** Notifications live as a regular inline tab in the
  `Personal` section (no separate route navigation), so the bell's "See
  all notifications" link can deep-link to `/admin?tab=notifications` on
  the staff host. The marketplace bell still goes to `/notifications`.
  Lazy-imported via the same chunk as the standalone route — no double-
  bundling.
- **ADMIN-132 (Must).** Role chip next to the TradeHub logo shows the
  staff member's current role with a colored dot (green = on-duty, grey
  = off-duty). Hidden for non-staff. Clicking opens the user menu where
  on/off duty toggles `staff_member.is_on_duty` via `/staff/me/duty`.
- **ADMIN-133 (Must).** Staff app hides the marketplace footer + the
  user-facing Profile menu entry (`hideFooter` prop on `AppShell`).
- **ADMIN-134 (Must).** "Approval rules" + "SLA rules" forms — Edit and
  Create share a single inline form below the row being edited. One
  Cancel button only (row-level toggle). All fields editable on edit,
  including condition values (not just title/description).
- **ADMIN-135 (Should).** Dashboard cards link straight to the underlying
  filtered list (clicking "12 pending approvals" lands on Approvals tab
  with `status=PENDING_APPROVAL` preselected).

## Edge Cases

- **A. Self-grant of `ADMIN` role.** Blocked by ADMIN-045 — the engine
  refuses STAFF_ROLE_GRANT where target = requester. A second admin must
  grant it.
- **B. Admin removes own permission via `roles.manage`.** Not blocked
  — admins bypass perm checks (ADMIN-030), so they retain full control.
  An admin who removes the ADMIN role from themselves DOES lock
  themselves out; this is acknowledged and audit-logged (see Decisions
  Log).
- **C. Race: two staff approve the same pending row in parallel.** Only
  one wins (`staff_approval.decided_at` is set inside a Prisma
  transaction with row-level lock). The second sees 409
  `ALREADY_DECIDED`.
- **D. Race: same staff submits the same requestAction twice (double-
  click).** Blocked by partial UNIQUE on `staff_approval` (ADMIN-012) —
  second insert raises P2002 which the engine maps to
  `ConflictException 'APPROVAL_ALREADY_PENDING'`.
- **E. Stripe refund of a milestone whose contract uses separate
  transfers (not Connect destination charges).** The
  `refund_application_fee` parameter is **not** passed — it's only valid
  for Connect-application-created charges (see ESCROW spec ESCROW-095).
- **F. Dispute filed by mistake.** Filer can cancel an OPEN dispute via
  ESCROW spec ESCROW-094.
- **G. Off-duty staff still appears in lookup.** On-duty is a routing
  hint, not an authorisation. Off-duty staff can still take any action
  their permissions allow.
- **H. Empty admin perms.** A staff member with zero admin perms still
  sees Notifications in the sidebar; the main panel defaults to the
  Notifications tab as the landing view. (Prior behaviour was a full-
  page "you have no admin permissions" empty state.)

## Acceptance Criteria

1. `admin@tradehub.dev` logs in on `internal.localhost:3000`, lands on
   `/admin`, sees every sidebar section.
2. Creates a new `STAFF`-level account (`staff.create` flow), grants it
   only `support.read + support.reply`, the new staff sees only Support
   threads in the sidebar.
3. As admin, force-refunds a `FUNDED` milestone whose amount > rule
   threshold → action lands in Approvals as `PENDING_APPROVAL`.
4. Same admin tries to approve own request → 403 `SELF_APPROVE_BLOCKED`,
   button disabled in UI.
5. Second admin approves → milestone refunds via Stripe, audit row
   written, requester receives notification, money returns to employer
   minus zero Stripe fees (separate-transfer flow).
6. Files a dispute as worker → admin proposes 70/30 split → both parties
   accept in their respective UIs → milestone funds split per the
   accepted proposal, audit row chains action → proposal → execution.
7. Verification queue: worker uploads a passport → assigned auto to a
   staff with `verification.review` who opens it → approves → user's
   verification_level updates → milestone unlocks for fund.
8. SLA: leave a verification document unreviewed for the configured
   threshold → cron sweep enqueues a notification to the assignee +
   admins → bell badge increments.
9. As staff, click bell → "See all notifications" → lands inline at
   `/admin?tab=notifications`, marks all read, badge goes to zero.
10. Toggle off-duty → role chip dot goes grey; toggle on → green; perms
    unchanged either way.

## Open Questions

- **OQ-A.** Should the engine retry a transient EXECUTION_FAILED action
  automatically (e.g. Stripe 5xx) or always leave it for manual retry?
  Currently manual — a failed execution writes `status='FAILED'` +
  `failure_reason` and surfaces in the Approvals tab as a "retry" row.
- **OQ-B.** Macros (`support_macro`) — UI design (compose-side picker
  vs. side-panel insert)?
- **OQ-C.** Per-staff notification preferences (mute SLA verbose
  queues) — schema design when we actually need it.

## Decisions Log

- **2026-05-17 — kickoff (3 rounds of clarification, 12 questions).** See
  status.md "Decisions log" section for the full headline list.
- **2026-05-24 — RBAC ships in same iteration as the rest of admin.**
  Original plan had two enum roles only (ADMIN/STAFF); user wanted full
  permission catalog + role-permission junction so they can create
  arbitrary roles and assign perms in UI. Added 28 permission keys,
  bumped to 31 with dispute-proposal additions.
- **2026-05-24 — ADMIN bypasses every permission check.** Otherwise an
  admin who accidentally removes a perm from the ADMIN role locks every
  admin out. Acknowledged risk: an admin who removes the ADMIN role
  from themselves DOES lock themselves out; recovery is a DB-level
  re-grant.
- **2026-05-24 — Polymorphic FK trigger must `RETURN NEW`, not
  `RETURN NULL`.** A `NULL` return from a `BEFORE INSERT` trigger
  silently skips the row, which surfaced as a null.id crash in the
  approval engine. Fixed in migration `20260524230000`.
- **2026-05-24 — Two-party dispute resolution replaces one-shot admin
  resolve.** Staff proposes, worker AND employer must each `ACCEPT`,
  then engine executes via existing `escrow.resolveDispute`. If either
  rejects, staff can re-propose or escalate to
  `ARBITRATION_PENDING`. See ESCROW spec ESCROW-090 series for the data
  model.
- **2026-05-24 — Self-action protection at service layer.** Front-end
  button disabling is UX, not security. The server refuses
  `USER_SUSPEND/UNSUSPEND/DELETE`, `USER_VERIFICATION_LEVEL_OVERRIDE`,
  `STAFF_ROLE_GRANT/REVOKE` when target = requester.
- **2026-05-24 — Duplicate pending approvals blocked + requester
  notified on decision.** Partial UNIQUE on
  `(rule, target_kind, target_id, requested_by) WHERE decision='PENDING'`
  enforces idempotency at the DB; engine surfaces it as 409
  `APPROVAL_ALREADY_PENDING`. On decision, the original requester gets
  an in-platform notification with the outcome + rejection note.
- **2026-05-24 — Stripe refund drops `refund_application_fee`.** Our
  flow uses regular PaymentIntent + separate transfers, not Connect
  destination charges. The parameter is invalid in that flow and
  triggered a runtime crash; removed from the refund call.
- **2026-05-24 — Approval rule edits include condition VALUES.** Earlier
  iteration allowed editing only title/description because the subtype
  rows were untouched. Update path now allows updating the subtype value
  for each condition while keeping the kind immutable (kind change = delete + recreate).
- **2026-05-24 — Notifications is an inline admin tab, not a separate
  route.** Initial design used `<NavLink>` to navigate away; user wanted
  it to behave like every other tab so the bell's "See all" lands
  inline. The bell deep-links to `/admin?tab=notifications` on the staff
  host and to `/notifications` on the marketplace.
- **2026-05-24 — `/wallet` → `/payments` rename.** Both worker and
  employer surfaces live at `/payments`. Worker view keeps Stripe
  Connect + ledger; employer view is a new payments table + open
  disputes summary (see ESCROW spec ESCROW-130). `/wallet` retained as
  back-compat redirect to `/payments` (old Stripe Connect return URLs).
