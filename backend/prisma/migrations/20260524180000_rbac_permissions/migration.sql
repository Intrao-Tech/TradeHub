-- ============================================================
-- RBAC: permission + role_permission tables + seed.
-- ADMIN role is implicitly all-permissions in the guard, but we
-- still write its rows here so admin UI can show the matrix.
-- ============================================================

CREATE TABLE "permission" (
    "id"          SERIAL                      NOT NULL,
    "key"         VARCHAR(80)                 NOT NULL,
    "category"    VARCHAR(40)                 NOT NULL,
    "description" VARCHAR(500)                NOT NULL,
    "is_system"   BOOLEAN     DEFAULT true    NOT NULL,
    "created_at"  TIMESTAMPTZ DEFAULT NOW()   NOT NULL,
    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "permission_key_key" ON "permission"("key");
CREATE INDEX "permission_category_idx" ON "permission"("category");

CREATE TABLE "role_permission" (
    "staff_role_id"       INTEGER                     NOT NULL,
    "permission_id"       INTEGER                     NOT NULL,
    "granted_at"          TIMESTAMPTZ DEFAULT NOW()   NOT NULL,
    "granted_by_staff_id" BIGINT                      NULL,
    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("staff_role_id", "permission_id"),
    CONSTRAINT "role_permission_staff_role_id_fkey"
        FOREIGN KEY ("staff_role_id") REFERENCES "staff_role"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "role_permission_permission_id_fkey"
        FOREIGN KEY ("permission_id") REFERENCES "permission"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "role_permission_permission_id_idx" ON "role_permission"("permission_id");

-- ─── Seed permissions ─────────────────────────────────────────
INSERT INTO "permission" ("key", "category", "description") VALUES
  -- Read access (gates tab visibility)
  ('dashboard.read',             'read',     'View admin dashboard counters and time-series.'),
  ('users.read',                 'read',     'Search marketplace users and view their detail page.'),
  ('staff.read',                 'read',     'View the staff member list.'),
  ('audit.read',                 'read',     'Browse the audit log.'),
  ('verification.read',          'read',     'View the document verification queue.'),
  ('escrow_disputes.read',       'read',     'View open escrow disputes.'),
  ('approvals.read',             'read',     'View pending and historical action approvals.'),
  ('support.read',               'read',     'View support threads.'),

  -- User mutations (1:1 with ADMIN_ACTIONS where applicable)
  ('users.suspend',              'users',    'Suspend / unsuspend marketplace accounts.'),
  ('users.delete',               'users',    'Hard-deactivate accounts (USER_DELETE action).'),
  ('users.set_verification',     'users',    'Override a client''s verification level.'),

  -- Payment / escrow mutations
  ('payments.mark_paid',         'payments', 'Force-mark a payment row PAID (reconciliation).'),
  ('payments.mark_failed',       'payments', 'Force-mark a payment row FAILED.'),
  ('payments.retry_transfer',    'payments', 'Re-queue a FAILED payout/refund for retry.'),
  ('escrow.force_release',       'escrow',   'Force-release a milestone outside the normal flow.'),
  ('escrow.force_refund',        'escrow',   'Force-refund a milestone outside the normal flow.'),
  ('escrow.force_cancel',        'escrow',   'Force-cancel a milestone.'),

  -- Verification + review queue
  ('verification.review',        'verification', 'Approve or reject documents in the review queue.'),

  -- Platform / catalog management
  ('platform.settings.write',    'platform', 'Update platform_setting (fees, referral %, etc.).'),
  ('specialisations.manage',     'catalog',  'Create / update / delete trade specialisations.'),
  ('tags.manage',                'catalog',  'Create / update / delete worker tags.'),
  ('plans.manage',               'catalog',  'Create / update / publish subscription plans.'),

  -- Operations resources
  ('approval_rules.manage',      'ops',      'Create / update / deactivate approval rules.'),
  ('sla_rules.manage',           'ops',      'Create / update / deactivate SLA rules.'),
  ('approvals.resolve',          'ops',      'Approve or reject pending action approvals.'),
  ('broadcast.send',             'ops',      'Send broadcast notifications to user audiences.'),

  -- Staff management
  ('staff.invite',               'staff',    'Invite a new staff member or promote an existing client.'),
  ('staff.role_change',          'staff',    'Change a staff member''s role.'),
  ('staff.deactivate',           'staff',    'Deactivate / reactivate a staff account.'),
  ('staff.reset_password',       'staff',    'Force-reset a staff member''s password.'),
  ('roles.manage',               'staff',    'Create / rename / delete custom roles and manage their permissions.'),

  -- Support
  ('support.reply',              'support',  'Send messages on support threads as TradeHub Support.'),
  ('support.assign',             'support',  'Assign or unassign the responsible staff on a support thread.');

-- ─── Grant ALL permissions to ADMIN role ─────────────────────
INSERT INTO "role_permission" ("staff_role_id", "permission_id")
SELECT r.id, p.id
FROM "staff_role" r
CROSS JOIN "permission" p
WHERE r.name = 'ADMIN';

-- ─── Grant a sensible default subset to STAFF role ───────────
-- STAFF can read most things, handle verification + support, but cannot
-- touch money, platform settings, staff management or rule definitions.
INSERT INTO "role_permission" ("staff_role_id", "permission_id")
SELECT r.id, p.id
FROM "staff_role" r
CROSS JOIN "permission" p
WHERE r.name = 'STAFF'
  AND p.key IN (
    'dashboard.read',
    'users.read',
    'staff.read',
    'audit.read',
    'verification.read',
    'escrow_disputes.read',
    'approvals.read',
    'support.read',
    'verification.review',
    'support.reply',
    'support.assign'
  );
