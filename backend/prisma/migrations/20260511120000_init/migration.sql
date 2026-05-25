-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "account" (
    "id" BIGSERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "google_id" VARCHAR(100),
    "phone" VARCHAR(20),
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
    "email_verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "last_login_at" TIMESTAMPTZ,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_token" (
    "id" BIGSERIAL NOT NULL,
    "account_id" BIGINT NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_token" (
    "id" BIGSERIAL NOT NULL,
    "account_id" BIGINT NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" BIGSERIAL NOT NULL,
    "account_id" BIGINT NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_profile" (
    "id" BIGINT NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "avatar_url" VARCHAR(500),
    "bio" TEXT,
    "city" VARCHAR(100),
    "postcode_area" VARCHAR(10),
    "verification_level" VARCHAR(30) NOT NULL DEFAULT 'UNVERIFIED',
    "stripe_connect_account_id" VARCHAR(200),
    "stripe_onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
    "connect_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
    "connect_payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "referral_code" VARCHAR(16) NOT NULL,
    "referred_by_id" BIGINT,
    "referred_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "client_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_profile" (
    "id" BIGINT NOT NULL,
    "years_experience" SMALLINT,
    "day_rate_min" DECIMAL(8,2),
    "day_rate_max" DECIMAL(8,2),
    "available_from" TIMESTAMPTZ,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "worker_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer_profile" (
    "id" BIGINT NOT NULL,
    "company_name" VARCHAR(200),
    "company_number" VARCHAR(20),
    "team_size" SMALLINT,
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "employer_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_member" (
    "id" BIGINT NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "is_on_duty" BOOLEAN NOT NULL DEFAULT false,
    "invite_expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" BIGINT NOT NULL,
    "doc_type" VARCHAR(40) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialisation" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,

    CONSTRAINT "specialisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_specialisation" (
    "worker_id" BIGINT NOT NULL,
    "specialisation_id" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "worker_specialisation_pkey" PRIMARY KEY ("worker_id","specialisation_id")
);

-- CreateTable
CREATE TABLE "worker_language" (
    "worker_id" BIGINT NOT NULL,
    "language_code" VARCHAR(10) NOT NULL,

    CONSTRAINT "worker_language_pkey" PRIMARY KEY ("worker_id","language_code")
);

-- CreateTable
CREATE TABLE "portfolio_item" (
    "id" BIGSERIAL NOT NULL,
    "worker_id" BIGINT NOT NULL,
    "item_type" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "portfolio_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experience_detail" (
    "id" BIGINT NOT NULL,
    "company_name" VARCHAR(200),
    "role" VARCHAR(150),
    "start_date" TIMESTAMPTZ,
    "end_date" TIMESTAMPTZ,

    CONSTRAINT "experience_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_detail" (
    "id" BIGINT NOT NULL,
    "project_type" VARCHAR(100),
    "site_postcode" VARCHAR(10),
    "completed_at" TIMESTAMPTZ,
    "project_value" DECIMAL(12,2),

    CONSTRAINT "project_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_detail" (
    "id" BIGINT NOT NULL,
    "cert_type" VARCHAR(100) NOT NULL,
    "cert_number" VARCHAR(100),
    "issuing_body" VARCHAR(200),
    "issued_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "certification_detail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_media" (
    "id" BIGSERIAL NOT NULL,
    "portfolio_item_id" BIGINT NOT NULL,
    "media_url" VARCHAR(500) NOT NULL,
    "caption" VARCHAR(300),
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_item_document" (
    "portfolio_item_id" BIGINT NOT NULL,
    "document_id" BIGINT NOT NULL,

    CONSTRAINT "portfolio_item_document_pkey" PRIMARY KEY ("portfolio_item_id","document_id")
);

-- CreateTable
CREATE TABLE "verification_milestone" (
    "id" BIGSERIAL NOT NULL,
    "client_profile_id" BIGINT NOT NULL,
    "milestone_type" VARCHAR(40) NOT NULL,
    "staff_member_id" BIGINT,
    "achieved_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "evidence_ref" VARCHAR(500),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration" (
    "id" BIGSERIAL NOT NULL,
    "worker_id" BIGINT NOT NULL,
    "employer_id" BIGINT NOT NULL,
    "first_contracted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "collaboration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract" (
    "id" BIGSERIAL NOT NULL,
    "collaboration_id" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "end_reason" VARCHAR(20),
    "agreed_amount" DECIMAL(12,2),
    "project_type" VARCHAR(100),
    "site_postcode" VARCHAR(10),
    "job_post_id" BIGINT,
    "initiated_by" VARCHAR(10) NOT NULL,
    "project_referrer_id" BIGINT,
    "project_referrer_role" VARCHAR(10),
    "started_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" BIGSERIAL NOT NULL,
    "contract_id" BIGINT NOT NULL,
    "reviewer_role" VARCHAR(10) NOT NULL,
    "overall_rating" SMALLINT NOT NULL,
    "quality_rating" SMALLINT,
    "reliability_rating" SMALLINT,
    "communication_rating" SMALLINT,
    "payment_rating" SMALLINT,
    "safety_rating" SMALLINT,
    "comment" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_milestone" (
    "id" BIGSERIAL NOT NULL,
    "contract_id" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "amount" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_by_role" VARCHAR(10) NOT NULL DEFAULT 'EMPLOYER',
    "submission_message" VARCHAR(2000),
    "worker_submitted_at" TIMESTAMPTZ,
    "employer_approved_at" TIMESTAMPTZ,
    "released_at" TIMESTAMPTZ,
    "refunded_at" TIMESTAMPTZ,
    "disputed_at" TIMESTAMPTZ,
    "release_attempts" INTEGER NOT NULL DEFAULT 0,
    "refund_reason" VARCHAR(500),
    "frozen_client_fee_pct" DECIMAL(5,2),
    "frozen_freelancer_fee_pct" DECIMAL(5,2),
    "frozen_referral_fee_pct" DECIMAL(5,2),
    "frozen_worker_payout" DECIMAL(12,2),
    "frozen_referral_commission" DECIMAL(12,2),
    "frozen_platform_fee" DECIMAL(12,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "escrow_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_milestone_attachment" (
    "id" BIGSERIAL NOT NULL,
    "milestone_id" BIGINT NOT NULL,
    "phase" VARCHAR(15) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_milestone_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" BIGSERIAL NOT NULL,
    "milestone_id" BIGINT NOT NULL,
    "client_profile_id" BIGINT NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'GBP',
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "stripe_id" VARCHAR(200),
    "failure_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_setting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "client_marketplace_fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 5.0,
    "freelancer_service_fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 10.0,
    "account_referral_pct" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "account_referral_window_months" INTEGER DEFAULT 12,
    "project_referral_w2w_pct" DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    "project_referral_e2e_pct" DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    "stripe_fee_passthrough" VARCHAR(20) NOT NULL DEFAULT 'EMPLOYER_PAYS',
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" BIGINT,

    CONSTRAINT "platform_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_dispute" (
    "id" BIGSERIAL NOT NULL,
    "milestone_id" BIGINT NOT NULL,
    "filed_by_role" VARCHAR(10) NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "response" VARCHAR(2000),
    "responded_at" TIMESTAMPTZ,
    "resolution" JSONB,
    "arbitration_required" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by" BIGINT,
    "assigned_to_staff_id" BIGINT,
    "resolved_at" TIMESTAMPTZ,
    "resolution_reasoning" VARCHAR(2000),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "escrow_dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_dispute_proposal" (
    "id" BIGSERIAL NOT NULL,
    "dispute_id" BIGINT NOT NULL,
    "proposed_by_staff_id" BIGINT NOT NULL,
    "worker_pct" INTEGER NOT NULL,
    "employer_refund_pct" INTEGER NOT NULL,
    "keep_platform_fee" BOOLEAN NOT NULL DEFAULT true,
    "reasoning" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING_RESPONSE',
    "worker_decision" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "worker_decided_at" TIMESTAMPTZ,
    "worker_decision_note" VARCHAR(500),
    "employer_decision" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "employer_decided_at" TIMESTAMPTZ,
    "employer_decision_note" VARCHAR(500),
    "proposed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "execution_audit_id" BIGINT,

    CONSTRAINT "escrow_dispute_proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "price_monthly" DECIMAL(8,2) NOT NULL,
    "price_yearly" DECIMAL(8,2),
    "max_referrals" INTEGER,
    "features" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "subscription_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscription" (
    "id" BIGSERIAL NOT NULL,
    "client_profile_id" BIGINT NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "stripe_sub_id" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "current_period_start" TIMESTAMPTZ,
    "current_period_end" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" BIGSERIAL NOT NULL,
    "account_id" BIGINT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ,
    "channel" VARCHAR(10) NOT NULL DEFAULT 'IN_APP',
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "account_id" BIGINT,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" BIGINT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_tag" (
    "worker_id" BIGINT NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "worker_tag_pkey" PRIMARY KEY ("worker_id","tag_id")
);

-- CreateTable
CREATE TABLE "job_post" (
    "id" BIGSERIAL NOT NULL,
    "employer_id" BIGINT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "postcode_area" VARCHAR(10),
    "site_address" VARCHAR(300),
    "pay_type" VARCHAR(15) NOT NULL,
    "day_rate_min" DECIMAL(8,2),
    "day_rate_max" DECIMAL(8,2),
    "fixed_price" DECIMAL(12,2),
    "duration_days" INTEGER,
    "start_date" TIMESTAMPTZ,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "is_urgent" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "job_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_post_specialisation" (
    "job_post_id" BIGINT NOT NULL,
    "specialisation_id" INTEGER NOT NULL,

    CONSTRAINT "job_post_specialisation_pkey" PRIMARY KEY ("job_post_id","specialisation_id")
);

-- CreateTable
CREATE TABLE "job_post_tag" (
    "job_post_id" BIGINT NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "job_post_tag_pkey" PRIMARY KEY ("job_post_id","tag_id")
);

-- CreateTable
CREATE TABLE "job_application" (
    "id" BIGSERIAL NOT NULL,
    "job_post_id" BIGINT NOT NULL,
    "worker_id" BIGINT NOT NULL,
    "initiated_by" VARCHAR(10) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "cover_message" TEXT,
    "proposed_rate" DECIMAL(8,2),
    "project_referrer_id" BIGINT,
    "project_referrer_role" VARCHAR(10),
    "responded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "job_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_attachment" (
    "id" BIGSERIAL NOT NULL,
    "job_post_id" BIGINT,
    "job_application_id" BIGINT,
    "file_url" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_job" (
    "worker_id" BIGINT NOT NULL,
    "job_post_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_job_pkey" PRIMARY KEY ("worker_id","job_post_id")
);

-- CreateTable
CREATE TABLE "referral_intent" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" BIGINT NOT NULL,
    "referrer_id" BIGINT NOT NULL,
    "target_job_post_id" BIGINT,
    "target_worker_id" BIGINT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_intent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" BIGINT NOT NULL,
    "last_message_at" TIMESTAMPTZ,
    "worker_last_read_at" TIMESTAMPTZ,
    "employer_last_read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" BIGSERIAL NOT NULL,
    "conversation_id" BIGINT,
    "support_collaboration_id" BIGINT,
    "sender_id" BIGINT,
    "message_type" VARCHAR(20) NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "file_url" VARCHAR(500),
    "original_name" VARCHAR(255),
    "mime_type" VARCHAR(100),
    "size_bytes" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_role" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "description" VARCHAR(500),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "staff_role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by_staff_id" BIGINT,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("staff_role_id","permission_id")
);

-- CreateTable
CREATE TABLE "staff_member_role" (
    "staff_member_id" BIGINT NOT NULL,
    "staff_role_id" INTEGER NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by_staff_id" BIGINT,

    CONSTRAINT "staff_member_role_pkey" PRIMARY KEY ("staff_member_id","staff_role_id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "admin_target_kind" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_target_kind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_queue_type" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_queue_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_condition_type" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "value_subtype" VARCHAR(40) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_condition_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviewable_item" (
    "id" BIGSERIAL NOT NULL,
    "client_profile_id" BIGINT NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviewable_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "staff_approval_rule_condition" (
    "id" BIGSERIAL NOT NULL,
    "rule_id" BIGINT NOT NULL,
    "condition_type_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_approval_rule_condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_condition_amount" (
    "id" BIGINT NOT NULL,
    "threshold_pence" BIGINT NOT NULL,

    CONSTRAINT "approval_condition_amount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_condition_role" (
    "id" BIGINT NOT NULL,
    "staff_role_id" INTEGER NOT NULL,

    CONSTRAINT "approval_condition_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_condition_doc_type" (
    "id" BIGINT NOT NULL,
    "document_type" VARCHAR(40) NOT NULL,

    CONSTRAINT "approval_condition_doc_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "staff_sla_breach" (
    "id" BIGSERIAL NOT NULL,
    "rule_id" BIGINT NOT NULL,
    "target_kind_id" INTEGER NOT NULL,
    "target_id" BIGINT NOT NULL,
    "detected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "staff_sla_breach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "account_email_key" ON "account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "account_google_id_key" ON "account"("google_id");

-- CreateIndex
CREATE INDEX "account_status_idx" ON "account"("status");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_token_token_hash_key" ON "email_verification_token"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_token_account_id_idx" ON "email_verification_token"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_token_hash_key" ON "password_reset_token"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_token_account_id_idx" ON "password_reset_token"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_key" ON "refresh_token"("token");

-- CreateIndex
CREATE INDEX "refresh_token_account_id_idx" ON "refresh_token"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_profile_slug_key" ON "client_profile"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "client_profile_referral_code_key" ON "client_profile"("referral_code");

-- CreateIndex
CREATE INDEX "client_profile_postcode_area_idx" ON "client_profile"("postcode_area");

-- CreateIndex
CREATE INDEX "client_profile_referred_by_id_idx" ON "client_profile"("referred_by_id");

-- CreateIndex
CREATE INDEX "worker_profile_is_available_available_from_idx" ON "worker_profile"("is_available", "available_from");

-- CreateIndex
CREATE INDEX "worker_profile_rating_avg_rating_count_idx" ON "worker_profile"("rating_avg" DESC, "rating_count" DESC);

-- CreateIndex
CREATE INDEX "employer_profile_rating_avg_rating_count_idx" ON "employer_profile"("rating_avg" DESC, "rating_count" DESC);

-- CreateIndex
CREATE INDEX "staff_member_is_on_duty_idx" ON "staff_member"("is_on_duty");

-- CreateIndex
CREATE INDEX "document_doc_type_idx" ON "document"("doc_type");

-- CreateIndex
CREATE UNIQUE INDEX "specialisation_name_key" ON "specialisation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "specialisation_slug_key" ON "specialisation"("slug");

-- CreateIndex
CREATE INDEX "worker_specialisation_specialisation_id_idx" ON "worker_specialisation"("specialisation_id");

-- CreateIndex
CREATE INDEX "worker_language_language_code_idx" ON "worker_language"("language_code");

-- CreateIndex
CREATE INDEX "portfolio_item_worker_id_sort_order_idx" ON "portfolio_item"("worker_id", "sort_order");

-- CreateIndex
CREATE INDEX "portfolio_media_portfolio_item_id_sort_order_idx" ON "portfolio_media"("portfolio_item_id", "sort_order");

-- CreateIndex
CREATE INDEX "portfolio_item_document_document_id_idx" ON "portfolio_item_document"("document_id");

-- CreateIndex
CREATE INDEX "verification_milestone_client_profile_id_milestone_type_idx" ON "verification_milestone"("client_profile_id", "milestone_type");

-- CreateIndex
CREATE INDEX "collaboration_worker_id_idx" ON "collaboration"("worker_id");

-- CreateIndex
CREATE INDEX "collaboration_employer_id_idx" ON "collaboration"("employer_id");

-- CreateIndex
CREATE INDEX "contract_status_idx" ON "contract"("status");

-- CreateIndex
CREATE INDEX "contract_project_referrer_id_idx" ON "contract"("project_referrer_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_collaboration_id_position_key" ON "contract"("collaboration_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "review_contract_id_reviewer_role_key" ON "review"("contract_id", "reviewer_role");

-- CreateIndex
CREATE INDEX "escrow_milestone_status_idx" ON "escrow_milestone"("status");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_milestone_contract_id_position_key" ON "escrow_milestone"("contract_id", "position");

-- CreateIndex
CREATE INDEX "escrow_milestone_attachment_milestone_id_idx" ON "escrow_milestone_attachment"("milestone_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_stripe_id_key" ON "payment"("stripe_id");

-- CreateIndex
CREATE INDEX "payment_client_profile_id_status_idx" ON "payment"("client_profile_id", "status");

-- CreateIndex
CREATE INDEX "payment_milestone_id_idx" ON "payment"("milestone_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_dispute_milestone_id_key" ON "escrow_dispute"("milestone_id");

-- CreateIndex
CREATE INDEX "escrow_dispute_status_idx" ON "escrow_dispute"("status");

-- CreateIndex
CREATE INDEX "escrow_dispute_assigned_to_staff_id_status_idx" ON "escrow_dispute"("assigned_to_staff_id", "status");

-- CreateIndex
CREATE INDEX "escrow_dispute_proposal_dispute_id_status_idx" ON "escrow_dispute_proposal"("dispute_id", "status");

-- CreateIndex
CREATE INDEX "escrow_dispute_proposal_proposed_by_staff_id_idx" ON "escrow_dispute_proposal"("proposed_by_staff_id");

-- CreateIndex
CREATE INDEX "user_subscription_client_profile_id_is_current_idx" ON "user_subscription"("client_profile_id", "is_current");

-- CreateIndex
CREATE INDEX "notification_account_id_created_at_idx" ON "notification"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_account_id_created_at_idx" ON "audit_log"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_name_key" ON "tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tag_slug_key" ON "tag"("slug");

-- CreateIndex
CREATE INDEX "worker_tag_tag_id_idx" ON "worker_tag"("tag_id");

-- CreateIndex
CREATE INDEX "job_post_employer_id_idx" ON "job_post"("employer_id");

-- CreateIndex
CREATE INDEX "job_post_status_postcode_area_idx" ON "job_post"("status", "postcode_area");

-- CreateIndex
CREATE INDEX "job_post_specialisation_specialisation_id_idx" ON "job_post_specialisation"("specialisation_id");

-- CreateIndex
CREATE INDEX "job_post_tag_tag_id_idx" ON "job_post_tag"("tag_id");

-- CreateIndex
CREATE INDEX "job_application_job_post_id_status_idx" ON "job_application"("job_post_id", "status");

-- CreateIndex
CREATE INDEX "job_application_worker_id_status_idx" ON "job_application"("worker_id", "status");

-- CreateIndex
CREATE INDEX "job_application_project_referrer_id_idx" ON "job_application"("project_referrer_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_application_job_post_id_worker_id_key" ON "job_application"("job_post_id", "worker_id");

-- CreateIndex
CREATE INDEX "job_attachment_job_post_id_idx" ON "job_attachment"("job_post_id");

-- CreateIndex
CREATE INDEX "job_attachment_job_application_id_idx" ON "job_attachment"("job_application_id");

-- CreateIndex
CREATE INDEX "job_attachment_created_at_idx" ON "job_attachment"("created_at");

-- CreateIndex
CREATE INDEX "saved_job_job_post_id_idx" ON "saved_job"("job_post_id");

-- CreateIndex
CREATE INDEX "saved_job_worker_id_created_at_idx" ON "saved_job"("worker_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "referral_intent_actor_id_target_job_post_id_expires_at_idx" ON "referral_intent"("actor_id", "target_job_post_id", "expires_at");

-- CreateIndex
CREATE INDEX "referral_intent_actor_id_target_worker_id_expires_at_idx" ON "referral_intent"("actor_id", "target_worker_id", "expires_at");

-- CreateIndex
CREATE INDEX "message_conversation_id_created_at_idx" ON "message"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "message_support_collaboration_id_created_at_idx" ON "message"("support_collaboration_id", "created_at");

-- CreateIndex
CREATE INDEX "message_sender_id_idx" ON "message"("sender_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_role_name_key" ON "staff_role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_key_key" ON "permission"("key");

-- CreateIndex
CREATE INDEX "permission_category_idx" ON "permission"("category");

-- CreateIndex
CREATE INDEX "role_permission_permission_id_idx" ON "role_permission"("permission_id");

-- CreateIndex
CREATE INDEX "staff_member_role_staff_role_id_idx" ON "staff_member_role"("staff_role_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_action_type_name_key" ON "admin_action_type"("name");

-- CreateIndex
CREATE INDEX "admin_action_type_category_is_active_idx" ON "admin_action_type"("category", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "admin_target_kind_name_key" ON "admin_target_kind"("name");

-- CreateIndex
CREATE UNIQUE INDEX "admin_queue_type_name_key" ON "admin_queue_type"("name");

-- CreateIndex
CREATE UNIQUE INDEX "approval_condition_type_name_key" ON "approval_condition_type"("name");

-- CreateIndex
CREATE INDEX "reviewable_item_kind_idx" ON "reviewable_item"("kind");

-- CreateIndex
CREATE INDEX "reviewable_item_client_profile_id_idx" ON "reviewable_item"("client_profile_id");

-- CreateIndex
CREATE INDEX "reviewable_item_client_profile_id_kind_idx" ON "reviewable_item"("client_profile_id", "kind");

-- CreateIndex
CREATE INDEX "review_item_reviewable_item_id_created_at_idx" ON "review_item"("reviewable_item_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "review_item_status_created_at_idx" ON "review_item"("status", "created_at");

-- CreateIndex
CREATE INDEX "review_item_assigned_to_staff_id_status_idx" ON "review_item"("assigned_to_staff_id", "status");

-- CreateIndex
CREATE INDEX "review_item_reviewed_by_staff_id_idx" ON "review_item"("reviewed_by_staff_id");

-- CreateIndex
CREATE INDEX "staff_approval_rule_target_action_type_id_is_active_idx" ON "staff_approval_rule"("target_action_type_id", "is_active");

-- CreateIndex
CREATE INDEX "staff_approval_rule_condition_rule_id_idx" ON "staff_approval_rule_condition"("rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_approval_rule_condition_rule_id_condition_type_id_key" ON "staff_approval_rule_condition"("rule_id", "condition_type_id");

-- CreateIndex
CREATE INDEX "staff_action_approval_status_requested_at_idx" ON "staff_action_approval"("status", "requested_at");

-- CreateIndex
CREATE INDEX "staff_action_approval_rule_id_status_idx" ON "staff_action_approval"("rule_id", "status");

-- CreateIndex
CREATE INDEX "staff_action_approval_requested_by_staff_id_status_idx" ON "staff_action_approval"("requested_by_staff_id", "status");

-- CreateIndex
CREATE INDEX "staff_action_approval_target_kind_id_target_id_idx" ON "staff_action_approval"("target_kind_id", "target_id");

-- CreateIndex
CREATE INDEX "staff_sla_rule_target_queue_id_is_active_idx" ON "staff_sla_rule"("target_queue_id", "is_active");

-- CreateIndex
CREATE INDEX "staff_sla_breach_target_kind_id_target_id_idx" ON "staff_sla_breach"("target_kind_id", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_sla_breach_active_unique" ON "staff_sla_breach"("rule_id", "target_kind_id", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_collaboration_client_profile_id_key" ON "support_collaboration"("client_profile_id");

-- CreateIndex
CREATE INDEX "support_collaboration_assigned_to_staff_id_idx" ON "support_collaboration"("assigned_to_staff_id");

-- CreateIndex
CREATE INDEX "support_collaboration_last_message_at_idx" ON "support_collaboration"("last_message_at" DESC);

-- AddForeignKey
ALTER TABLE "email_verification_token" ADD CONSTRAINT "email_verification_token_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profile" ADD CONSTRAINT "client_profile_id_fkey" FOREIGN KEY ("id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profile" ADD CONSTRAINT "client_profile_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "client_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_profile" ADD CONSTRAINT "worker_profile_id_fkey" FOREIGN KEY ("id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_profile" ADD CONSTRAINT "employer_profile_id_fkey" FOREIGN KEY ("id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_member" ADD CONSTRAINT "staff_member_id_fkey" FOREIGN KEY ("id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_id_fkey" FOREIGN KEY ("id") REFERENCES "reviewable_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_specialisation" ADD CONSTRAINT "worker_specialisation_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_specialisation" ADD CONSTRAINT "worker_specialisation_specialisation_id_fkey" FOREIGN KEY ("specialisation_id") REFERENCES "specialisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_language" ADD CONSTRAINT "worker_language_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_item" ADD CONSTRAINT "portfolio_item_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_detail" ADD CONSTRAINT "experience_detail_id_fkey" FOREIGN KEY ("id") REFERENCES "portfolio_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_detail" ADD CONSTRAINT "project_detail_id_fkey" FOREIGN KEY ("id") REFERENCES "portfolio_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_detail" ADD CONSTRAINT "certification_detail_id_fkey" FOREIGN KEY ("id") REFERENCES "portfolio_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_media" ADD CONSTRAINT "portfolio_media_portfolio_item_id_fkey" FOREIGN KEY ("portfolio_item_id") REFERENCES "portfolio_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_item_document" ADD CONSTRAINT "portfolio_item_document_portfolio_item_id_fkey" FOREIGN KEY ("portfolio_item_id") REFERENCES "portfolio_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_item_document" ADD CONSTRAINT "portfolio_item_document_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_milestone" ADD CONSTRAINT "verification_milestone_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_milestone" ADD CONSTRAINT "verification_milestone_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration" ADD CONSTRAINT "collaboration_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration" ADD CONSTRAINT "collaboration_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employer_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_collaboration_id_fkey" FOREIGN KEY ("collaboration_id") REFERENCES "collaboration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_project_referrer_id_fkey" FOREIGN KEY ("project_referrer_id") REFERENCES "client_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_milestone" ADD CONSTRAINT "escrow_milestone_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_milestone_attachment" ADD CONSTRAINT "escrow_milestone_attachment_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "escrow_milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "escrow_milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_setting" ADD CONSTRAINT "platform_setting_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_dispute" ADD CONSTRAINT "escrow_dispute_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "escrow_milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_dispute" ADD CONSTRAINT "escrow_dispute_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_dispute" ADD CONSTRAINT "escrow_dispute_assigned_to_staff_id_fkey" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_dispute_proposal" ADD CONSTRAINT "escrow_dispute_proposal_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "escrow_dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_dispute_proposal" ADD CONSTRAINT "escrow_dispute_proposal_proposed_by_staff_id_fkey" FOREIGN KEY ("proposed_by_staff_id") REFERENCES "staff_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_dispute_proposal" ADD CONSTRAINT "escrow_dispute_proposal_execution_audit_id_fkey" FOREIGN KEY ("execution_audit_id") REFERENCES "audit_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription" ADD CONSTRAINT "user_subscription_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription" ADD CONSTRAINT "user_subscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_tag" ADD CONSTRAINT "worker_tag_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_tag" ADD CONSTRAINT "worker_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post" ADD CONSTRAINT "job_post_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employer_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_specialisation" ADD CONSTRAINT "job_post_specialisation_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_specialisation" ADD CONSTRAINT "job_post_specialisation_specialisation_id_fkey" FOREIGN KEY ("specialisation_id") REFERENCES "specialisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_tag" ADD CONSTRAINT "job_post_tag_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_tag" ADD CONSTRAINT "job_post_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_project_referrer_id_fkey" FOREIGN KEY ("project_referrer_id") REFERENCES "client_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_attachment" ADD CONSTRAINT "job_attachment_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_attachment" ADD CONSTRAINT "job_attachment_job_application_id_fkey" FOREIGN KEY ("job_application_id") REFERENCES "job_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_job" ADD CONSTRAINT "saved_job_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_job" ADD CONSTRAINT "saved_job_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_intent" ADD CONSTRAINT "referral_intent_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_intent" ADD CONSTRAINT "referral_intent_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_intent" ADD CONSTRAINT "referral_intent_target_job_post_id_fkey" FOREIGN KEY ("target_job_post_id") REFERENCES "job_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_intent" ADD CONSTRAINT "referral_intent_target_worker_id_fkey" FOREIGN KEY ("target_worker_id") REFERENCES "worker_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_id_fkey" FOREIGN KEY ("id") REFERENCES "collaboration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_support_collaboration_id_fkey" FOREIGN KEY ("support_collaboration_id") REFERENCES "support_collaboration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_staff_role_id_fkey" FOREIGN KEY ("staff_role_id") REFERENCES "staff_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_member_role" ADD CONSTRAINT "staff_member_role_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_member_role" ADD CONSTRAINT "staff_member_role_staff_role_id_fkey" FOREIGN KEY ("staff_role_id") REFERENCES "staff_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_member_role" ADD CONSTRAINT "staff_member_role_granted_by_staff_id_fkey" FOREIGN KEY ("granted_by_staff_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviewable_item" ADD CONSTRAINT "reviewable_item_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_reviewable_item_id_fkey" FOREIGN KEY ("reviewable_item_id") REFERENCES "reviewable_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_assigned_to_staff_id_fkey" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_reviewed_by_staff_id_fkey" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_approval_rule" ADD CONSTRAINT "staff_approval_rule_target_action_type_id_fkey" FOREIGN KEY ("target_action_type_id") REFERENCES "admin_action_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_approval_rule" ADD CONSTRAINT "staff_approval_rule_required_approver_role_id_fkey" FOREIGN KEY ("required_approver_role_id") REFERENCES "staff_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_approval_rule" ADD CONSTRAINT "staff_approval_rule_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "staff_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_approval_rule_condition" ADD CONSTRAINT "staff_approval_rule_condition_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "staff_approval_rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_approval_rule_condition" ADD CONSTRAINT "staff_approval_rule_condition_condition_type_id_fkey" FOREIGN KEY ("condition_type_id") REFERENCES "approval_condition_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_condition_amount" ADD CONSTRAINT "approval_condition_amount_id_fkey" FOREIGN KEY ("id") REFERENCES "staff_approval_rule_condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_condition_role" ADD CONSTRAINT "approval_condition_role_id_fkey" FOREIGN KEY ("id") REFERENCES "staff_approval_rule_condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_condition_role" ADD CONSTRAINT "approval_condition_role_staff_role_id_fkey" FOREIGN KEY ("staff_role_id") REFERENCES "staff_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_condition_doc_type" ADD CONSTRAINT "approval_condition_doc_type_id_fkey" FOREIGN KEY ("id") REFERENCES "staff_approval_rule_condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_action_approval" ADD CONSTRAINT "staff_action_approval_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "staff_approval_rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_action_approval" ADD CONSTRAINT "staff_action_approval_target_kind_id_fkey" FOREIGN KEY ("target_kind_id") REFERENCES "admin_target_kind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_action_approval" ADD CONSTRAINT "staff_action_approval_requested_by_staff_id_fkey" FOREIGN KEY ("requested_by_staff_id") REFERENCES "staff_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_action_approval" ADD CONSTRAINT "staff_action_approval_approved_by_staff_id_fkey" FOREIGN KEY ("approved_by_staff_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_action_approval" ADD CONSTRAINT "staff_action_approval_execution_audit_id_fkey" FOREIGN KEY ("execution_audit_id") REFERENCES "audit_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sla_rule" ADD CONSTRAINT "staff_sla_rule_target_queue_id_fkey" FOREIGN KEY ("target_queue_id") REFERENCES "admin_queue_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sla_rule" ADD CONSTRAINT "staff_sla_rule_notify_role_id_fkey" FOREIGN KEY ("notify_role_id") REFERENCES "staff_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sla_rule" ADD CONSTRAINT "staff_sla_rule_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "staff_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sla_breach" ADD CONSTRAINT "staff_sla_breach_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "staff_sla_rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_sla_breach" ADD CONSTRAINT "staff_sla_breach_target_kind_id_fkey" FOREIGN KEY ("target_kind_id") REFERENCES "admin_target_kind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_collaboration" ADD CONSTRAINT "support_collaboration_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_collaboration" ADD CONSTRAINT "support_collaboration_assigned_to_staff_id_fkey" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ##########################################################################
-- ##  SEED LOOKUPS — staff_role, admin_target_kind, admin_queue_type,     ##
-- ##  approval_condition_type, admin_action_type                          ##
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
-- ##  SEED PERMISSIONS (RBAC) + ADMIN/STAFF role_permission grants        ##
-- ##########################################################################

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

  -- User mutations
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
  ('support.assign',             'support',  'Assign or unassign the responsible staff on a support thread.'),

  -- Escrow dispute proposals
  ('disputes.propose',  'escrow',  'Propose a worker/employer split on an open dispute. Both parties must accept before it executes.'),
  ('disputes.escalate', 'escrow',  'Escalate a dispute to ARBITRATION_PENDING when parties cannot agree on a proposal.'),
  ('support.initiate',  'support', 'Open a new support thread with a user from the admin Users page (sending the first message).');

-- Grant ALL permissions to ADMIN role
INSERT INTO "role_permission" ("staff_role_id", "permission_id")
SELECT r.id, p.id
FROM "staff_role" r
CROSS JOIN "permission" p
WHERE r.name = 'ADMIN';

-- Grant a sensible default subset to STAFF role
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


-- ##########################################################################
-- ##  TRIGGERS (PL/pgSQL functions + triggers)                            ##
-- ##  Includes the hotfix from 20260524230000: polymorphic-target-exists  ##
-- ##  trigger returns NEW (not NULL) so BEFORE INSERT lets the row pass.  ##
-- ##########################################################################

-- R2: cascade-up — when a subtype row (e.g. document) is deleted, also delete its parent reviewable_item
CREATE OR REPLACE FUNCTION delete_reviewable_item_on_subtype_delete()
  RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM "reviewable_item" WHERE "id" = OLD."id";
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "document_delete_cascades_up"
AFTER DELETE ON "document"
FOR EACH ROW
EXECUTE FUNCTION delete_reviewable_item_on_subtype_delete();


-- R3a: reviewable_item must have a matching subtype row (DEFERRABLE)
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
-- HOTFIX (from 20260524230000): returns NEW so BEFORE INSERT trigger lets the
-- row through. Returning NULL silently skipped the INSERT and broke Prisma
-- RETURNING / app code reading the resulting row.
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

  RETURN NEW;
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


-- ##########################################################################
-- ##  CHECK constraints + partial indexes (not representable in Prisma    ##
-- ##  schema; added as raw SQL — preserved from original migrations).     ##
-- ##########################################################################

ALTER TABLE "approval_condition_amount"
  ADD CONSTRAINT "approval_condition_amount_threshold_positive"
  CHECK ("threshold_pence" > 0);

ALTER TABLE "escrow_dispute_proposal"
  ADD CONSTRAINT "escrow_dispute_proposal_split_sums_to_100"
  CHECK ("worker_pct" + "employer_refund_pct" = 100
     AND "worker_pct" >= 0 AND "worker_pct" <= 100);

ALTER TABLE "job_attachment"
  ADD CONSTRAINT "job_attachment_one_owner"
  CHECK (num_nonnulls("job_post_id", "job_application_id") = 1);

ALTER TABLE "message"
  ADD CONSTRAINT "message_has_body"
  CHECK ("content" IS NOT NULL OR "file_url" IS NOT NULL);

ALTER TABLE "message"
  ADD CONSTRAINT "message_one_container"
  CHECK (num_nonnulls("conversation_id", "support_collaboration_id") = 1);

ALTER TABLE "referral_intent"
  ADD CONSTRAINT "referral_intent_no_self_ref"
  CHECK ("actor_id" <> "referrer_id");

ALTER TABLE "referral_intent"
  ADD CONSTRAINT "referral_intent_one_target"
  CHECK (num_nonnulls("target_job_post_id", "target_worker_id") = 1);

ALTER TABLE "staff_sla_rule"
  ADD CONSTRAINT "staff_sla_rule_threshold_positive"
  CHECK ("threshold_minutes" > 0);

-- Partial indexes (Prisma 7 supports partial indexes for unique only via @@unique with `where`,
-- not all forms; preserving raw-SQL originals here for parity).
-- Drop the plain (non-partial) variants Prisma may have generated, then create the partial ones.

DROP INDEX IF EXISTS "review_item_reviewed_by_staff_id_idx";
CREATE INDEX "review_item_reviewed_by_staff_id_idx"
  ON "review_item"("reviewed_by_staff_id")
  WHERE "reviewed_by_staff_id" IS NOT NULL;

CREATE UNIQUE INDEX "escrow_dispute_proposal_one_pending_per_dispute"
  ON "escrow_dispute_proposal"("dispute_id")
  WHERE "status" = 'PENDING_RESPONSE';

CREATE UNIQUE INDEX "review_item_one_pending_per_reviewable"
  ON "review_item"("reviewable_item_id")
  WHERE "status" = 'PENDING';

CREATE INDEX "staff_sla_breach_unresolved_idx"
  ON "staff_sla_breach"("rule_id")
  WHERE "resolved_at" IS NULL;
