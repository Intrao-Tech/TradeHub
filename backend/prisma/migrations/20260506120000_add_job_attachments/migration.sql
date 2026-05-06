-- CreateTable
CREATE TABLE "job_attachment" (
    "id" BIGSERIAL NOT NULL,
    "uploaded_by_id" BIGINT NOT NULL,
    "job_post_id" BIGINT,
    "job_application_id" BIGINT,
    "file_url" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_attachment_uploaded_by_id_idx" ON "job_attachment"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "job_attachment_job_post_id_idx" ON "job_attachment"("job_post_id");

-- CreateIndex
CREATE INDEX "job_attachment_job_application_id_idx" ON "job_attachment"("job_application_id");

-- CreateIndex
CREATE INDEX "job_attachment_created_at_idx" ON "job_attachment"("created_at");

-- AddForeignKey
ALTER TABLE "job_attachment"
  ADD CONSTRAINT "job_attachment_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "client_profile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_attachment"
  ADD CONSTRAINT "job_attachment_job_post_id_fkey"
  FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_attachment"
  ADD CONSTRAINT "job_attachment_job_application_id_fkey"
  FOREIGN KEY ("job_application_id") REFERENCES "job_application"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
