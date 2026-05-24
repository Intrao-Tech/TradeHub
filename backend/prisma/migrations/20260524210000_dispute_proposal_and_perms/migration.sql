-- ============================================================
-- ESCROW DISPUTE PROPOSAL FLOW + new permissions
-- Staff proposes a split; both parties must accept before the
-- resolution executes. Either rejects → admin escalates to
-- ARBITRATION_PENDING (out-of-platform handling).
-- ============================================================

-- ─── 1. escrow_dispute_proposal table ─────────────────────────
CREATE TABLE "escrow_dispute_proposal" (
    "id"                     BIGSERIAL                    NOT NULL,
    "dispute_id"             BIGINT                       NOT NULL,
    "proposed_by_staff_id"   BIGINT                       NOT NULL,
    "worker_pct"             INTEGER                      NOT NULL,
    "employer_refund_pct"    INTEGER                      NOT NULL,
    "keep_platform_fee"      BOOLEAN     DEFAULT true     NOT NULL,
    "reasoning"              VARCHAR(2000)                NOT NULL,
    "status"                 VARCHAR(20) DEFAULT 'PENDING_RESPONSE' NOT NULL,
    "worker_decision"        VARCHAR(20) DEFAULT 'PENDING' NOT NULL,
    "worker_decided_at"      TIMESTAMPTZ                  NULL,
    "worker_decision_note"   VARCHAR(500)                 NULL,
    "employer_decision"      VARCHAR(20) DEFAULT 'PENDING' NOT NULL,
    "employer_decided_at"    TIMESTAMPTZ                  NULL,
    "employer_decision_note" VARCHAR(500)                 NULL,
    "proposed_at"            TIMESTAMPTZ DEFAULT NOW()    NOT NULL,
    "resolved_at"            TIMESTAMPTZ                  NULL,
    "execution_audit_id"     BIGINT                       NULL,
    CONSTRAINT "escrow_dispute_proposal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "escrow_dispute_proposal_split_sums_to_100"
        CHECK ("worker_pct" + "employer_refund_pct" = 100
            AND "worker_pct" >= 0 AND "worker_pct" <= 100),
    CONSTRAINT "escrow_dispute_proposal_dispute_id_fkey"
        FOREIGN KEY ("dispute_id") REFERENCES "escrow_dispute"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "escrow_dispute_proposal_proposed_by_staff_id_fkey"
        FOREIGN KEY ("proposed_by_staff_id") REFERENCES "staff_member"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "escrow_dispute_proposal_execution_audit_id_fkey"
        FOREIGN KEY ("execution_audit_id") REFERENCES "audit_log"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "escrow_dispute_proposal_dispute_id_status_idx"
    ON "escrow_dispute_proposal"("dispute_id", "status");
CREATE INDEX "escrow_dispute_proposal_proposed_by_staff_id_idx"
    ON "escrow_dispute_proposal"("proposed_by_staff_id");

-- Partial UNIQUE — at most one open proposal per dispute.
CREATE UNIQUE INDEX "escrow_dispute_proposal_one_pending_per_dispute"
    ON "escrow_dispute_proposal"("dispute_id")
    WHERE "status" = 'PENDING_RESPONSE';

-- ─── 2. New permissions ──────────────────────────────────────
INSERT INTO "permission" ("key", "category", "description") VALUES
  ('disputes.propose',  'escrow',  'Propose a worker/employer split on an open dispute. Both parties must accept before it executes.'),
  ('disputes.escalate', 'escrow',  'Escalate a dispute to ARBITRATION_PENDING when parties cannot agree on a proposal.'),
  ('support.initiate',  'support', 'Open a new support thread with a user from the admin Users page (sending the first message).');

-- ADMIN gets the new perms (all-perms invariant)
INSERT INTO "role_permission" ("staff_role_id", "permission_id")
SELECT r."id", p."id"
FROM "staff_role" r
CROSS JOIN "permission" p
WHERE r."name" = 'ADMIN'
  AND p."key" IN ('disputes.propose', 'disputes.escalate', 'support.initiate')
ON CONFLICT DO NOTHING;
