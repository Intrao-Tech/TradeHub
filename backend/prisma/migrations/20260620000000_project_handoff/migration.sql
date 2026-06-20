-- AlterTable
ALTER TABLE "job_application" ADD COLUMN     "handoff_id" BIGINT;

-- CreateTable
CREATE TABLE "job_handoff" (
    "id" BIGSERIAL NOT NULL,
    "job_post_id" BIGINT NOT NULL,
    "from_worker_id" BIGINT NOT NULL,
    "to_worker_id" BIGINT,
    "token" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "message" VARCHAR(1000),
    "earn_commission" BOOLEAN NOT NULL DEFAULT true,
    "claimed_by_id" BIGINT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "job_handoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_handoff_token_key" ON "job_handoff"("token");

-- CreateIndex
CREATE INDEX "job_handoff_job_post_id_idx" ON "job_handoff"("job_post_id");

-- CreateIndex
CREATE INDEX "job_handoff_from_worker_id_idx" ON "job_handoff"("from_worker_id");

-- CreateIndex
CREATE INDEX "job_handoff_to_worker_id_status_idx" ON "job_handoff"("to_worker_id", "status");

-- CreateIndex
CREATE INDEX "job_handoff_claimed_by_id_job_post_id_idx" ON "job_handoff"("claimed_by_id", "job_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_application_handoff_id_key" ON "job_application"("handoff_id");

-- AddForeignKey
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_handoff_id_fkey" FOREIGN KEY ("handoff_id") REFERENCES "job_handoff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_handoff" ADD CONSTRAINT "job_handoff_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_handoff" ADD CONSTRAINT "job_handoff_from_worker_id_fkey" FOREIGN KEY ("from_worker_id") REFERENCES "worker_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_handoff" ADD CONSTRAINT "job_handoff_to_worker_id_fkey" FOREIGN KEY ("to_worker_id") REFERENCES "worker_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_handoff" ADD CONSTRAINT "job_handoff_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "worker_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

