-- CreateTable
CREATE TABLE "saved_job" (
    "worker_id" BIGINT NOT NULL,
    "job_post_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_job_pkey" PRIMARY KEY ("worker_id","job_post_id")
);

-- CreateIndex
CREATE INDEX "saved_job_job_post_id_idx" ON "saved_job"("job_post_id");

-- CreateIndex
CREATE INDEX "saved_job_worker_id_created_at_idx" ON "saved_job"("worker_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "saved_job" ADD CONSTRAINT "saved_job_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_job" ADD CONSTRAINT "saved_job_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
