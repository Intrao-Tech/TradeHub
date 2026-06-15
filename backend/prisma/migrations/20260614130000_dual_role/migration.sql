-- Dual-role support: an account may hold BOTH a worker_profile and an
-- employer_profile and switch between cabinets (Upwork-style).
--
-- Schema delta (reviewed in Vertabelo, approved 2026-06-14):
--   * worker_profile.verification_level   — per-role tier for the worker cabinet
--   * employer_profile.verification_level — per-role tier for the employer cabinet
--   * collaboration CHECK                 — block self-hire (worker_id <> employer_id)
--
-- No new tables, no new/changed foreign keys. client_profile.verification_level
-- stays as the shared identity base (BASIC); the two new columns carry the
-- role-specific CERTIFIED/PREMIUM tiers. Defaults are safe for existing rows.

-- AlterTable: per-role verification tier (worker cabinet)
ALTER TABLE "worker_profile"
  ADD COLUMN "verification_level" VARCHAR(30) NOT NULL DEFAULT 'UNVERIFIED';

-- AlterTable: per-role verification tier (employer cabinet)
ALTER TABLE "employer_profile"
  ADD COLUMN "verification_level" VARCHAR(30) NOT NULL DEFAULT 'UNVERIFIED';

-- AddConstraint: no self-hire — a dual-role account cannot be both the worker
-- and the employer side of the same collaboration. App-layer guard exists too;
-- this is the DB-level backstop.
ALTER TABLE "collaboration"
  ADD CONSTRAINT "collaboration_no_self_hire" CHECK ("worker_id" <> "employer_id");
