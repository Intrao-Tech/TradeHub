-- AlterTable
ALTER TABLE "client_profile" ADD COLUMN     "connect_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "connect_payouts_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "escrow_transaction" ADD COLUMN     "end_initiated_at" TIMESTAMPTZ,
ADD COLUMN     "end_initiated_by" BIGINT,
ADD COLUMN     "ended_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "escrow_milestone" (
    "id" BIGSERIAL NOT NULL,
    "escrow_id" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
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
    "stripe_pi_id" VARCHAR(200),
    "stripe_charge_id" VARCHAR(200),
    "stripe_transfer_id" VARCHAR(200),
    "stripe_refund_id" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "escrow_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_setting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "client_marketplace_fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 5.0,
    "freelancer_service_fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 10.0,
    "referral_commission_percent" DECIMAL(5,2) NOT NULL DEFAULT 0.5,
    "stripe_fee_passthrough" VARCHAR(20) NOT NULL DEFAULT 'EMPLOYER_PAYS',
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" BIGINT,

    CONSTRAINT "platform_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_dispute" (
    "id" BIGSERIAL NOT NULL,
    "milestone_id" BIGINT NOT NULL,
    "filed_by" BIGINT NOT NULL,
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
CREATE TABLE "pending_referral_payout" (
    "id" BIGSERIAL NOT NULL,
    "referrer_client_profile_id" BIGINT NOT NULL,
    "milestone_id" BIGINT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'GBP',
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "stripe_transfer_id" VARCHAR(200),
    "failure_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ,

    CONSTRAINT "pending_referral_payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "escrow_milestone_stripe_pi_id_key" ON "escrow_milestone"("stripe_pi_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_milestone_stripe_charge_id_key" ON "escrow_milestone"("stripe_charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_milestone_stripe_transfer_id_key" ON "escrow_milestone"("stripe_transfer_id");

-- CreateIndex
CREATE INDEX "escrow_milestone_status_idx" ON "escrow_milestone"("status");

-- CreateIndex
CREATE INDEX "escrow_milestone_escrow_id_idx" ON "escrow_milestone"("escrow_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_milestone_escrow_id_position_key" ON "escrow_milestone"("escrow_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_dispute_milestone_id_key" ON "escrow_dispute"("milestone_id");

-- CreateIndex
CREATE INDEX "escrow_dispute_status_idx" ON "escrow_dispute"("status");

-- CreateIndex
CREATE INDEX "pending_referral_payout_referrer_client_profile_id_status_idx" ON "pending_referral_payout"("referrer_client_profile_id", "status");

-- AddForeignKey
ALTER TABLE "escrow_milestone" ADD CONSTRAINT "escrow_milestone_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "escrow_transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_setting" ADD CONSTRAINT "platform_setting_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_dispute" ADD CONSTRAINT "escrow_dispute_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "escrow_milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_dispute" ADD CONSTRAINT "escrow_dispute_filed_by_fkey" FOREIGN KEY ("filed_by") REFERENCES "client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_dispute" ADD CONSTRAINT "escrow_dispute_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_referral_payout" ADD CONSTRAINT "pending_referral_payout_referrer_client_profile_id_fkey" FOREIGN KEY ("referrer_client_profile_id") REFERENCES "client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_referral_payout" ADD CONSTRAINT "pending_referral_payout_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "escrow_milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Seed singleton platform_setting row
INSERT INTO "platform_setting" ("id", "updated_at") VALUES (1, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
