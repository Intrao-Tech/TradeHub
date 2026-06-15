-- CIS (HMRC Construction Industry Scheme) — V1 (ASSIST) + V2 (MANAGED, mocked).
--
-- V1 = columns only (CIS data is attributes of existing entities — no new
-- tables). V2 = the cis_return / cis_return_line tables + payment bucketing &
-- link. Purely ADDITIVE: nothing existing is restructured or migrated. The
-- platform_setting.cis_handling_mode switch (+ per-employer override) flips
-- runtime behaviour V1 (ASSIST) ↔ V2 (MANAGED). In V2-MOCKED the HMRC submit
-- and bank remittance are simulated until HMRC recognition + legal sign-off.

-- ── V1 columns ────────────────────────────────────────────────────────
ALTER TABLE "worker_profile"
  ADD COLUMN "cis_status" VARCHAR(20) NOT NULL DEFAULT 'NONE',
  ADD COLUMN "cis_rate" SMALLINT,
  ADD COLUMN "cis_verification_number" VARCHAR(20),
  ADD COLUMN "cis_verified_at" TIMESTAMPTZ;

ALTER TABLE "employer_profile"
  ADD COLUMN "is_cis_contractor" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cis_handling_mode_override" VARCHAR(20);

ALTER TABLE "escrow_milestone"
  ADD COLUMN "labour_amount" DECIMAL(12,2),
  ADD COLUMN "materials_amount" DECIMAL(12,2);

ALTER TABLE "platform_setting"
  ADD COLUMN "cis_handling_mode" VARCHAR(20) NOT NULL DEFAULT 'ASSIST';

ALTER TABLE "payment"
  ADD COLUMN "cis_tax_year" SMALLINT,
  ADD COLUMN "cis_tax_month" SMALLINT,
  ADD COLUMN "cis_return_id" BIGINT;

-- ── V2 tables ─────────────────────────────────────────────────────────
CREATE TABLE "cis_return" (
    "id" BIGSERIAL NOT NULL,
    "tax_year" SMALLINT NOT NULL,
    "tax_month" SMALLINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "is_nil_return" BOOLEAN NOT NULL DEFAULT false,
    "total_deducted" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hmrc_irmark" VARCHAR(200),
    "hmrc_submission_ref" VARCHAR(100),
    "submitted_at" TIMESTAMPTZ,
    "accepted_at" TIMESTAMPTZ,
    "remitted_at" TIMESTAMPTZ,
    "remittance_ref" VARCHAR(100),
    "is_mocked" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cis_return_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cis_return_line" (
    "id" BIGSERIAL NOT NULL,
    "cis_return_id" BIGINT NOT NULL,
    "subcontractor_client_profile_id" BIGINT NOT NULL,
    "verification_number" VARCHAR(20),
    "gross_paid" DECIMAL(12,2) NOT NULL,
    "cost_of_materials" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount_deducted" DECIMAL(12,2) NOT NULL,
    "cis_rate" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cis_return_line_pkey" PRIMARY KEY ("id")
);

-- ── indexes ───────────────────────────────────────────────────────────
CREATE INDEX "payment_cis_tax_year_cis_tax_month_type_idx" ON "payment"("cis_tax_year", "cis_tax_month", "type");
CREATE UNIQUE INDEX "cis_return_tax_year_tax_month_key" ON "cis_return"("tax_year", "tax_month");
CREATE INDEX "cis_return_status_idx" ON "cis_return"("status");
CREATE INDEX "cis_return_line_cis_return_id_idx" ON "cis_return_line"("cis_return_id");
CREATE INDEX "cis_return_line_subcontractor_client_profile_id_idx" ON "cis_return_line"("subcontractor_client_profile_id");

-- ── foreign keys ──────────────────────────────────────────────────────
ALTER TABLE "payment" ADD CONSTRAINT "payment_cis_return_id_fkey" FOREIGN KEY ("cis_return_id") REFERENCES "cis_return"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cis_return_line" ADD CONSTRAINT "cis_return_line_cis_return_id_fkey" FOREIGN KEY ("cis_return_id") REFERENCES "cis_return"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cis_return_line" ADD CONSTRAINT "cis_return_line_subcontractor_client_profile_id_fkey" FOREIGN KEY ("subcontractor_client_profile_id") REFERENCES "client_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
