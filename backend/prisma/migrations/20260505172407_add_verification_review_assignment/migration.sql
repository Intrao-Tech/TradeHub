-- AlterTable
ALTER TABLE "document" ADD COLUMN     "assigned_to" BIGINT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "rejection_reason" VARCHAR(500),
ADD COLUMN     "reviewed_by" BIGINT,
ALTER COLUMN "doc_type" SET DATA TYPE VARCHAR(40);

-- AlterTable
ALTER TABLE "staff_member" ADD COLUMN     "is_on_duty" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "verification_milestone" ADD COLUMN     "staff_member_id" BIGINT,
ALTER COLUMN "milestone_type" SET DATA TYPE VARCHAR(40);

-- CreateIndex
CREATE INDEX "document_status_created_at_idx" ON "document"("status", "created_at");

-- CreateIndex
CREATE INDEX "document_assigned_to_status_idx" ON "document"("assigned_to", "status");

-- CreateIndex
CREATE INDEX "staff_member_is_on_duty_idx" ON "staff_member"("is_on_duty");

-- CreateIndex
CREATE INDEX "verification_milestone_client_profile_id_milestone_type_idx" ON "verification_milestone"("client_profile_id", "milestone_type");

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_milestone" ADD CONSTRAINT "verification_milestone_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
