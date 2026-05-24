-- ==========================================================================
-- ADMIN PANEL MIGRATION
-- ==========================================================================
-- Adds: lookups, junctions, review (parent+workflow), approval engine,
-- SLA engine, support collaboration. Modifies: staff_member (drop staff_role),
-- document (split into reviewable_item parent + review_item workflow),
-- escrow_dispute (+assigned), message (+support_collaboration_id, sender→account, XOR CHECK).
--
-- Data migrations preserve existing staff_role assignments and existing
-- document review state. Triggers enforce subtype consistency + polymorphic
-- target integrity.
-- ==========================================================================


-- ##########################################################################
-- ##  PHASE A — Create lookup tables                                       ##
-- ##########################################################################

CREATE TABLE "staff_role" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "description" VARCHAR(500),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "staff_role_name_key" ON "staff_role"("name");

CREATE TABLE "admin_action_type" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "is_money" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_action_type_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_action_type_name_key" ON "admin_action_type"("name");
CREATE INDEX "admin_action_type_category_is_active_idx" ON "admin_action_type"("category", "is_active");

CREATE TABLE "admin_target_kind" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_target_kind_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_target_kind_name_key" ON "admin_target_kind"("name");

CREATE TABLE "admin_queue_type" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_queue_type_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_queue_type_name_key" ON "admin_queue_type"("name");

CREATE TABLE "approval_condition_type" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "value_subtype" VARCHAR(40) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_condition_type_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "approval_condition_type_name_key" ON "approval_condition_type"("name");


-- ##########################################################################
-- ##  PHASE B — Seed lookups (needed by backfills + FKs below)             ##
-- ##########################################################################

INSERT INTO "staff_role" ("name", "description", "is_system") VALUES
  ('ADMIN', 'Full access including money mutations, platform settings, staff management.', true),
  ('STAFF', 'Verifications, disputes, reviews moderation, support chat. No money or settings.', true);

INSERT INTO "admin_target_kind" ("name", "description") VALUES
  ('PAYMENT',           'Row in `payment` ledger.'),
  ('CLIENT_PROFILE',    'A client (worker or employer profile owner).'),
  ('ESCROW_MILESTONE',  'A milestone in `escrow_milestone`.'),
  ('DOCUMENT',          'Uploaded verification document in `document`.'),
  ('ESCROW_DISPUTE',    'A dispute row in `escrow_dispute`.'),
  ('CONTRACT',          'Row in `contract`.'),
  ('PLATFORM_SETTING',  'Row in `platform_setting`.');

INSERT INTO "admin_queue_type" ("name", "description") VALUES
  ('DOCUMENT_PENDING',           'Verification documents awaiting staff review.'),
  ('DISPUTE_OPEN',               'Disputes in OPEN state, awaiting first staff response.'),
  ('DISPUTE_RESPONDED',          'Disputes in RESPONDED/MEDIATION, awaiting resolution.'),
  ('PAYMENT_FAILED',             'Payment rows with status=FAILED awaiting retry decision.'),
  ('PAYMENT_TRANSFER_PENDING',   'PENDING worker payouts / referral commissions not yet swept.'),
  ('SUPPORT_THREAD_UNANSWERED',  'Support thread with last message from user > threshold.'),
  ('APPROVAL_REQUIRED',          'staff_action_approval rows in PENDING state.');

INSERT INTO "approval_condition_type" ("name", "value_subtype", "description") VALUES
  ('AMOUNT_GT',                 'AMOUNT',   'Action amount (context.amount_pence) must exceed threshold.'),
  ('REQUESTING_STAFF_HAS_ROLE', 'ROLE',     'Requesting staff must have a specific role.'),
  ('DOCUMENT_TYPE_EQUALS',      'DOC_TYPE', 'Target document must be of specific doc_type (only when target_kind=DOCUMENT).');

INSERT INTO "admin_action_type" ("name", "category", "description", "is_money") VALUES
  ('PAYMENT_MARK_PAID',           'PAYMENT',      'Set payment.status = PAID manually (out-of-band settlement).',                true),
  ('PAYMENT_MARK_FAILED',         'PAYMENT',      'Set payment.status = FAILED manually.',                                       false),
  ('PAYMENT_RETRY_TRANSFER',      'PAYMENT',      'Re-attempt the Stripe transfer for a failed/pending payout.',                 true),
  ('ESCROW_FORCE_RELEASE',        'ESCROW',       'Release a milestone to worker bypassing employer approval.',                  true),
  ('ESCROW_FORCE_REFUND',         'ESCROW',       'Refund a funded milestone to employer bypassing dispute flow.',               true),
  ('ESCROW_FORCE_CANCEL',         'ESCROW',       'Cancel a milestone in an unusual state.',                                     false),
  ('VERIFICATION_DOC_APPROVE',    'VERIFICATION', 'Approve an uploaded verification document.',                                  false),
  ('VERIFICATION_DOC_REJECT',     'VERIFICATION', 'Reject an uploaded verification document with reason.',                       false),
  ('VERIFICATION_LEVEL_OVERRIDE', 'VERIFICATION', 'Set client_profile.verification_level directly bypassing normal workflow.',   false),
  ('USER_SUSPEND',                'USER',         'Suspend an account (block login).',                                           false),
  ('USER_UNSUSPEND',              'USER',         'Lift a suspension.',                                                          false),
  ('USER_DELETE',                 'USER',         'Hard-delete an account (cascades per FK rules).',                             false),
  ('PLATFORM_SETTING_UPDATE',     'PLATFORM',     'Update a row in platform_setting.',                                           false),
  ('STAFF_INVITE',                'STAFF',        'Invite a new staff member (creates account + role assignment).',              false),
  ('STAFF_ROLE_GRANT',            'STAFF',        'Add a role to a staff member.',                                               false),
  ('STAFF_ROLE_REVOKE',           'STAFF',        'Remove a role from a staff member.',                                          false),
  ('BROADCAST_MESSAGE',           'COMMS',        'Send a notification to a subset of users (future).',                          false);


-- ##########################################################################
-- ##  PHASE C — staff_member_role junction + backfill + drop staff_role    ##
-- ##########################################################################

CREATE TABLE "staff_member_role" (
    "staff_member_id" BIGINT NOT NULL,
    "staff_role_id" INTEGER NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by_staff_id" BIGINT,
    CONSTRAINT "staff_member_role_pkey" PRIMARY KEY ("staff_member_id","staff_role_id")
);
CREATE INDEX "staff_member_role_staff_role_id_idx" ON "staff_member_role"("staff_role_id");

-- Backfill: copy existing staff_role string → junction row
INSERT INTO "staff_member_role" ("staff_member_id", "staff_role_id", "granted_at")
SELECT sm."id", sr."id", sm."created_at"
FROM "staff_member" sm
JOIN "staff_role" sr ON sr."name" = sm."staff_role";

-- Drop legacy column
ALTER TABLE "staff_member" DROP COLUMN "staff_role";

-- FKs (after backfill)
ALTER TABLE "staff_member_role" ADD CONSTRAINT "staff_member_role_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_member_role" ADD CONSTRAINT "staff_member_role_staff_role_id_fkey" FOREIGN KEY ("staff_role_id") REFERENCES "staff_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_member_role" ADD CONSTRAINT "staff_member_role_granted_by_staff_id_fkey" FOREIGN KEY ("granted_by_staff_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ##########################################################################
-- ##  PHASE D — reviewable_item + review_item + document data migration    ##
-- ##########################################################################

CREATE TABLE "reviewable_item" (
    "id" BIGSERIAL NOT NULL,
    "client_profile_id" BIGINT NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviewable_item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_item" (
    "id" BIGSERIAL NOT NULL,
    "reviewable_item_id" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "assigned_to_staff_id" BIGINT,
    "reviewed_by_staff_id" BIGINT,
    "reviewed_at" TIMESTAMPTZ,
    "rejection_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "review_item_pkey" PRIMARY KEY ("id")
);

-- Backfill: each existing document becomes a reviewable_item row with same id
INSERT INTO "reviewable_item" ("id", "client_profile_id", "kind", "created_at")
SELECT "id", "client_profile_id", 'DOCUMENT', "created_at"
FROM "document";

-- Bump reviewable_item sequence past existing ids (so new INSERTs don't collide)
SELECT setval('reviewable_item_id_seq', COALESCE((SELECT MAX("id") FROM "reviewable_item"), 1));

-- For documents that were touched (assigned/reviewed/non-PENDING), preserve as review_item
INSERT INTO "review_item" ("reviewable_item_id", "status", "assigned_to_staff_id", "reviewed_by_staff_id", "reviewed_at", "rejection_reason", "created_at", "updated_at")
SELECT
  "id",
  "status",
  "assigned_to",
  "reviewed_by",
  "reviewed_at",
  "rejection_reason",
  "created_at",
  COALESCE("reviewed_at", "created_at")
FROM "document"
WHERE "status" != 'PENDING' OR "assigned_to" IS NOT NULL OR "reviewed_by" IS NOT NULL;

-- Drop old document state — review fields moved out
ALTER TABLE "document" DROP CONSTRAINT "document_assigned_to_fkey";
ALTER TABLE "document" DROP CONSTRAINT "document_client_profile_id_fkey";
ALTER TABLE "document" DROP CONSTRAINT "document_reviewed_by_fkey";
DROP INDEX "document_assigned_to_status_idx";
DROP INDEX "document_client_profile_id_status_idx";
DROP INDEX "document_status_created_at_idx";

ALTER TABLE "document"
  DROP COLUMN "assigned_to",
  DROP COLUMN "client_profile_id",
  DROP COLUMN "created_at",
  DROP COLUMN "rejection_reason",
  DROP COLUMN "reviewed_at",
  DROP COLUMN "reviewed_by",
  DROP COLUMN "status",
  ALTER COLUMN "id" DROP DEFAULT;
DROP SEQUENCE "document_id_seq";

-- Indexes for review tables
CREATE INDEX "reviewable_item_kind_idx" ON "reviewable_item"("kind");
CREATE INDEX "reviewable_item_client_profile_id_idx" ON "reviewable_item"("client_profile_id");
CREATE INDEX "reviewable_item_client_profile_id_kind_idx" ON "reviewable_item"("client_profile_id", "kind");

CREATE INDEX "review_item_reviewable_item_id_created_at_idx" ON "review_item"("reviewable_item_id", "created_at" DESC);
-- Partial UNIQUE: max one PENDING review per reviewable_item (prevents parallel reviews)
CREATE UNIQUE INDEX "review_item_one_pending_per_reviewable" ON "review_item"("reviewable_item_id") WHERE "status" = 'PENDING';
CREATE INDEX "review_item_status_created_at_idx" ON "review_item"("status", "created_at");
CREATE INDEX "review_item_assigned_to_staff_id_status_idx" ON "review_item"("assigned_to_staff_id", "status");
CREATE INDEX "review_item_reviewed_by_staff_id_idx" ON "review_item"("reviewed_by_staff_id") WHERE "reviewed_by_staff_id" IS NOT NULL;

CREATE INDEX "document_doc_type_idx" ON "document"("doc_type");

-- FKs (after data migration)
ALTER TABLE "reviewable_item" ADD CONSTRAINT "reviewable_item_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_reviewable_item_id_fkey" FOREIGN KEY ("reviewable_item_id") REFERENCES "reviewable_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_assigned_to_staff_id_fkey" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_reviewed_by_staff_id_fkey" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document" ADD CONSTRAINT "document_id_fkey" FOREIGN KEY ("id") REFERENCES "reviewable_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ##########################################################################
-- ##  PHASE E — Approval engine tables                                     ##
-- ##########################################################################

CREATE TABLE "staff_approval_rule" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "target_action_type_id" INTEGER NOT NULL,
    "required_approver_role_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_staff_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "staff_approval_rule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "staff_approval_rule_target_action_type_id_is_active_idx" ON "staff_approval_rule"("target_action_type_id", "is_active");

CREATE TABLE "staff_approval_rule_condition" (
    "id" BIGSERIAL NOT NULL,
    "rule_id" BIGINT NOT NULL,
    "condition_type_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_approval_rule_condition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "staff_approval_rule_condition_rule_id_idx" ON "staff_approval_rule_condition"("rule_id");
CREATE UNIQUE INDEX "staff_approval_rule_condition_rule_id_condition_type_id_key" ON "staff_approval_rule_condition"("rule_id", "condition_type_id");

CREATE TABLE "approval_condition_amount" (
    "id" BIGINT NOT NULL,
    "threshold_pence" BIGINT NOT NULL,
    CONSTRAINT "approval_condition_amount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_condition_role" (
    "id" BIGINT NOT NULL,
    "staff_role_id" INTEGER NOT NULL,
    CONSTRAINT "approval_condition_role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_condition_doc_type" (
    "id" BIGINT NOT NULL,
    "document_type" VARCHAR(40) NOT NULL,
    CONSTRAINT "approval_condition_doc_type_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_action_approval" (
    "id" BIGSERIAL NOT NULL,
    "rule_id" BIGINT NOT NULL,
    "target_kind_id" INTEGER NOT NULL,
    "target_id" BIGINT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "requested_by_staff_id" BIGINT NOT NULL,
    "requested_reason" VARCHAR(2000),
    "approved_by_staff_id" BIGINT,
    "approver_reason" VARCHAR(2000),
    "execution_audit_id" BIGINT,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    CONSTRAINT "staff_action_approval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "staff_action_approval_status_requested_at_idx" ON "staff_action_approval"("status", "requested_at");
CREATE INDEX "staff_action_approval_rule_id_status_idx" ON "staff_action_approval"("rule_id", "status");
CREATE INDEX "staff_action_approval_requested_by_staff_id_status_idx" ON "staff_action_approval"("requested_by_staff_id", "status");
CREATE INDEX "staff_action_approval_target_kind_id_target_id_idx" ON "staff_action_approval"("target_kind_id", "target_id");

-- Approval FKs
ALTER TABLE "staff_approval_rule" ADD CONSTRAINT "staff_approval_rule_target_action_type_id_fkey" FOREIGN KEY ("target_action_type_id") REFERENCES "admin_action_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_approval_rule" ADD CONSTRAINT "staff_approval_rule_required_approver_role_id_fkey" FOREIGN KEY ("required_approver_role_id") REFERENCES "staff_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_approval_rule" ADD CONSTRAINT "staff_approval_rule_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "staff_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_approval_rule_condition" ADD CONSTRAINT "staff_approval_rule_condition_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "staff_approval_rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_approval_rule_condition" ADD CONSTRAINT "staff_approval_rule_condition_condition_type_id_fkey" FOREIGN KEY ("condition_type_id") REFERENCES "approval_condition_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_condition_amount" ADD CONSTRAINT "approval_condition_amount_id_fkey" FOREIGN KEY ("id") REFERENCES "staff_approval_rule_condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_condition_role" ADD CONSTRAINT "approval_condition_role_id_fkey" FOREIGN KEY ("id") REFERENCES "staff_approval_rule_condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_condition_role" ADD CONSTRAINT "approval_condition_role_staff_role_id_fkey" FOREIGN KEY ("staff_role_id") REFERENCES "staff_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_condition_doc_type" ADD CONSTRAINT "approval_condition_doc_type_id_fkey" FOREIGN KEY ("id") REFERENCES "staff_approval_rule_condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_action_approval" ADD CONSTRAINT "staff_action_approval_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "staff_approval_rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_action_approval" ADD CONSTRAINT "staff_action_approval_target_kind_id_fkey" FOREIGN KEY ("target_kind_id") REFERENCES "admin_target_kind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_action_approval" ADD CONSTRAINT "staff_action_approval_requested_by_staff_id_fkey" FOREIGN KEY ("requested_by_staff_id") REFERENCES "staff_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_action_approval" ADD CONSTRAINT "staff_action_approval_approved_by_staff_id_fkey" FOREIGN KEY ("approved_by_staff_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "staff_action_approval" ADD CONSTRAINT "staff_action_approval_execution_audit_id_fkey" FOREIGN KEY ("execution_audit_id") REFERENCES "audit_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ##########################################################################
-- ##  PHASE F — SLA engine                                                 ##
-- ##########################################################################

CREATE TABLE "staff_sla_rule" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "target_queue_id" INTEGER NOT NULL,
    "threshold_minutes" INTEGER NOT NULL,
    "notify_role_id" INTEGER,
    "notify_assignee" BOOLEAN NOT NULL DEFAULT true,
    "notification_title" VARCHAR(200),
    "notification_body" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_staff_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "staff_sla_rule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "staff_sla_rule_target_queue_id_is_active_idx" ON "staff_sla_rule"("target_queue_id", "is_active");

CREATE TABLE "staff_sla_breach" (
    "id" BIGSERIAL NOT NULL,
    "rule_id" BIGINT NOT NULL,
    "target_kind_id" INTEGER NOT NULL,
    "target_id" BIGINT NOT NULL,
    "detected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    CONSTRAINT "staff_sla_breach_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "staff_sla_breach_target_kind_id_target_id_idx" ON "staff_sla_breach"("target_kind_id", "target_id");
CREATE INDEX "staff_sla_breach_unresolved_idx" ON "staff_sla_breach"("rule_id") WHERE "resolved_at" IS NULL;
CREATE UNIQUE INDEX "staff_sla_breach_active_unique" ON "staff_sla_breach"("rule_id", "target_kind_id", "target_id");

ALTER TABLE "staff_sla_rule" ADD CONSTRAINT "staff_sla_rule_target_queue_id_fkey" FOREIGN KEY ("target_queue_id") REFERENCES "admin_queue_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_sla_rule" ADD CONSTRAINT "staff_sla_rule_notify_role_id_fkey" FOREIGN KEY ("notify_role_id") REFERENCES "staff_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_sla_rule" ADD CONSTRAINT "staff_sla_rule_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "staff_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_sla_breach" ADD CONSTRAINT "staff_sla_breach_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "staff_sla_rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_sla_breach" ADD CONSTRAINT "staff_sla_breach_target_kind_id_fkey" FOREIGN KEY ("target_kind_id") REFERENCES "admin_target_kind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ##########################################################################
-- ##  PHASE G — Support collaboration                                      ##
-- ##########################################################################

CREATE TABLE "support_collaboration" (
    "id" BIGSERIAL NOT NULL,
    "client_profile_id" BIGINT NOT NULL,
    "assigned_to_staff_id" BIGINT,
    "last_message_at" TIMESTAMPTZ,
    "user_last_read_at" TIMESTAMPTZ,
    "staff_last_read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "support_collaboration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "support_collaboration_client_profile_id_key" ON "support_collaboration"("client_profile_id");
CREATE INDEX "support_collaboration_assigned_to_staff_id_idx" ON "support_collaboration"("assigned_to_staff_id");
CREATE INDEX "support_collaboration_last_message_at_idx" ON "support_collaboration"("last_message_at" DESC);

ALTER TABLE "support_collaboration" ADD CONSTRAINT "support_collaboration_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_collaboration" ADD CONSTRAINT "support_collaboration_assigned_to_staff_id_fkey" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ##########################################################################
-- ##  PHASE H — Modify existing tables: escrow_dispute + message           ##
-- ##########################################################################

-- escrow_dispute: + assigned_to_staff_id
ALTER TABLE "escrow_dispute" ADD COLUMN "assigned_to_staff_id" BIGINT;
CREATE INDEX "escrow_dispute_assigned_to_staff_id_status_idx" ON "escrow_dispute"("assigned_to_staff_id", "status");
ALTER TABLE "escrow_dispute" ADD CONSTRAINT "escrow_dispute_assigned_to_staff_id_fkey" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- message: nullable conversation_id + new support_collaboration_id + sender FK retarget
ALTER TABLE "message" DROP CONSTRAINT "message_sender_id_fkey";
ALTER TABLE "message" ADD COLUMN "support_collaboration_id" BIGINT;
ALTER TABLE "message" ALTER COLUMN "conversation_id" DROP NOT NULL;
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "message" ADD CONSTRAINT "message_support_collaboration_id_fkey" FOREIGN KEY ("support_collaboration_id") REFERENCES "support_collaboration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "message_support_collaboration_id_created_at_idx" ON "message"("support_collaboration_id", "created_at");
CREATE INDEX "message_sender_id_idx" ON "message"("sender_id");


-- ##########################################################################
-- ##  PHASE I — CHECK constraints                                          ##
-- ##########################################################################

-- Existing message rows have conversation_id NOT NULL → satisfy this CHECK by default
ALTER TABLE "message" ADD CONSTRAINT "message_one_container"
  CHECK (num_nonnulls("conversation_id", "support_collaboration_id") = 1);

ALTER TABLE "approval_condition_amount" ADD CONSTRAINT "approval_condition_amount_threshold_positive"
  CHECK ("threshold_pence" > 0);

ALTER TABLE "staff_sla_rule" ADD CONSTRAINT "staff_sla_rule_threshold_positive"
  CHECK ("threshold_minutes" > 0);


-- ##########################################################################
-- ##  PHASE J — Triggers (PL/pgSQL functions + triggers)                   ##
-- ##########################################################################

-- R2: cascade-up — when a subtype row (e.g. document) is deleted, also delete its parent reviewable_item
CREATE OR REPLACE FUNCTION delete_reviewable_item_on_subtype_delete()
  RETURNS TRIGGER AS $$
BEGIN
  -- DELETE is safe even if parent already gone (cascade re-entry): 0 rows affected, no error
  DELETE FROM "reviewable_item" WHERE "id" = OLD."id";
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "document_delete_cascades_up"
AFTER DELETE ON "document"
FOR EACH ROW
EXECUTE FUNCTION delete_reviewable_item_on_subtype_delete();
-- (Future subtypes — add the same trigger per table; function is reusable.)


-- R3a: reviewable_item must have a matching subtype row
-- Trigger is DEFERRABLE — check happens at commit time so parent + subtype
-- can be inserted in any order within the same transaction.
CREATE OR REPLACE FUNCTION check_reviewable_item_subtype_exists()
  RETURNS TRIGGER AS $$
DECLARE
  subtype_table TEXT;
  subtype_exists BOOLEAN;
BEGIN
  subtype_table := lower(NEW."kind");
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE "id" = $1)', subtype_table)
    INTO subtype_exists USING NEW."id";
  IF NOT subtype_exists THEN
    RAISE EXCEPTION 'reviewable_item % has kind=% but no matching row in subtype table %',
      NEW."id", NEW."kind", subtype_table;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "reviewable_item_must_have_subtype"
AFTER INSERT OR UPDATE ON "reviewable_item"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_reviewable_item_subtype_exists();


-- R3b: staff_approval_rule_condition must have a matching subtype row
-- (value_subtype maps to 'approval_condition_<lowercase>' table)
CREATE OR REPLACE FUNCTION check_approval_condition_subtype_exists()
  RETURNS TRIGGER AS $$
DECLARE
  v_value_subtype TEXT;
  subtype_table TEXT;
  subtype_exists BOOLEAN;
BEGIN
  SELECT "value_subtype" INTO v_value_subtype
  FROM "approval_condition_type"
  WHERE "id" = NEW."condition_type_id";

  IF v_value_subtype IS NULL THEN
    RAISE EXCEPTION 'approval_condition_type id=% not found', NEW."condition_type_id";
  END IF;

  subtype_table := 'approval_condition_' || lower(v_value_subtype);
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE "id" = $1)', subtype_table)
    INTO subtype_exists USING NEW."id";

  IF NOT subtype_exists THEN
    RAISE EXCEPTION 'staff_approval_rule_condition % has value_subtype=% but no matching row in %',
      NEW."id", v_value_subtype, subtype_table;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "approval_condition_must_have_subtype"
AFTER INSERT OR UPDATE ON "staff_approval_rule_condition"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_approval_condition_subtype_exists();


-- Polymorphic target validation for staff_action_approval + staff_sla_breach
-- target_kind_id → admin_target_kind.name (lowercase) → target table.
-- Example: admin_target_kind.name = 'PAYMENT' → check payment table for target_id.
CREATE OR REPLACE FUNCTION check_polymorphic_target_exists()
  RETURNS TRIGGER AS $$
DECLARE
  v_target_kind_name TEXT;
  target_table TEXT;
  target_exists BOOLEAN;
BEGIN
  SELECT "name" INTO v_target_kind_name
  FROM "admin_target_kind"
  WHERE "id" = NEW."target_kind_id";

  IF v_target_kind_name IS NULL THEN
    RAISE EXCEPTION 'admin_target_kind id=% not found', NEW."target_kind_id";
  END IF;

  target_table := lower(v_target_kind_name);
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE "id" = $1)', target_table)
    INTO target_exists USING NEW."target_id";

  IF NOT target_exists THEN
    RAISE EXCEPTION 'Polymorphic target_id=% not found in table %', NEW."target_id", target_table;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "staff_action_approval_target_must_exist"
BEFORE INSERT OR UPDATE OF "target_kind_id", "target_id" ON "staff_action_approval"
FOR EACH ROW
EXECUTE FUNCTION check_polymorphic_target_exists();

CREATE TRIGGER "staff_sla_breach_target_must_exist"
BEFORE INSERT OR UPDATE OF "target_kind_id", "target_id" ON "staff_sla_breach"
FOR EACH ROW
EXECUTE FUNCTION check_polymorphic_target_exists();


-- ==========================================================================
-- END OF MIGRATION
-- ==========================================================================
