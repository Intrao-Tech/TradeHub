-- CreateTable
CREATE TABLE "saved_worker" (
    "employer_id" BIGINT NOT NULL,
    "worker_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_worker_pkey" PRIMARY KEY ("employer_id","worker_id")
);

-- CreateIndex
CREATE INDEX "saved_worker_worker_id_idx" ON "saved_worker"("worker_id");

-- CreateIndex
CREATE INDEX "saved_worker_employer_id_created_at_idx" ON "saved_worker"("employer_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "saved_worker" ADD CONSTRAINT "saved_worker_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employer_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_worker" ADD CONSTRAINT "saved_worker_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
