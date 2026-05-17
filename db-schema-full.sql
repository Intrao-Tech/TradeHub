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
    "staff_role" VARCHAR(20) NOT NULL,
    "is_on_duty" BOOLEAN NOT NULL DEFAULT false,
    "invite_expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" BIGSERIAL NOT NULL,
    "client_profile_id" BIGINT NOT NULL,
    "doc_type" VARCHAR(40) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "rejection_reason" VARCHAR(500),
    "metadata" JSONB,
    "assigned_to" BIGINT,
    "reviewed_by" BIGINT,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "resolved_at" TIMESTAMPTZ,
    "resolution_reasoning" VARCHAR(2000),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "escrow_dispute_pkey" PRIMARY KEY ("id")
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
    "conversation_id" BIGINT NOT NULL,
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
CREATE INDEX "document_client_profile_id_status_idx" ON "document"("client_profile_id", "status");

-- CreateIndex
CREATE INDEX "document_status_created_at_idx" ON "document"("status", "created_at");

-- CreateIndex
CREATE INDEX "document_assigned_to_status_idx" ON "document"("assigned_to", "status");

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
CREATE INDEX "referral_intent_actor_id_target_job_post_id_expires_at_idx" ON "referral_intent"("actor_id", "target_job_post_id", "expires_at");

-- CreateIndex
CREATE INDEX "referral_intent_actor_id_target_worker_id_expires_at_idx" ON "referral_intent"("actor_id", "target_worker_id", "expires_at");

-- CreateIndex
CREATE INDEX "message_conversation_id_created_at_idx" ON "message"("conversation_id", "created_at");

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
ALTER TABLE "document" ADD CONSTRAINT "document_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "client_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK constraints (not expressible in Prisma schema).

-- ReferralIntent: exactly one target (job post for W2W, worker for E2E).
ALTER TABLE "referral_intent" ADD CONSTRAINT "referral_intent_one_target"
  CHECK (num_nonnulls("target_job_post_id", "target_worker_id") = 1);

-- ReferralIntent: no self-referral (you cannot refer yourself).
ALTER TABLE "referral_intent" ADD CONSTRAINT "referral_intent_no_self_ref"
  CHECK ("actor_id" <> "referrer_id");

-- JobAttachment: exactly one owner — every attachment belongs to a job post
-- XOR a job application (no orphan / unattached rows).
ALTER TABLE "job_attachment" ADD CONSTRAINT "job_attachment_one_owner"
  CHECK (num_nonnulls("job_post_id", "job_application_id") = 1);

-- Message: every message has either text content or a file.
ALTER TABLE "message" ADD CONSTRAINT "message_has_body"
  CHECK ("content" IS NOT NULL OR "file_url" IS NOT NULL);