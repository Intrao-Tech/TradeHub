-- AlterTable: link conversation to collaboration (nullable)
ALTER TABLE "conversation" ADD COLUMN "collaboration_id" BIGINT;

-- CreateIndex: at most one chat thread per collaboration
CREATE UNIQUE INDEX "conversation_collaboration_id_key" ON "conversation"("collaboration_id");

-- AddForeignKey: leave conversation orphaned if collab is deleted
ALTER TABLE "conversation"
  ADD CONSTRAINT "conversation_collaboration_id_fkey"
  FOREIGN KEY ("collaboration_id") REFERENCES "collaboration"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: message attachments mirror job_attachment shape
CREATE TABLE "message_attachment" (
    "id" BIGSERIAL NOT NULL,
    "message_id" BIGINT,
    "uploaded_by_id" BIGINT NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_attachment_message_id_idx" ON "message_attachment"("message_id");

-- CreateIndex
CREATE INDEX "message_attachment_uploaded_by_id_idx" ON "message_attachment"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "message_attachment_created_at_idx" ON "message_attachment"("created_at");

-- AddForeignKey
ALTER TABLE "message_attachment"
  ADD CONSTRAINT "message_attachment_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "message"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachment"
  ADD CONSTRAINT "message_attachment_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "client_profile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
