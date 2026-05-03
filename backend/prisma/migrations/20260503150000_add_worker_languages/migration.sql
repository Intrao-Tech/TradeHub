-- AlterTable
ALTER TABLE "worker_profile" ADD COLUMN "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
