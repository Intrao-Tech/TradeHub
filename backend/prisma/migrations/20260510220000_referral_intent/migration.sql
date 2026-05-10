-- ReferralIntent: server-side replacement for cookie-based ref attribution.
-- A row is written when a logged-in user clicks a project ref link
-- (`/jobs/X?ref=` or `/workers/X?ref=`); later, qualifying actions
-- (apply, hire) consume the latest non-expired intent and copy attribution
-- onto durable rows. Intents auto-expire after 30 days.

CREATE TABLE "referral_intent" (
    "id" BIGSERIAL NOT NULL,
    "actor_account_id" BIGINT NOT NULL,
    "referrer_account_id" BIGINT NOT NULL,
    "target_role" VARCHAR(10) NOT NULL,
    "target_id" BIGINT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_intent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "referral_intent_actor_account_id_target_role_target_id_expir_idx"
  ON "referral_intent" ("actor_account_id", "target_role", "target_id", "expires_at");

ALTER TABLE "referral_intent"
  ADD CONSTRAINT "referral_intent_actor_account_id_fkey"
  FOREIGN KEY ("actor_account_id") REFERENCES "account" ("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "referral_intent"
  ADD CONSTRAINT "referral_intent_referrer_account_id_fkey"
  FOREIGN KEY ("referrer_account_id") REFERENCES "account" ("id")
  ON UPDATE CASCADE ON DELETE CASCADE;
