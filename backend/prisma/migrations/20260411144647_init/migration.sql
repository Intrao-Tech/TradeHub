-- CreateTable
CREATE TABLE "account" (
    "id" BIGSERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "google_id" VARCHAR(100),
    "phone" VARCHAR(20),
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "last_login_at" TIMESTAMPTZ,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
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
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" BIGSERIAL NOT NULL,
    "client_profile_id" BIGINT NOT NULL,
    "doc_type" VARCHAR(30) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_item" (
    "id" BIGSERIAL NOT NULL,
    "document_id" BIGINT,
    "entity_type" VARCHAR(30) NOT NULL,
    "entity_id" BIGINT NOT NULL,
    "queue_type" VARCHAR(20) NOT NULL,
    "priority" SMALLINT NOT NULL DEFAULT 5,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "moderation_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_action" (
    "id" BIGSERIAL NOT NULL,
    "moderation_item_id" BIGINT NOT NULL,
    "staff_member_id" BIGINT NOT NULL,
    "action_type" VARCHAR(20) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_action_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "portfolio_item" (
    "id" BIGSERIAL NOT NULL,
    "worker_id" BIGINT NOT NULL,
    "item_type" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by" VARCHAR(20),
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
    "milestone_type" VARCHAR(30) NOT NULL,
    "achieved_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "evidence_ref" VARCHAR(500),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral" (
    "id" BIGSERIAL NOT NULL,
    "referrer_id" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "project_type" VARCHAR(100),
    "postcode_area" VARCHAR(10),
    "estimated_value" DECIMAL(12,2),
    "commission_pct" DECIMAL(5,2),
    "platform_fee_pct" DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    "client_name" VARCHAR(200),
    "client_phone" VARCHAR(20),
    "client_email" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_offer" (
    "id" BIGSERIAL NOT NULL,
    "referral_id" BIGINT NOT NULL,
    "recipient_id" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "responded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration" (
    "id" BIGSERIAL NOT NULL,
    "worker_id" BIGINT NOT NULL,
    "employer_id" BIGINT NOT NULL,
    "initiated_by" VARCHAR(10) NOT NULL,
    "referral_id" BIGINT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "project_type" VARCHAR(100),
    "site_postcode" VARCHAR(10),
    "agreed_amount" DECIMAL(12,2),
    "started_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flag_reason" VARCHAR(300),
    "confirmed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "collaboration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" BIGSERIAL NOT NULL,
    "collaboration_id" BIGINT NOT NULL,
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
CREATE TABLE "escrow_transaction" (
    "id" BIGSERIAL NOT NULL,
    "collaboration_id" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'CREATED',
    "job_amount" DECIMAL(12,2) NOT NULL,
    "platform_fee" DECIMAL(12,2) NOT NULL,
    "referral_commission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "worker_payout" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'GBP',
    "stripe_payment_intent_id" VARCHAR(200),
    "stripe_charge_id" VARCHAR(200),
    "stripe_transfer_id" VARCHAR(200),
    "stripe_refund_id" VARCHAR(200),
    "deposit_confirmed_at" TIMESTAMPTZ,
    "released_at" TIMESTAMPTZ,
    "refunded_at" TIMESTAMPTZ,
    "disputed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "escrow_transaction_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "account_email_key" ON "account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "account_google_id_key" ON "account"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_key" ON "refresh_token"("token");

-- CreateIndex
CREATE INDEX "refresh_token_account_id_idx" ON "refresh_token"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_profile_slug_key" ON "client_profile"("slug");

-- CreateIndex
CREATE INDEX "client_profile_postcode_area_idx" ON "client_profile"("postcode_area");

-- CreateIndex
CREATE INDEX "worker_profile_is_available_available_from_idx" ON "worker_profile"("is_available", "available_from");

-- CreateIndex
CREATE INDEX "worker_profile_rating_avg_rating_count_idx" ON "worker_profile"("rating_avg" DESC, "rating_count" DESC);

-- CreateIndex
CREATE INDEX "document_client_profile_id_status_idx" ON "document"("client_profile_id", "status");

-- CreateIndex
CREATE INDEX "moderation_item_queue_type_status_priority_idx" ON "moderation_item"("queue_type", "status", "priority");

-- CreateIndex
CREATE INDEX "moderation_item_entity_type_entity_id_idx" ON "moderation_item"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "moderation_action_moderation_item_id_idx" ON "moderation_action"("moderation_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "specialisation_name_key" ON "specialisation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "specialisation_slug_key" ON "specialisation"("slug");

-- CreateIndex
CREATE INDEX "worker_specialisation_specialisation_id_idx" ON "worker_specialisation"("specialisation_id");

-- CreateIndex
CREATE INDEX "portfolio_item_worker_id_sort_order_idx" ON "portfolio_item"("worker_id", "sort_order");

-- CreateIndex
CREATE INDEX "portfolio_media_portfolio_item_id_sort_order_idx" ON "portfolio_media"("portfolio_item_id", "sort_order");

-- CreateIndex
CREATE INDEX "verification_milestone_client_profile_id_idx" ON "verification_milestone"("client_profile_id");

-- CreateIndex
CREATE INDEX "referral_referrer_id_idx" ON "referral"("referrer_id");

-- CreateIndex
CREATE INDEX "referral_status_postcode_area_idx" ON "referral"("status", "postcode_area");

-- CreateIndex
CREATE INDEX "referral_offer_recipient_id_status_idx" ON "referral_offer"("recipient_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "referral_offer_referral_id_recipient_id_key" ON "referral_offer"("referral_id", "recipient_id");

-- CreateIndex
CREATE INDEX "collaboration_worker_id_idx" ON "collaboration"("worker_id");

-- CreateIndex
CREATE INDEX "collaboration_employer_id_idx" ON "collaboration"("employer_id");

-- CreateIndex
CREATE INDEX "collaboration_status_idx" ON "collaboration"("status");

-- CreateIndex
CREATE INDEX "review_collaboration_id_idx" ON "review"("collaboration_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_collaboration_id_reviewer_role_key" ON "review"("collaboration_id", "reviewer_role");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_transaction_collaboration_id_key" ON "escrow_transaction"("collaboration_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_transaction_stripe_payment_intent_id_key" ON "escrow_transaction"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_transaction_stripe_charge_id_key" ON "escrow_transaction"("stripe_charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_transaction_stripe_transfer_id_key" ON "escrow_transaction"("stripe_transfer_id");

-- CreateIndex
CREATE INDEX "user_subscription_client_profile_id_is_current_idx" ON "user_subscription"("client_profile_id", "is_current");

-- CreateIndex
CREATE INDEX "notification_account_id_created_at_idx" ON "notification"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_account_id_created_at_idx" ON "audit_log"("account_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profile" ADD CONSTRAINT "client_profile_id_fkey" FOREIGN KEY ("id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_profile" ADD CONSTRAINT "worker_profile_id_fkey" FOREIGN KEY ("id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_profile" ADD CONSTRAINT "employer_profile_id_fkey" FOREIGN KEY ("id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_member" ADD CONSTRAINT "staff_member_id_fkey" FOREIGN KEY ("id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_item" ADD CONSTRAINT "moderation_item_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_action" ADD CONSTRAINT "moderation_action_moderation_item_id_fkey" FOREIGN KEY ("moderation_item_id") REFERENCES "moderation_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_action" ADD CONSTRAINT "moderation_action_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_specialisation" ADD CONSTRAINT "worker_specialisation_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_specialisation" ADD CONSTRAINT "worker_specialisation_specialisation_id_fkey" FOREIGN KEY ("specialisation_id") REFERENCES "specialisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "referral" ADD CONSTRAINT "referral_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_offer" ADD CONSTRAINT "referral_offer_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_offer" ADD CONSTRAINT "referral_offer_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "worker_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration" ADD CONSTRAINT "collaboration_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration" ADD CONSTRAINT "collaboration_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employer_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration" ADD CONSTRAINT "collaboration_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_collaboration_id_fkey" FOREIGN KEY ("collaboration_id") REFERENCES "collaboration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_transaction" ADD CONSTRAINT "escrow_transaction_collaboration_id_fkey" FOREIGN KEY ("collaboration_id") REFERENCES "collaboration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription" ADD CONSTRAINT "user_subscription_client_profile_id_fkey" FOREIGN KEY ("client_profile_id") REFERENCES "client_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription" ADD CONSTRAINT "user_subscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
