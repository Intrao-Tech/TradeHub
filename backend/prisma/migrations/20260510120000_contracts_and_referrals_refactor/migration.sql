-- contracts_and_referrals_refactor
-- Drops legacy Subcontract (Referral / ReferralOffer), splits Collaboration
-- lifecycle into a new Contract entity, and replaces the
-- referral_commission_percent setting with the Account / Project ref model.
-- Dev DB only: owner accepted full reset (FEAT contracts-and-referrals 2026-05-10).

-- =========================================================================
-- 1. Drop legacy Subcontract (Referral / ReferralOffer) + dependent FK on
--    Collaboration.referral_id. No data migration — owner accepted drop.
-- =========================================================================

ALTER TABLE "referral_offer" DROP CONSTRAINT IF EXISTS "referral_offer_referral_id_fkey";
ALTER TABLE "referral_offer" DROP CONSTRAINT IF EXISTS "referral_offer_recipient_id_fkey";
ALTER TABLE "referral" DROP CONSTRAINT IF EXISTS "referral_referrer_id_fkey";
ALTER TABLE "collaboration" DROP CONSTRAINT IF EXISTS "collaboration_referral_id_fkey";

DROP TABLE IF EXISTS "referral_offer";
DROP TABLE IF EXISTS "referral";

-- =========================================================================
-- 2. Account: add referral_code (UNIQUE NOT NULL with backfill), referred_by_id,
--    referred_at. Self-FK to allow A.referred_by_id -> Account(id).
-- =========================================================================

ALTER TABLE "account" ADD COLUMN "referral_code" VARCHAR(16);
-- Backfill placeholder unique codes for existing rows (DEV-ONLY: collision risk
-- accepted, real codes generated on next signup or by re-running seed).
UPDATE "account"
   SET "referral_code" = upper(substr(md5(random()::text || id::text), 1, 4))
                       || '-'
                       || upper(substr(md5(random()::text || id::text), 5, 4));
ALTER TABLE "account" ALTER COLUMN "referral_code" SET NOT NULL;
CREATE UNIQUE INDEX "account_referral_code_key" ON "account"("referral_code");
CREATE INDEX "account_referral_code_idx" ON "account"("referral_code");

ALTER TABLE "account" ADD COLUMN "referred_by_id" BIGINT;
ALTER TABLE "account" ADD COLUMN "referred_at" TIMESTAMPTZ;
CREATE INDEX "account_referred_by_id_idx" ON "account"("referred_by_id");
ALTER TABLE "account" ADD CONSTRAINT "account_referred_by_id_fkey"
  FOREIGN KEY ("referred_by_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================================
-- 3. Create new Contract table.
-- =========================================================================

CREATE TABLE "contract" (
    "id" BIGSERIAL PRIMARY KEY,
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
    "updated_at" TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX "contract_collaboration_id_position_key" ON "contract"("collaboration_id", "position");
CREATE INDEX "contract_status_idx" ON "contract"("status");
CREATE INDEX "contract_project_referrer_id_idx" ON "contract"("project_referrer_id");

-- =========================================================================
-- 4. Slim Collaboration: drop lifecycle columns, add relationship anchors.
-- =========================================================================

ALTER TABLE "collaboration" DROP CONSTRAINT IF EXISTS "collaboration_job_post_id_fkey";

DROP INDEX IF EXISTS "collaboration_status_idx";

ALTER TABLE "collaboration"
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "agreed_amount",
  DROP COLUMN IF EXISTS "project_type",
  DROP COLUMN IF EXISTS "site_postcode",
  DROP COLUMN IF EXISTS "job_post_id",
  DROP COLUMN IF EXISTS "referral_id",
  DROP COLUMN IF EXISTS "started_at",
  DROP COLUMN IF EXISTS "ended_at",
  DROP COLUMN IF EXISTS "confirmed_at",
  DROP COLUMN IF EXISTS "flagged",
  DROP COLUMN IF EXISTS "flag_reason",
  DROP COLUMN IF EXISTS "initiated_by";

ALTER TABLE "collaboration" ADD COLUMN "last_contract_id" BIGINT;
ALTER TABLE "collaboration" ADD COLUMN "first_contracted_at" TIMESTAMPTZ;

ALTER TABLE "collaboration" ADD CONSTRAINT "collaboration_last_contract_id_fkey"
  FOREIGN KEY ("last_contract_id") REFERENCES "contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================================
-- 5. Contract FKs (collaboration + job_post + project_referrer).
-- =========================================================================

ALTER TABLE "contract" ADD CONSTRAINT "contract_collaboration_id_fkey"
  FOREIGN KEY ("collaboration_id") REFERENCES "collaboration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contract" ADD CONSTRAINT "contract_job_post_id_fkey"
  FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contract" ADD CONSTRAINT "contract_project_referrer_id_fkey"
  FOREIGN KEY ("project_referrer_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================================
-- 6. Review: collaboration_id -> contract_id.
-- =========================================================================

ALTER TABLE "review" DROP CONSTRAINT IF EXISTS "review_collaboration_id_fkey";
DROP INDEX IF EXISTS "review_collaboration_id_idx";
DROP INDEX IF EXISTS "review_collaboration_id_reviewer_role_key";

ALTER TABLE "review" DROP COLUMN "collaboration_id";
ALTER TABLE "review" ADD COLUMN "contract_id" BIGINT NOT NULL;

CREATE INDEX "review_contract_id_idx" ON "review"("contract_id");
CREATE UNIQUE INDEX "review_contract_id_reviewer_role_key" ON "review"("contract_id", "reviewer_role");

ALTER TABLE "review" ADD CONSTRAINT "review_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =========================================================================
-- 7. EscrowTransaction: collaboration_id -> contract_id; drop end_* fields
--    (now on Contract).
-- =========================================================================

ALTER TABLE "escrow_transaction" DROP CONSTRAINT IF EXISTS "escrow_transaction_collaboration_id_fkey";
DROP INDEX IF EXISTS "escrow_transaction_collaboration_id_key";

ALTER TABLE "escrow_transaction"
  DROP COLUMN "collaboration_id",
  DROP COLUMN IF EXISTS "end_initiated_at",
  DROP COLUMN IF EXISTS "end_initiated_by",
  DROP COLUMN IF EXISTS "ended_at";

ALTER TABLE "escrow_transaction" ADD COLUMN "contract_id" BIGINT NOT NULL;
CREATE UNIQUE INDEX "escrow_transaction_contract_id_key" ON "escrow_transaction"("contract_id");
ALTER TABLE "escrow_transaction" ADD CONSTRAINT "escrow_transaction_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =========================================================================
-- 8. PlatformSetting: drop legacy referral_commission_percent, add Account
--    + Project ref columns.
-- =========================================================================

ALTER TABLE "platform_setting" DROP COLUMN IF EXISTS "referral_commission_percent";

ALTER TABLE "platform_setting"
  ADD COLUMN "account_referral_pct" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN "account_referral_window_months" INTEGER DEFAULT 12,
  ADD COLUMN "project_referral_w2w_pct" DECIMAL(5,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN "project_referral_e2e_pct" DECIMAL(5,2) NOT NULL DEFAULT 2.00;

-- =========================================================================
-- 9. PendingReferralPayout: add type (required) + contract_id (nullable FK).
-- =========================================================================

ALTER TABLE "pending_referral_payout"
  ADD COLUMN "contract_id" BIGINT,
  ADD COLUMN "type" VARCHAR(20);

-- Backfill existing rows (legacy = ACCOUNT type), then enforce NOT NULL.
UPDATE "pending_referral_payout" SET "type" = 'ACCOUNT' WHERE "type" IS NULL;
ALTER TABLE "pending_referral_payout" ALTER COLUMN "type" SET NOT NULL;

ALTER TABLE "pending_referral_payout" ADD CONSTRAINT "pending_referral_payout_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================================
-- 10. JobApplication: project_referrer_id, project_referrer_role.
-- =========================================================================

ALTER TABLE "job_application"
  ADD COLUMN "project_referrer_id" BIGINT,
  ADD COLUMN "project_referrer_role" VARCHAR(10);

CREATE INDEX "job_application_project_referrer_id_idx" ON "job_application"("project_referrer_id");

ALTER TABLE "job_application" ADD CONSTRAINT "job_application_project_referrer_id_fkey"
  FOREIGN KEY ("project_referrer_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
