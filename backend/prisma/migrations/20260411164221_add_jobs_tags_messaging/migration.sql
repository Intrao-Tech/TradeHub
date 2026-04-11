-- AlterTable
ALTER TABLE "collaboration" ADD COLUMN     "job_post_id" BIGINT;

-- CreateTable
CREATE TABLE "tag" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_tag" (
    "worker_id" BIGINT NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "worker_tag_pkey" PRIMARY KEY ("worker_id","tag_id")
);

-- CreateTable
CREATE TABLE "job_post" (
    "id" BIGSERIAL NOT NULL,
    "employer_id" BIGINT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "postcode_area" VARCHAR(10),
    "site_address" VARCHAR(300),
    "pay_type" VARCHAR(10) NOT NULL,
    "day_rate_min" DECIMAL(8,2),
    "day_rate_max" DECIMAL(8,2),
    "fixed_price" DECIMAL(12,2),
    "duration_days" INTEGER,
    "start_date" TIMESTAMPTZ,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "is_urgent" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "job_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_post_specialisation" (
    "job_post_id" BIGINT NOT NULL,
    "specialisation_id" INTEGER NOT NULL,

    CONSTRAINT "job_post_specialisation_pkey" PRIMARY KEY ("job_post_id","specialisation_id")
);

-- CreateTable
CREATE TABLE "job_post_tag" (
    "job_post_id" BIGINT NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "job_post_tag_pkey" PRIMARY KEY ("job_post_id","tag_id")
);

-- CreateTable
CREATE TABLE "job_application" (
    "id" BIGSERIAL NOT NULL,
    "job_post_id" BIGINT NOT NULL,
    "worker_id" BIGINT NOT NULL,
    "initiated_by" VARCHAR(10) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "cover_message" TEXT,
    "proposed_rate" DECIMAL(8,2),
    "responded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "job_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" BIGSERIAL NOT NULL,
    "last_message_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participant" (
    "conversation_id" BIGINT NOT NULL,
    "account_id" BIGINT NOT NULL,
    "last_read_at" TIMESTAMPTZ,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participant_pkey" PRIMARY KEY ("conversation_id","account_id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" BIGSERIAL NOT NULL,
    "conversation_id" BIGINT NOT NULL,
    "sender_id" BIGINT NOT NULL,
    "content" TEXT NOT NULL,
    "message_type" VARCHAR(20) NOT NULL DEFAULT 'TEXT',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tag_name_key" ON "tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tag_slug_key" ON "tag"("slug");

-- CreateIndex
CREATE INDEX "worker_tag_tag_id_idx" ON "worker_tag"("tag_id");

-- CreateIndex
CREATE INDEX "job_post_employer_id_idx" ON "job_post"("employer_id");

-- CreateIndex
CREATE INDEX "job_post_status_postcode_area_idx" ON "job_post"("status", "postcode_area");

-- CreateIndex
CREATE INDEX "job_post_specialisation_specialisation_id_idx" ON "job_post_specialisation"("specialisation_id");

-- CreateIndex
CREATE INDEX "job_post_tag_tag_id_idx" ON "job_post_tag"("tag_id");

-- CreateIndex
CREATE INDEX "job_application_job_post_id_status_idx" ON "job_application"("job_post_id", "status");

-- CreateIndex
CREATE INDEX "job_application_worker_id_status_idx" ON "job_application"("worker_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_application_job_post_id_worker_id_key" ON "job_application"("job_post_id", "worker_id");

-- CreateIndex
CREATE INDEX "conversation_participant_account_id_idx" ON "conversation_participant"("account_id");

-- CreateIndex
CREATE INDEX "message_conversation_id_created_at_idx" ON "message"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "collaboration" ADD CONSTRAINT "collaboration_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_tag" ADD CONSTRAINT "worker_tag_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_tag" ADD CONSTRAINT "worker_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post" ADD CONSTRAINT "job_post_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employer_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_specialisation" ADD CONSTRAINT "job_post_specialisation_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_specialisation" ADD CONSTRAINT "job_post_specialisation_specialisation_id_fkey" FOREIGN KEY ("specialisation_id") REFERENCES "specialisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_tag" ADD CONSTRAINT "job_post_tag_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_post_tag" ADD CONSTRAINT "job_post_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_job_post_id_fkey" FOREIGN KEY ("job_post_id") REFERENCES "job_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_application" ADD CONSTRAINT "job_application_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker_profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_sender_id_fkey" FOREIGN KEY ("conversation_id", "sender_id") REFERENCES "conversation_participant"("conversation_id", "account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
