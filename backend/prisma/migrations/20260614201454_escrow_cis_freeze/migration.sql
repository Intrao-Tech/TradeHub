-- AlterTable
ALTER TABLE "escrow_milestone" ADD COLUMN     "frozen_cis_amount" DECIMAL(12,2),
ADD COLUMN     "frozen_cis_mode" VARCHAR(10),
ADD COLUMN     "frozen_cis_rate" DECIMAL(5,2);
