-- ============================================
-- TradeHub UK - Database Schema v7
-- PostgreSQL 16 | Redgate Data Modeler
-- IDs: BIGSERIAL / BIGINT
-- Dates: TIMESTAMPTZ everywhere
-- ============================================


-- ============================================
-- 1. ACCOUNT
-- ============================================

CREATE TABLE account (
    id              BIGSERIAL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255),
    google_id       VARCHAR(100),
    phone           VARCHAR(20),
    phone_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ,

    CONSTRAINT account_email_unique UNIQUE (email),
    CONSTRAINT account_google_id_unique UNIQUE (google_id),
    CONSTRAINT chk_account_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED'))
);


-- ============================================
-- 2. REFRESH TOKEN -> account
-- ============================================

CREATE TABLE refresh_token (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL,
    token       VARCHAR(500) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT refresh_token_token_unique UNIQUE (token),
    CONSTRAINT fk_rt_account FOREIGN KEY (account_id)
        REFERENCES account(id) ON DELETE CASCADE
);

CREATE INDEX idx_rt_account ON refresh_token (account_id);


-- ============================================
-- 3. CLIENT PROFILE (shared PK = account.id)
-- ============================================

CREATE TABLE client_profile (
    id                          BIGINT PRIMARY KEY,
    display_name                VARCHAR(150) NOT NULL,
    slug                        VARCHAR(150) NOT NULL,
    avatar_url                  VARCHAR(500),
    bio                         TEXT,
    city                        VARCHAR(100),
    postcode_area               VARCHAR(10),
    verification_level          VARCHAR(30) NOT NULL DEFAULT 'UNVERIFIED',
    stripe_connect_account_id   VARCHAR(200),
    stripe_onboarding_complete  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT client_profile_slug_unique UNIQUE (slug),
    CONSTRAINT fk_cp_account FOREIGN KEY (id)
        REFERENCES account(id) ON DELETE CASCADE,
    CONSTRAINT chk_cp_verification CHECK (verification_level IN (
        'UNVERIFIED', 'IDENTITY_VERIFIED', 'SKILL_CERTIFIED',
        'PLATFORM_TRUSTED', 'HMRC_VERIFIED',
        'COMPANY_VERIFIED', 'INSURANCE_VERIFIED'
    ))
);

CREATE INDEX idx_cp_postcode ON client_profile (postcode_area);


-- ============================================
-- 4. WORKER PROFILE (shared PK = client_profile.id)
-- ============================================

CREATE TABLE worker_profile (
    id                  BIGINT PRIMARY KEY,
    years_experience    SMALLINT,
    day_rate_min        DECIMAL(8, 2),
    day_rate_max        DECIMAL(8, 2),
    available_from      TIMESTAMPTZ,
    is_available        BOOLEAN NOT NULL DEFAULT TRUE,
    rating_avg          DECIMAL(3, 2) NOT NULL DEFAULT 0,
    rating_count        INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_wp_client FOREIGN KEY (id)
        REFERENCES client_profile(id) ON DELETE CASCADE
);

CREATE INDEX idx_wp_available ON worker_profile (is_available, available_from);
CREATE INDEX idx_wp_rating ON worker_profile (rating_avg DESC, rating_count DESC);


-- ============================================
-- 5. EMPLOYER PROFILE (shared PK = client_profile.id)
-- ============================================

CREATE TABLE employer_profile (
    id                  BIGINT PRIMARY KEY,
    company_name        VARCHAR(200),
    company_number      VARCHAR(20),
    team_size           SMALLINT,
    rating_avg          DECIMAL(3, 2) NOT NULL DEFAULT 0,
    rating_count        INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ep_client FOREIGN KEY (id)
        REFERENCES client_profile(id) ON DELETE CASCADE
);


-- ============================================
-- 6. STAFF MEMBER (shared PK = account.id)
-- ============================================

CREATE TABLE staff_member (
    id              BIGINT PRIMARY KEY,
    display_name    VARCHAR(100) NOT NULL,
    staff_role      VARCHAR(20) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_sm_account FOREIGN KEY (id)
        REFERENCES account(id) ON DELETE CASCADE,
    CONSTRAINT chk_staff_role CHECK (staff_role IN ('ADMIN', 'MODERATOR'))
);


-- ============================================
-- 7. DOCUMENT (file storage -> client_profile)
-- ============================================

CREATE TABLE document (
    id                  BIGSERIAL PRIMARY KEY,
    client_profile_id   BIGINT NOT NULL,
    doc_type            VARCHAR(30) NOT NULL,
    file_url            VARCHAR(500) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_doc_client FOREIGN KEY (client_profile_id)
        REFERENCES client_profile(id) ON DELETE CASCADE,
    CONSTRAINT chk_doc_type CHECK (doc_type IN (
        'ID_PHOTO', 'SELFIE', 'INSURANCE', 'CSCS_CARD',
        'GAS_SAFE_CERT', 'NICEIC_CERT', 'COMPANY_LETTERHEAD',
        'PROJECT_PHOTO', 'OTHER'
    )),
    CONSTRAINT chk_doc_status CHECK (status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'))
);

CREATE INDEX idx_doc_client ON document (client_profile_id, status);


-- ============================================
-- 8. MODERATION ITEM (staff work queue)
-- ============================================

CREATE TABLE moderation_item (
    id              BIGSERIAL PRIMARY KEY,
    document_id     BIGINT,
    entity_type     VARCHAR(30) NOT NULL,
    entity_id       BIGINT NOT NULL,
    queue_type      VARCHAR(20) NOT NULL,
    priority        SMALLINT NOT NULL DEFAULT 5,
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_mi_document FOREIGN KEY (document_id)
        REFERENCES document(id),
    CONSTRAINT chk_mi_queue CHECK (queue_type IN (
        'VERIFICATION', 'REVIEW', 'DISPUTE', 'REFERRAL', 'FRAUD'
    )),
    CONSTRAINT chk_mi_status CHECK (status IN (
        'OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED'
    ))
);

CREATE INDEX idx_mi_queue ON moderation_item (queue_type, status, priority);
CREATE INDEX idx_mi_entity ON moderation_item (entity_type, entity_id);


-- ============================================
-- 9. MODERATION ACTION (audit trail -> moderation_item + staff_member)
-- ============================================

CREATE TABLE moderation_action (
    id                  BIGSERIAL PRIMARY KEY,
    moderation_item_id  BIGINT NOT NULL,
    staff_member_id     BIGINT NOT NULL,
    action_type         VARCHAR(20) NOT NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ma_item FOREIGN KEY (moderation_item_id)
        REFERENCES moderation_item(id) ON DELETE CASCADE,
    CONSTRAINT fk_ma_staff FOREIGN KEY (staff_member_id)
        REFERENCES staff_member(id),
    CONSTRAINT chk_ma_type CHECK (action_type IN (
        'ASSIGNED', 'STARTED', 'RESOLVED', 'DISMISSED', 'ESCALATED', 'COMMENTED'
    ))
);

CREATE INDEX idx_ma_item ON moderation_action (moderation_item_id);


-- ============================================
-- 10. SPECIALISATION (reference data)
-- ============================================

CREATE TABLE specialisation (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(100) NOT NULL,
    slug    VARCHAR(100) NOT NULL,

    CONSTRAINT specialisation_name_unique UNIQUE (name),
    CONSTRAINT specialisation_slug_unique UNIQUE (slug)
);

CREATE TABLE worker_specialisation (
    worker_id           BIGINT NOT NULL,
    specialisation_id   INT NOT NULL,
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,

    PRIMARY KEY (worker_id, specialisation_id),
    CONSTRAINT fk_ws_worker FOREIGN KEY (worker_id)
        REFERENCES worker_profile(id) ON DELETE CASCADE,
    CONSTRAINT fk_ws_spec FOREIGN KEY (specialisation_id)
        REFERENCES specialisation(id) ON DELETE CASCADE
);

CREATE INDEX idx_ws_spec ON worker_specialisation (specialisation_id);


-- ============================================
-- 11. PORTFOLIO ITEM (base for all subtypes)
-- ============================================

CREATE TABLE portfolio_item (
    id              BIGSERIAL PRIMARY KEY,
    worker_id       BIGINT NOT NULL,
    item_type       VARCHAR(20) NOT NULL,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by     VARCHAR(20),
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_pi_worker FOREIGN KEY (worker_id)
        REFERENCES worker_profile(id) ON DELETE CASCADE,
    CONSTRAINT chk_pi_type CHECK (item_type IN ('EXPERIENCE', 'PROJECT', 'CERTIFICATION')),
    CONSTRAINT chk_pi_verified_by CHECK (verified_by IS NULL OR verified_by IN ('HMRC', 'EMPLOYER', 'PLATFORM'))
);

CREATE INDEX idx_pi_worker ON portfolio_item (worker_id, sort_order);


-- ============================================
-- 12. EXPERIENCE DETAIL (shared PK = portfolio_item.id)
-- ============================================

CREATE TABLE experience_detail (
    id              BIGINT PRIMARY KEY,
    company_name    VARCHAR(200),
    role            VARCHAR(150),
    start_date      TIMESTAMPTZ,
    end_date        TIMESTAMPTZ,

    CONSTRAINT fk_ed_portfolio FOREIGN KEY (id)
        REFERENCES portfolio_item(id) ON DELETE CASCADE
);


-- ============================================
-- 13. PROJECT DETAIL (shared PK = portfolio_item.id)
-- ============================================

CREATE TABLE project_detail (
    id              BIGINT PRIMARY KEY,
    project_type    VARCHAR(100),
    site_postcode   VARCHAR(10),
    completed_at    TIMESTAMPTZ,
    project_value   DECIMAL(12, 2),

    CONSTRAINT fk_pd_portfolio FOREIGN KEY (id)
        REFERENCES portfolio_item(id) ON DELETE CASCADE
);


-- ============================================
-- 14. CERTIFICATION DETAIL (shared PK = portfolio_item.id)
-- ============================================

CREATE TABLE certification_detail (
    id              BIGINT PRIMARY KEY,
    cert_type       VARCHAR(100) NOT NULL,
    cert_number     VARCHAR(100),
    issuing_body    VARCHAR(200),
    issued_at       TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,

    CONSTRAINT fk_cd_portfolio FOREIGN KEY (id)
        REFERENCES portfolio_item(id) ON DELETE CASCADE
);


-- ============================================
-- 15. PORTFOLIO MEDIA (display photos -> portfolio_item)
-- ============================================

CREATE TABLE portfolio_media (
    id                  BIGSERIAL PRIMARY KEY,
    portfolio_item_id   BIGINT NOT NULL,
    media_url           VARCHAR(500) NOT NULL,
    caption             VARCHAR(300),
    sort_order          SMALLINT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_pm_item FOREIGN KEY (portfolio_item_id)
        REFERENCES portfolio_item(id) ON DELETE CASCADE
);

CREATE INDEX idx_pm_item ON portfolio_media (portfolio_item_id, sort_order);


-- ============================================
-- 16. PORTFOLIO ITEM DOCUMENT (M:M junction)
-- ============================================

CREATE TABLE portfolio_item_document (
    portfolio_item_id   BIGINT NOT NULL,
    document_id         BIGINT NOT NULL,

    PRIMARY KEY (portfolio_item_id, document_id),
    CONSTRAINT fk_pid_item FOREIGN KEY (portfolio_item_id)
        REFERENCES portfolio_item(id) ON DELETE CASCADE,
    CONSTRAINT fk_pid_doc FOREIGN KEY (document_id)
        REFERENCES document(id) ON DELETE CASCADE
);


-- ============================================
-- 17. VERIFICATION MILESTONE (-> client_profile)
-- ============================================

CREATE TABLE verification_milestone (
    id                  BIGSERIAL PRIMARY KEY,
    client_profile_id   BIGINT NOT NULL,
    milestone_type      VARCHAR(30) NOT NULL,
    achieved_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,
    evidence_ref        VARCHAR(500),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_vm_client FOREIGN KEY (client_profile_id)
        REFERENCES client_profile(id) ON DELETE CASCADE,
    CONSTRAINT chk_vm_type CHECK (milestone_type IN (
        'IDENTITY_VERIFIED', 'SKILL_CERTIFIED', 'PLATFORM_TRUSTED',
        'HMRC_VERIFIED', 'COMPANY_VERIFIED', 'INSURANCE_VERIFIED'
    ))
);

CREATE INDEX idx_vm_client ON verification_milestone (client_profile_id);


-- ============================================
-- 18. REFERRAL (referrer = who gets the commission)
-- ============================================

CREATE TABLE referral (
    id                  BIGSERIAL PRIMARY KEY,
    referrer_id         BIGINT NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    title               VARCHAR(200) NOT NULL,
    description         TEXT,
    project_type        VARCHAR(100),
    postcode_area       VARCHAR(10),
    estimated_value     DECIMAL(12, 2),
    commission_pct      DECIMAL(5, 2),
    platform_fee_pct    DECIMAL(5, 2) NOT NULL DEFAULT 2.00,
    client_name         VARCHAR(200),
    client_phone        VARCHAR(20),
    client_email        VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ref_referrer FOREIGN KEY (referrer_id)
        REFERENCES client_profile(id),
    CONSTRAINT chk_ref_status CHECK (status IN ('OPEN', 'ACCEPTED', 'COMPLETED', 'CANCELLED'))
);

CREATE INDEX idx_ref_referrer ON referral (referrer_id);
CREATE INDEX idx_ref_status ON referral (status, postcode_area);


-- ============================================
-- 19. REFERRAL OFFER (-> referral + worker_profile)
-- ============================================

CREATE TABLE referral_offer (
    id              BIGSERIAL PRIMARY KEY,
    referral_id     BIGINT NOT NULL,
    recipient_id    BIGINT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    message         TEXT,
    responded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ro_referral FOREIGN KEY (referral_id)
        REFERENCES referral(id) ON DELETE CASCADE,
    CONSTRAINT fk_ro_worker FOREIGN KEY (recipient_id)
        REFERENCES worker_profile(id),
    CONSTRAINT ro_one_per_recipient UNIQUE (referral_id, recipient_id),
    CONSTRAINT chk_ro_status CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED'))
);

CREATE INDEX idx_ro_recipient ON referral_offer (recipient_id, status);


-- ============================================
-- 20. COLLABORATION (worker <-> employer, optional referral origin)
-- ============================================

CREATE TABLE collaboration (
    id              BIGSERIAL PRIMARY KEY,
    worker_id       BIGINT NOT NULL,
    employer_id     BIGINT NOT NULL,
    initiated_by    VARCHAR(10) NOT NULL,
    referral_id     BIGINT,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    project_type    VARCHAR(100),
    site_postcode   VARCHAR(10),
    agreed_amount   DECIMAL(12, 2),
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    flagged         BOOLEAN NOT NULL DEFAULT FALSE,
    flag_reason     VARCHAR(300),
    confirmed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_collab_worker FOREIGN KEY (worker_id)
        REFERENCES worker_profile(id),
    CONSTRAINT fk_collab_employer FOREIGN KEY (employer_id)
        REFERENCES employer_profile(id),
    CONSTRAINT fk_collab_referral FOREIGN KEY (referral_id)
        REFERENCES referral(id),
    CONSTRAINT chk_collab_status CHECK (status IN (
        'PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'DISPUTED'
    )),
    CONSTRAINT chk_collab_initiated CHECK (initiated_by IN ('WORKER', 'EMPLOYER'))
);

CREATE INDEX idx_collab_worker ON collaboration (worker_id);
CREATE INDEX idx_collab_employer ON collaboration (employer_id);
CREATE INDEX idx_collab_status ON collaboration (status);


-- ============================================
-- 21. REVIEW (max 2 per collaboration: one WORKER, one EMPLOYER)
-- ============================================

CREATE TABLE review (
    id                      BIGSERIAL PRIMARY KEY,
    collaboration_id        BIGINT NOT NULL,
    reviewer_role           VARCHAR(10) NOT NULL,
    overall_rating          SMALLINT NOT NULL,
    quality_rating          SMALLINT,
    reliability_rating      SMALLINT,
    communication_rating    SMALLINT,
    payment_rating          SMALLINT,
    safety_rating           SMALLINT,
    comment                 TEXT,
    is_published            BOOLEAN NOT NULL DEFAULT FALSE,
    published_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_rev_collab FOREIGN KEY (collaboration_id)
        REFERENCES collaboration(id),
    CONSTRAINT review_one_per_role UNIQUE (collaboration_id, reviewer_role),
    CONSTRAINT chk_rev_role CHECK (reviewer_role IN ('WORKER', 'EMPLOYER')),
    CONSTRAINT chk_rev_overall CHECK (overall_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_rev_quality CHECK (quality_rating IS NULL OR quality_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_rev_reliability CHECK (reliability_rating IS NULL OR reliability_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_rev_communication CHECK (communication_rating IS NULL OR communication_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_rev_payment CHECK (payment_rating IS NULL OR payment_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_rev_safety CHECK (safety_rating IS NULL OR safety_rating BETWEEN 1 AND 5)
);

CREATE INDEX idx_rev_collab ON review (collaboration_id);


-- ============================================
-- 22. ESCROW TRANSACTION (1:0..1 with collaboration)
-- ============================================

CREATE TABLE escrow_transaction (
    id                          BIGSERIAL PRIMARY KEY,
    collaboration_id            BIGINT NOT NULL,
    status                      VARCHAR(20) NOT NULL DEFAULT 'CREATED',
    job_amount                  DECIMAL(12, 2) NOT NULL,
    platform_fee                DECIMAL(12, 2) NOT NULL,
    referral_commission         DECIMAL(12, 2) NOT NULL DEFAULT 0,
    worker_payout               DECIMAL(12, 2) NOT NULL,
    currency                    VARCHAR(3) NOT NULL DEFAULT 'GBP',
    stripe_payment_intent_id    VARCHAR(200),
    stripe_charge_id            VARCHAR(200),
    stripe_transfer_id          VARCHAR(200),
    stripe_refund_id            VARCHAR(200),
    deposit_confirmed_at        TIMESTAMPTZ,
    released_at                 TIMESTAMPTZ,
    refunded_at                 TIMESTAMPTZ,
    disputed_at                 TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT escrow_collab_unique UNIQUE (collaboration_id),
    CONSTRAINT escrow_pi_unique UNIQUE (stripe_payment_intent_id),
    CONSTRAINT escrow_charge_unique UNIQUE (stripe_charge_id),
    CONSTRAINT escrow_transfer_unique UNIQUE (stripe_transfer_id),
    CONSTRAINT fk_esc_collab FOREIGN KEY (collaboration_id)
        REFERENCES collaboration(id),
    CONSTRAINT chk_esc_status CHECK (status IN (
        'CREATED', 'DEPOSIT_PENDING', 'HELD', 'RELEASED', 'REFUNDED', 'DISPUTED'
    ))
);


-- ============================================
-- 23. SUBSCRIPTION PLAN (reference, is_active=false by default)
-- ============================================

CREATE TABLE subscription_plan (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL,
    price_monthly   DECIMAL(8, 2) NOT NULL,
    price_yearly    DECIMAL(8, 2),
    max_referrals   INT,
    features        JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active       BOOLEAN NOT NULL DEFAULT FALSE
);


-- ============================================
-- 24. USER SUBSCRIPTION (-> client_profile + plan)
-- ============================================

CREATE TABLE user_subscription (
    id                      BIGSERIAL PRIMARY KEY,
    client_profile_id       BIGINT NOT NULL,
    plan_id                 INT NOT NULL,
    stripe_sub_id           VARCHAR(100),
    status                  VARCHAR(20) NOT NULL DEFAULT 'active',
    is_current              BOOLEAN NOT NULL DEFAULT TRUE,
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_us_client FOREIGN KEY (client_profile_id)
        REFERENCES client_profile(id) ON DELETE CASCADE,
    CONSTRAINT fk_us_plan FOREIGN KEY (plan_id)
        REFERENCES subscription_plan(id)
);

CREATE INDEX idx_us_client ON user_subscription (client_profile_id, is_current);


-- ============================================
-- 25. NOTIFICATION (-> account, all users)
-- ============================================

CREATE TABLE notification (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL,
    type        VARCHAR(50) NOT NULL,
    title       VARCHAR(200) NOT NULL,
    body        TEXT,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at     TIMESTAMPTZ,
    channel     VARCHAR(10) NOT NULL DEFAULT 'IN_APP',
    sent_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_notif_account FOREIGN KEY (account_id)
        REFERENCES account(id) ON DELETE CASCADE,
    CONSTRAINT chk_notif_channel CHECK (channel IN ('IN_APP', 'EMAIL', 'BOTH'))
);

CREATE INDEX idx_notif_account ON notification (account_id, created_at DESC);


-- ============================================
-- 26. AUDIT LOG (-> account)
-- ============================================

CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    account_id      BIGINT,
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(50),
    entity_id       BIGINT,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address      VARCHAR(45),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_audit_account FOREIGN KEY (account_id)
        REFERENCES account(id)
);

CREATE INDEX idx_audit_account ON audit_log (account_id, created_at DESC);
