-- milestone_request_attachments_worker_payout
-- Adds:
--   - EscrowMilestone.description + created_by_role (REQUESTED status uses these)
--   - EscrowMilestoneAttachment table (3-cap, two phases: CREATION / SUBMISSION)
--   - PendingWorkerPayout table (release goes through even if worker hasn't
--     onboarded Stripe Connect — money parks in platform balance, swept on
--     account.updated → payouts_enabled).

-- 1. EscrowMilestone columns
ALTER TABLE "escrow_milestone"
  ADD COLUMN "description" VARCHAR(2000),
  ADD COLUMN "created_by_role" VARCHAR(10) NOT NULL DEFAULT 'EMPLOYER';

-- 2. EscrowMilestoneAttachment
CREATE TABLE "escrow_milestone_attachment" (
    "id" BIGSERIAL PRIMARY KEY,
    "milestone_id" BIGINT NOT NULL,
    "uploaded_by_id" BIGINT NOT NULL,
    "phase" VARCHAR(15) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "escrow_milestone_attachment_milestone_id_idx"
  ON "escrow_milestone_attachment"("milestone_id");
CREATE INDEX "escrow_milestone_attachment_uploaded_by_id_idx"
  ON "escrow_milestone_attachment"("uploaded_by_id");

ALTER TABLE "escrow_milestone_attachment"
  ADD CONSTRAINT "escrow_milestone_attachment_milestone_id_fkey"
  FOREIGN KEY ("milestone_id") REFERENCES "escrow_milestone"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "escrow_milestone_attachment"
  ADD CONSTRAINT "escrow_milestone_attachment_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "client_profile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. PendingWorkerPayout
CREATE TABLE "pending_worker_payout" (
    "id" BIGSERIAL PRIMARY KEY,
    "worker_client_profile_id" BIGINT NOT NULL,
    "milestone_id" BIGINT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'GBP',
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "stripe_transfer_id" VARCHAR(200),
    "failure_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ
);

CREATE INDEX "pending_worker_payout_worker_status_idx"
  ON "pending_worker_payout"("worker_client_profile_id", "status");

ALTER TABLE "pending_worker_payout"
  ADD CONSTRAINT "pending_worker_payout_worker_fkey"
  FOREIGN KEY ("worker_client_profile_id") REFERENCES "client_profile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pending_worker_payout"
  ADD CONSTRAINT "pending_worker_payout_milestone_fkey"
  FOREIGN KEY ("milestone_id") REFERENCES "escrow_milestone"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
