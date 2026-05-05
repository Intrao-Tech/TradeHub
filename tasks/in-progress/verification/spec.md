# Spec — Verification

## Summary

Define the production-ready trust-verification pipeline for TradeHub MVP. This feature owns: the verification-level ladder (Unverified → Basic → Certified → Premium), the Stripe Identity automated path to Basic, the manual staff-document approval workflow that promotes users to Certified, the Right-to-Work submission path (worker only), the `VerificationMilestone` audit trail, and the `Document.rejection_reason` field that lets the user know what to fix.

Profiles consumes this surface (`tasks/done/profiles/spec.md` "Sealed Verification dependencies"). Auth gates trust-sensitive actions on `account.status === 'ACTIVE'` only — verification_level is independent of account state and never blocks login.

Requirements use stable IDs `VER-NNN`. Decisions appended to a Decisions Log at the bottom; new Open Questions raised during implementation go in `Open Questions` (never the Decisions Log).

## Problem

TradeHub's product positioning is **trust infrastructure for UK construction trades** (`docs/TradeHub_UK_Technical_Specification_v2.docx` §1). The platform's value proposition collapses if the verification badges don't mean anything. The repo has the raw materials but not the connections:

- The staff approval surface in `web/src/pages/AdminPage.tsx` Documents tab is a **numeric input + status dropdown** — no queue view, no preview, no rejection reason capture, no audit trail.
- `client_profile.verification_level` is only ever written by the Stripe Identity webhook (`backend/src/verification/verification.service.ts:87`) with the literal `'IDENTITY_VERIFIED'`. None of the product-spec ladder values (`Basic` / `Certified` / `Premium`) are ever produced.
- `VerificationMilestone` is in the schema (`backend/prisma/schema.prisma:399`) but **nothing writes to it**. The "this CSCS approval promoted Mike from Basic to Certified" history doesn't exist.
- `Document` has no `rejection_reason` column — staff cannot tell the user why their upload was rejected.
- Vocabulary is fragmented: backend says `UNVERIFIED` / `IDENTITY_VERIFIED`; `VerificationBadge.tsx` says `unverified | kyc | reviewed | hmrc`; product spec says `Unverified | Basic | Certified | Premium`. None match.
- The current `PATCH /documents/:id/status` endpoint takes a one-of-three status string and nothing else — it can't carry a rejection reason and it conflates "staff workflow" with "raw status mutation."

The result is a trust layer held together by hope. Profiles renders the signals; Auth gates trust-sensitive actions; future Reviews and Referrals will read the level. None of those work credibly until this feature ships.

## Goals

- Ship the **manual staff document approval workflow** end to end with a real queue, document preview, decision controls, and rejection-reason capture.
- Ship the **promotion engine** that turns Stripe-Identity completion + approved trade certifications into the correct ladder rung, automatically and event-driven.
- Reconcile vocabulary: pick the product-spec values, migrate existing data, retire the legacy mapping in `verificationFromLevel()`.
- Ship `VerificationMilestone` writes for every promotion event so the audit trail exists.
- Ship `Document.rejection_reason` so users know what to fix.
- Ship Right-to-Work backend (worker-only) with a structured share-code path so Profiles' `PROF-052` can integrate without falling back to `OTHER`.
- Ship one canonical staff decision endpoint so the codebase has one way to approve/reject — no overloaded `PATCH /documents/:id/status`.

## Non-goals

- Reviews-driven Premium-rung computation — the rung is rendered but marked "Coming soon" until Reviews ships (consistent with Profiles' approach).
- HMRC CIS verification API integration (Phase 2 per product spec §7).
- Companies House API integration (Phase 2; manual gov.uk lookup by staff in MVP).
- A separate identity provider beyond Stripe Identity (no Onfido / Veriff / Persona).
- Re-running Stripe Identity automatically when a session expires (user re-initiates).
- Document re-upload cooldown / abuse rate-limiting beyond the existing app-wide throttle.
- A dedicated Verification appeals process — rejection is appealable by re-uploading; staff-driven escalation is out of scope.

## User Flow

### Worker (self-employed tradesperson)

1. After signup + email verification (Auth's domain), worker lands on `/profile`. `verification_level = UNVERIFIED`.
2. Trust ladder panel (rendered by Profiles, data from this feature) shows the four rungs with current state and the next concrete action.
3. To reach **Basic**: worker clicks "Verify identity" → redirected to Stripe Identity hosted session → completes ID + selfie → Stripe webhook fires `identity.verification_session.verified` → backend writes a `VerificationMilestone(milestone_type=IDENTITY_VERIFIED)` and runs the promotion engine → `verification_level = BASIC`. Worker returns to `/profile` and sees the Basic badge.
4. To reach **Certified**: worker uploads at least one trade certification (CSCS, Gas Safe, NICEIC, FIRAS, etc.) via the existing Documents tab. Document enters `PENDING`.
5. Staff reviews the document (see Staff flow below). On approval, the promotion engine fires; if the worker is at least Basic and now has at least one approved certification, `verification_level = CERTIFIED`.
6. **Premium**: visible on the ladder with copy "Coming soon — requires 5+ verified reviews + Identity verified". Not computable until Reviews ships.
7. **Right to work** (UK-specific worker requirement): worker submits a 9-character share code via a dedicated form. The submission becomes a `Document(doc_type=RIGHT_TO_WORK_SHARE_CODE)` with the share code stored in `metadata`. Staff manually verifies on gov.uk and approves/rejects.

### Employer (company)

1. After signup, employer lands on `/profile`. `verification_level = UNVERIFIED`.
2. Same ladder, employer-specific Required-document set.
3. To reach **Basic**: same Stripe Identity flow as worker (proves the employer representative is a real person).
4. To reach **Certified**: upload company insurance + a company letterhead. Both must be approved.
5. To reach **Premium**: Basic + insurance + Companies House lookup (manual: employer has already entered `company_number` at registration; staff verifies it on gov.uk). No API integration in MVP. (Premium not computable until Reviews ships either way; Companies House check is a prerequisite to qualify.)

### Staff / Moderator

1. Staff opens AdminPage → **Verification** tab (renamed from "Documents").
2. Sees a paginated queue of `Document` rows, default filter `status IN (PENDING, IN_REVIEW)`, sortable by oldest-first.
3. Clicks a row → side panel opens with: full-size document preview (PDF or image), uploader display name + role, doc_type, upload date, any prior history (re-upload count), and decision controls.
4. Staff clicks **Approve** → document → `APPROVED`. Promotion engine fires inline. `VerificationMilestone` row written. Audit log entry written.
5. Staff clicks **Reject** → modal asks for a rejection reason (required, ≥10 chars, ≤500 chars). On submit, document → `REJECTED`, `rejection_reason` populated, audit log entry written. User sees the reason in their Documents tab.
6. Staff can move a document `PENDING → IN_REVIEW` (a "claimed by me" optimistic lock) before approving / rejecting; this is optional for MVP — we accept direct PENDING → APPROVED transitions.
7. Staff can filter the queue by `doc_type` to focus on specific certifications.

### Public (read-only)

1. Visitor lands on `/workers/:id` or `/employers/:id`. Verification badge is rendered with the post-reconciliation vocabulary (`Unverified` / `Basic` / `Certified` / `Premium`). No level details exposed beyond the badge.

## Requirements

Conventions: stable IDs `VER-NNN`. **Must** = MVP-blocking. **Should** = strongly preferred. Referenced as `@VER-NNN` in commits, tests, PR descriptions.

### 1. Verification level model

- **VER-001 (Must).** `client_profile.verification_level` enum values are: `UNVERIFIED`, `BASIC`, `CERTIFIED`, `PREMIUM`. Default `UNVERIFIED`. Persisted as `String` (Prisma) for forward-compat; validated at write boundaries.
- **VER-002 (Must).** Migration backfills existing rows: `IDENTITY_VERIFIED` → `BASIC`. Any other legacy value (e.g. `KYC`, `REVIEWED`, `HMRC`) → `UNVERIFIED` with a warning log line. Migration name: `rename_verification_level_vocab`.
- **VER-003 (Must).** `verification_level` is a **derived, cached** value — the source of truth is `Stripe Identity status + approved Documents + (later) review count`. The promotion engine writes the cache. Reads always go through the cache (`/verification/me`, `/verification/levels/:id`).
- **VER-004 (Must).** The ladder is monotonic: a user cannot skip a rung. `UNVERIFIED → BASIC → CERTIFIED → PREMIUM`. Demotion can happen if a milestone is invalidated (e.g. cert expired, reviewer withdraws); MVP: only demotion path is "all milestones for a rung removed" — implemented but not exposed to staff UI.
- **VER-005 (Must).** Premium tier is **not computable** until Reviews ships. The ladder UI renders Premium as "Coming soon — requires 5+ verified reviews"; the backend never writes `PREMIUM` in MVP. Promotion engine has the slot; the predicate returns `false` always until Reviews lands.
- **VER-006 (Must).** **HMRC CIS** verification is **in scope** as an auxiliary milestone (not a ladder rung). Worker submits UTR (Unique Taxpayer Reference, 10 digits) and NI number (e.g. `AB123456C`) via a structured form; staff verifies against the gov.uk CIS gateway (manual lookup, since the gateway requires HMG enrolment we do not have). On approval: `milestone_type = 'HMRC_CIS_VERIFIED'`. Surfaces as an auxiliary "HMRC CIS verified" badge on worker profiles. Promotion engine does NOT gate Certified or Premium on HMRC — it sits alongside RTW as a discrete legal-compliance signal.
- **VER-007 (Must).** Recognised trade-certification doc types: `CSCS_CARD`, `GAS_SAFE_CERT`, `NICEIC_CERT`, `FIRAS_CERT`. **Production-ready manual review** against the public registers (cscs.uk.com, gassaferegister.co.uk, niceic.com, firas.co.uk) — staff opens the register's public lookup page in a new tab via the side panel's "Verify on register" button, enters the credential number from the document scan, confirms the match, and approves. API integrations with these registers (where partnerships become available later) are added as additive milestone-types without breaking the manual flow.

### 2. Promotion engine

- **VER-010 (Must).** Promotion engine is **event-driven**, runs inline on three triggers: (a) Stripe Identity webhook `identity.verification_session.verified`, (b) staff approval/rejection of a document via `POST /verification/documents/:id/review`, (c) milestone invalidation (rare, MVP unused).
- **VER-011 (Must).** Engine is idempotent — running twice on the same state yields the same result. Same milestone type can be written more than once (e.g. multiple approved certifications); the level promotion checks count of milestones, not the single milestone.
- **VER-012 (Must).** Promotion logic (computed top-down, first match wins):
  - **PREMIUM** (worker): Basic predicate true AND ≥5 verified reviews. *Returns false in MVP — Reviews not shipped.*
  - **PREMIUM** (employer): Basic predicate true AND insurance approved AND Companies House manually verified. *Returns false in MVP.*
  - **CERTIFIED** (worker): Basic predicate true AND ≥1 approved certification document (any of `CSCS_CARD`, `GAS_SAFE_CERT`, `NICEIC_CERT`, future trade-cert types).
  - **CERTIFIED** (employer): Basic predicate true AND insurance document approved AND company letterhead approved.
  - **BASIC**: Stripe Identity verified milestone exists.
  - **UNVERIFIED**: default.
- **VER-013 (Must).** Every promotion writes a `VerificationMilestone` row of `milestone_type = LEVEL_PROMOTED` with `evidence_ref` pointing to the milestone(s) that triggered it (concatenated milestone IDs) and `notes` set to the new level. Existing per-evidence milestones (e.g. `IDENTITY_VERIFIED`, `CERTIFICATION_APPROVED`) also persist independently.
- **VER-014 (Should).** Engine writes an audit-log entry (`verification.level_changed`) on every transition, including no-op runs that re-evaluate to the same level (`from === to` skipped to avoid noise).

### 3. Stripe Identity (path to Basic)

- **VER-020 (Must).** `POST /verification/identity/start` (auth required) creates a Stripe Identity verification session and returns `{ verification_url, session_id, status }`. Body is empty. Replaces the existing `POST /verification/start` (deprecated; routes still work for one release as backward-compat).
- **VER-021 (Must).** Session uses `type: 'document'`, `allowed_types: ['driving_license', 'passport', 'id_card']`, `require_matching_selfie: true`. `metadata.account_id` and `metadata.client_profile_id` set so the webhook can identify the target.
- **VER-022 (Must).** Already-Basic-or-higher accounts that hit `/verification/identity/start` get `409 ALREADY_VERIFIED` (don't re-bill the Stripe call). Already-`UNVERIFIED` accounts whose status is `PENDING_EMAIL_VERIFICATION` are blocked at the AccountStateGuard layer (per AUTH spec).
- **VER-023 (Must).** Webhook handler for `identity.verification_session.verified`: writes `VerificationMilestone(milestone_type=IDENTITY_VERIFIED, evidence_ref=session_id)`, runs the promotion engine, then fires `MailService.sendVerificationVerified(email, display_name)` (fire-and-forget — mail failure must not break the webhook). Idempotent — second webhook for same session is a no-op (skips both milestone write AND email).
- **VER-024 (Should).** Webhook handler for `identity.verification_session.requires_input`: writes audit `verification.identity.failed` with the Stripe error code, fires `MailService.sendVerificationFailed(email, display_name, reason)` (fire-and-forget), and does NOT promote. User must re-initiate via the UI.
- **VER-024a (Should).** Email content (subject + copy) is owned by `MailService.sendVerificationVerified` / `sendVerificationFailed`. Success mail links to `/profile`, failure mail links to `/profile?verification=retry`. When SMTP is not configured the mail call is a no-op (existing `MailService.send` warns and skips). Sending is fire-and-forget so a transient SMTP failure cannot retry-loop the Stripe webhook (Stripe would then mark the event as failed and re-deliver, double-promoting).
- **VER-025 (Must).** `GET /verification/identity/status` (auth required) returns the user's most recent Stripe session status (`requires_input` / `processing` / `verified` / `canceled`) — useful for the SPA to poll if the user lost the redirect tab.
- **VER-026 (Must).** Stripe must be configured (`STRIPE_SECRET_KEY` present) for Identity to work. When unconfigured, `POST /verification/identity/start` returns `503 STRIPE_NOT_CONFIGURED` with copy "Identity verification is temporarily unavailable. Please try again later or contact support." The trust ladder UI hides the "Verify identity" CTA when `GET /verification/providers` returns `{ stripe_identity: false }`.

### 4. Document review (path to Certified)

- **VER-030 (Must).** Add `Document.rejection_reason VarChar(500)?` (nullable) and `Document.metadata Json?` columns. Migration name: `add_document_review_fields`. `metadata` carries free-form per-doc-type structured data (e.g. share code for RTW).
- **VER-031 (Must).** Add `Document.reviewed_by BigInt?` (nullable foreign key to `staff_member.id`) populated when status flips to `IN_REVIEW`, `APPROVED`, or `REJECTED`. Same migration as VER-030.
- **VER-032 (Must).** New canonical staff endpoint: `POST /verification/documents/:id/review` body `{ decision: 'APPROVE' | 'REJECT', reason?: string }`. Auth: `JwtAuthGuard + RolesGuard` with `@Roles('STAFF')`. `reason` required when `decision = 'REJECT'` (≥10 chars, ≤500 chars), forbidden when `decision = 'APPROVE'`. Returns the updated document row.
- **VER-033 (Must).** State machine for `Document.status` (enforced server-side):
  - `PENDING` → `IN_REVIEW` (via `POST /verification/documents/:id/claim`, optional MVP)
  - `PENDING` → `APPROVED` (allowed direct via review endpoint with `decision=APPROVE`)
  - `PENDING` → `REJECTED` (allowed direct)
  - `IN_REVIEW` → `APPROVED` / `REJECTED`
  - `APPROVED` → terminal (no transitions in MVP)
  - `REJECTED` → terminal (user re-uploads creates a NEW document row; the rejected one stays for history)
  Any other transition returns `409 INVALID_TRANSITION`.
- **VER-034 (Must).** Deprecate `PATCH /documents/:id/status`. Endpoint stays for one release (backward-compat for any external callers; no internal callers remain after this feature ships) but logs a deprecation warning and is removed from Swagger. Use `POST /verification/documents/:id/review` going forward.
- **VER-035 (Must).** New staff queue endpoint: `GET /verification/queue?status=&doc_type=&page=&limit=` (auth + `@Roles('STAFF')`) returns paginated documents with uploader info joined in. Response: `{ items: Array<{ document, uploader: { id, display_name, role } }>, total, page, limit }`. Default filter `status IN (PENDING, IN_REVIEW)`, default sort `created_at ASC` (oldest-first — fairness).
- **VER-036 (Must).** New "deep" read endpoint: `GET /verification/queue/:id` returns the queue item with full uploader profile snippet, document file URL, doc_type, status, rejection_reason, reviewed_by display name, and any prior rejected documents from the same uploader of the same doc_type (re-upload history).
- **VER-037 (Must).** Staff approving a certification document writes `VerificationMilestone(milestone_type=CERTIFICATION_APPROVED, evidence_ref=document_id, staff_member_id=...)` and runs the promotion engine. Approving any other doc type writes `milestone_type` mapped to a stable token: `INSURANCE_APPROVED`, `COMPANY_LETTERHEAD_APPROVED`, `RIGHT_TO_WORK_VERIFIED`, etc. (see VER-040 for full mapping).
- **VER-038 (Must).** When a document is rejected, the user-side Documents tab in Profiles renders `rejection_reason` next to the row; this lives in Profiles' code but the data shape is owned here.

### 5. Right-to-Work (worker-only path; auxiliary milestone)

- **VER-040 (Must).** Add `RIGHT_TO_WORK_SHARE_CODE` and `RIGHT_TO_WORK_DOCUMENT` to the `Document.doc_type` enum (`backend/src/document/dto/upload-document.dto.ts`). Migration not required — it's a string column with class-validator gate.
- **VER-041 (Must).** When uploading a `RIGHT_TO_WORK_SHARE_CODE` document, `metadata` must contain `{ share_code: string }`. Server validates: 9 alphanumeric characters in three groups of 3 separated by spaces (regex `^[A-Z0-9]{3} [A-Z0-9]{3} [A-Z0-9]{3}$`, case-normalised to upper). Reject upload with `400 INVALID_SHARE_CODE` otherwise.
- **VER-042 (Should).** When uploading a `RIGHT_TO_WORK_DOCUMENT` (PDF / image scan of right-to-work proof), `metadata` is empty; standard upload flow.
- **VER-043 (Must).** RTW approval writes `VerificationMilestone(milestone_type=RIGHT_TO_WORK_VERIFIED, ...)`. RTW approval is **independent of the Basic/Certified ladder** (per product spec §3.1 — RTW is a discrete legal milestone, not a ladder rung). The ladder UI surfaces RTW status as a separate "Right to work verified" badge; the promotion engine does not gate Certified on RTW.
- **VER-044 (Should).** The Profiles `PROF-052` form posts a `RIGHT_TO_WORK_SHARE_CODE` document with the share code in `metadata`. Profiles' fallback (generic `OTHER` upload) is no longer needed once this lands; Profiles can drop that fallback in a follow-up.

### 6. Verification milestones

- **VER-050 (Must).** Add `staff_member_id BigInt?` to `VerificationMilestone` (nullable foreign key to `staff_member.id`). Webhook-written milestones (Stripe Identity) leave it null; staff-written milestones populate it. Migration name: `add_milestone_staff_actor`.
- **VER-051 (Must).** `milestone_type` taxonomy (string enum, validated at write boundaries):
  - `IDENTITY_VERIFIED` — Stripe Identity webhook
  - `CERTIFICATION_APPROVED` — staff approval of a `*_CERT` doc_type
  - `INSURANCE_APPROVED` — staff approval of an `INSURANCE` doc_type
  - `COMPANY_LETTERHEAD_APPROVED` — staff approval of `COMPANY_LETTERHEAD`
  - `RIGHT_TO_WORK_VERIFIED` — staff approval of `RIGHT_TO_WORK_*`
  - `COMPANY_HOUSE_VERIFIED` — staff manual gov.uk lookup (no separate doc upload; staff sets a flag in a future `VER-Phase2` ticket — for MVP this is unused but reserved)
  - `LEVEL_PROMOTED` — written by the promotion engine itself
- **VER-052 (Should).** `expires_at` field (already on schema) is populated for milestones that have a known TTL: certifications expire on the cert's `expires_at` if the staff member entered one (manual today; future `Document.expires_at` migration). Set to `null` for Stripe Identity (no expiry semantics for MVP).
- **VER-053 (Must).** New endpoint: `GET /verification/me` returns the comprehensive user-side view: `{ verification_level, milestones: [{type, achieved_at, expires_at, evidence_ref}], pending_documents: [...], rejected_documents_with_reason: [...] }`. Single canonical "give me everything I need to render my own trust state."

### 7. Public reads

- **VER-060 (Must).** New endpoint: `GET /verification/levels/:clientProfileId` (public, no auth) returns `{ verification_level, last_evaluated_at, flags, reviews }` so other users can see WHAT was verified, not just the rung. `flags` is a fixed set of booleans plus a `certification_doc_types` string list (which trade certs were approved). `reviews` carries `{ count, average }` from the worker / employer profile aggregates. Doc IDs / titles / metadata stay private — only flags + counts cross the public boundary. 404 for deactivated accounts.
- **VER-060a (Must).** Frontend `<MilestonesStrip>` component reads the `flags` + `reviews` blocks from VER-060 and renders one small Badge per truthy signal: Identity verified, Insurance approved, Companies House, Letterhead approved, Right to work, HMRC CIS, plus one badge per approved trade cert (CSCS / Gas Safe / NICEIC / FIRAS), and a Reviews chip with `avg ★ (count reviews)` when count > 0. Used in `ProfileHeader` so it appears on every public profile (Worker / Employer / Client) and on the user's own profile page.
- **VER-061 (Must).** New endpoint: `GET /verification/ladder/:clientProfileId` (auth required, owner or staff) returns the trust-ladder-panel data: per-rung state (`Done` / `In review` / `Not started`), the next concrete action for the user's role, and the time-to-complete microcopy. Used by Profiles' `TrustLadderPanel`.

### 8. Staff queue UI (AdminPage)

- **VER-070 (Must).** AdminPage tab labelled **Verification** (rename from "Documents") — paginated queue with filters (status, doc_type, assignment), one row per document. Default sort: oldest pending first.
- **VER-071 (Must).** Click a row → side panel (Sheet component) shows: doc preview (PDF iframe / image), uploader header (display name, role, link to their profile), doc_type, upload date, prior re-upload count for same doc_type from same uploader, current assignee (with avatar + name), decision controls.
- **VER-072 (Must).** Decision controls: `Approve` button (one click → confirm dialog → submit), `Reject` button (opens modal with required reason textarea, ≥10 / ≤500 chars), `Mark in review` button (optional, stages the optimistic lock). Disabled when document is already terminal (`APPROVED` / `REJECTED`). Also disabled when the current staff is not the assignee (admin override available — see VER-130).
- **VER-073 (Must).** After approval, the panel shows the resulting promotion if any: "User promoted to Certified" banner (info variant), reading from the response of `POST /verification/documents/:id/review` which includes `{ document, level_changed: { from, to } | null }`.
- **VER-074 (Should).** Filter by `doc_type` defaults to "all"; staff can pin a single type to focus on. Filter by **assignment** has three values: `mine` (default for non-admin staff — `assigned_to = self`), `unassigned` (`assigned_to IS NULL`), `all` (admin default). Filters persisted in URL query params so refresh / share works.
- **VER-075 (Must).** Each row shows the assignee column with an avatar + name. Unassigned rows show a "—" with a "Claim" link. Rows assigned to someone else are read-only for non-admin staff (they can view but not approve/reject; the page suggests "Ask the assignee to handle, or claim it via 'Reassign to me'" for admins).

### 9. Provider feature flag

- **VER-080 (Must).** New endpoint: `GET /verification/providers` (public) returns `{ stripe_identity: boolean }` based on whether `STRIPE_SECRET_KEY` is configured. SPA reads this on profile mount and hides the "Verify identity" CTA when false; falls back to "Identity verification is temporarily unavailable" copy in the Trust Ladder.

### 10. Vocabulary reconciliation (FE)

- **VER-090 (Must).** Update `web/src/components/VerificationBadge.tsx`: replace the legacy state union (`unverified | kyc | reviewed | hmrc`) with the product-spec values (`unverified | basic | certified | premium`). `verificationFromLevel(level)` stays as a forgiving normaliser (`'BASIC' → 'basic'`, unknowns → `'unverified'`) since profile shapes carry the level as a free-form string and the FE shouldn't crash on legacy data.
- **VER-091 (Must).** `<VerificationBadge state="premium" />` renders a "Coming soon" tooltip in MVP since no user can reach Premium yet. Drop the tooltip once Reviews ships.
- **VER-092 (Should).** Worker `Documents` tab shows ONLY worker-relevant doc types (CSCS, Gas Safe, NICEIC, FIRAS, Insurance, Other). Employer `Documents` tab shows ONLY employer-relevant doc types (Insurance, Company letterhead, Other). Cross-role types are hidden — a worker can't see Letterhead in their checklist; an employer can't see CSCS. The `Portfolio` tab is hidden entirely for employers (workers only). `OTHER` carries a required `metadata.title` (3–100 chars) so checklist rows and the staff queue show the user-supplied label instead of a generic "Other".
- **VER-093 (Should).** `PROJECT_PHOTO` doc type is REMOVED from the upload DTO and the frontend doc-type list. Project photos belong to the Portfolio domain (`PortfolioItem`), not the verification document queue. Existing rows (none post-reset) are inert — staff queue ignores doc types not in the active enum.
- **VER-094 (Should).** Trust signals surface on every contact surface, not just standalone profile pages. `<VerificationBadge>` renders on Worker / Employer / Applicant cards (already), the EmployerChip on job posts, and the conversation inbox row (`<ConversationListItem>` reads `other_participant.verification_level` from `GET /conversations/inbox` which now ships the level alongside `display_name` and `avatar_url`). The full `<MilestonesStrip>` renders on the user's own `ProfilePage` via a `<MyTrustSummary>` block that calls `GET /verification/levels/:cp.id` (their own client profile) — same component, same data shape as the public detail pages.

### 11. Audit and analytics

- **VER-100 (Must).** Audit-log events written via existing `AuditService`:
  - `verification.identity.started` — Stripe session created
  - `verification.identity.verified` — webhook completion
  - `verification.identity.failed` — webhook `requires_input`
  - `verification.document.reviewed { decision, document_id, reason?, admin_override? }` — staff decision
  - `verification.document.assigned { from: staff_id|null, to: staff_id|null, reason: 'auto'|'duty_off'|'manual'|'claim'|'admin_reassign' }` — assignment change
  - `verification.level_changed { from, to, evidence_milestones }` — promotion engine fired
  - `staff.duty_changed { on_duty: boolean, reassigned_count?: int }` — staff duty toggle
- **VER-101 (Must).** All audit events include `account_id` (subject), `staff_member_id` where applicable, and `ip_address`. Reuse the existing `audit_log` table — no new audit table.

### 12. Document assignment & staff duty

The queue is **assignment-based**, not pure pull. New documents are auto-assigned to the on-duty staff member with the smallest open-document workload. Staff manually toggle their `on_duty` state when they start / end a shift.

#### 13.1 Duty state

- **VER-120 (Must).** Add `staff_member.is_on_duty Boolean @default(false)`. Toggled by the staff member themselves via `POST /staff/me/duty body { on_duty: boolean }`. No schedule table in MVP — manual toggle is the contract.
- **VER-121 (Must).** A deactivated staff (`account.status = 'DEACTIVATED'`) is implicitly off-duty regardless of their `is_on_duty` flag. Re-activating does NOT auto-set `is_on_duty = true` — the staff toggles themselves on after re-activation.
- **VER-122 (Should).** AdminPage → Members tab shows each staff member's duty state with a green dot when on, grey dot when off. Per-row count of open assigned docs is rendered alongside.
- **VER-123 (Should).** A staff member toggling themselves off-duty triggers reassignment of any of their `PENDING` or `IN_REVIEW` documents (see VER-126). Confirmation dialog warns: "You have N open documents — they will be reassigned. Continue?"

#### 13.2 Assignment algorithm

- **VER-125 (Must).** On document upload, the server runs `assignNext(documentId)`:
  1. Find all `staff_member` where `is_on_duty = true` AND `account.status = 'ACTIVE'`.
  2. For each, count open documents (`status IN ('PENDING','IN_REVIEW') AND assigned_to = staff_member.id`).
  3. Pick the staff with the **lowest** count. Tie-breaker: smallest `staff_member.created_at` (deterministic).
  4. If a staff was found → set `Document.assigned_to = staff.id`, write audit `verification.document.assigned`. If none → leave `assigned_to = null` (unassigned bucket).

  Pure function — easy to unit-test against truth tables. Lives in `backend/src/verification/document-assignment.service.ts`.

- **VER-126 (Must).** Reassignment is triggered by:
  (a) staff toggling off-duty (their open docs reassigned),
  (b) admin deactivating a staff (their open docs reassigned),
  (c) admin manually reassigning via `POST /verification/documents/:id/assign { staff_member_id }`,
  (d) staff claiming an unassigned doc via `POST /verification/documents/:id/claim` — **claim is allowed only on `assigned_to IS NULL` documents**; reclaiming someone else's is admin-only.

  Each reassignment writes `verification.document.assigned { from: staff_id|null, to: staff_id|null }` audit event.

- **VER-127 (Must).** A document that's `APPROVED` or `REJECTED` (terminal) is never reassigned. `assigned_to` stays as a historical pointer to who was responsible during review.

- **VER-128 (Should).** Stale unassigned bucket: if no staff is on-duty when a doc uploads, the doc sits unassigned until a staff toggles on. The first on-duty toggle does NOT auto-claim the bucket; staff sees them in the "Unassigned" filter and can claim manually. (Auto-distribution on duty-on adds complexity for marginal benefit — punt to a follow-up if needed.)

#### 13.3 Visibility rules

- **VER-130 (Must).** Non-admin staff (MODERATOR) sees by default `assignment = 'mine'`. They can switch to `unassigned` to claim. They CANNOT see `all` — the queue is scoped to their work + the unclaimed pool.
- **VER-131 (Must).** ADMIN sees by default `assignment = 'all'`, can filter to `mine` / `unassigned` / by specific staff. Admins can manually reassign any document to any on-duty staff via `POST /verification/documents/:id/assign`.
- **VER-132 (Must).** A staff member cannot review a document where `assigned_to !== self`. Server enforces: `POST /verification/documents/:id/review` returns `403 NOT_ASSIGNEE` for non-admin staff who are not the assignee. Admin override: admins bypass this check (audit-logged with `verification.document.reviewed { admin_override: true }`).

#### 13.4 Endpoints

- **VER-135 (Must).** `POST /staff/me/duty body { on_duty: boolean }` — toggle own duty state. Reassignment runs inline if going off-duty.
- **VER-136 (Must).** `POST /verification/documents/:id/assign body { staff_member_id: number | null }` — ADMIN only. `null` removes assignment (returns to unassigned bucket). Target staff must be on-duty AND active.
- **VER-137 (Must).** `POST /verification/documents/:id/claim` — STAFF (admin or moderator). Claims an `assigned_to IS NULL` document. Returns `409 ALREADY_ASSIGNED` if the doc has someone else.

### 13. Verification execution model (auto vs manual)

Every credential type has exactly one of two production-ready execution paths:

- **Auto-check via public API**: where a free public API exists (`Stripe Identity`, `Companies House`), the flow calls the registry inline and writes the milestone without human intervention.
- **Manual review with register-lookup aid**: where no public API exists (or the API requires a partnership we do not hold — `CSCS Smart Check`, `Gas Safe`, `NICEIC`, `FIRAS`, `Right-to-Work Online`, `HMRC CIS gateway`), the side panel renders a "Verify on register" button that opens the public lookup page in a new tab. Staff visually confirms the match against the document scan and approves / rejects. This is a real production workflow, not a placeholder — it scales with staff headcount and is audit-traceable. When a partnership lands later, it slots in as an additional auto-check milestone-type without changing the manual fallback.

Decision boundary today (production-ready):

| Credential | Path | Trigger |
|---|---|---|
| Identity (ID + selfie) | **Auto** (Stripe Identity) | webhook `identity.verification_session.verified` |
| Companies House | **Auto** (CH free public API) | `POST /verification/employer/companies-house-verify` |
| CSCS, Gas Safe, NICEIC, FIRAS | Manual | staff click + visual check |
| Right-to-Work (share code or document) | Manual (gov.uk lookup) | staff click + visual check |
| HMRC CIS (UTR + NI) | Manual (gov.uk gateway) | staff click + visual check |
| Insurance, Company letterhead | Manual (visual only — no register) | staff visual confirmation |
| ID photo / selfie (legacy) | Rejected — direct user to Stripe Identity | n/a |

#### 13.1 Companies House (employer; auto)

- **VER-140 (Must).** New endpoint `POST /verification/employer/companies-house-verify` (auth required, employer role). Server reads `EmployerProfile.company_name` + `EmployerProfile.company_number`, calls Companies House public API (`https://api.company-information.service.gov.uk/company/{company_number}`), validates that:
  (a) the company exists,
  (b) `company_status === 'active'` (not dissolved / liquidating),
  (c) the returned company name matches `company_name` (case-insensitive, whitespace-normalised, ignore `Limited`/`Ltd` variations).
- **VER-141 (Must).** On match: write `VerificationMilestone(milestone_type='COMPANY_HOUSE_VERIFIED', evidence_ref=companies_house_number)`. Run promotion engine. Surface as auxiliary "Companies House verified" badge on the employer profile (analogous to RTW for workers — auxiliary, not a ladder rung in MVP).
- **VER-142 (Must).** On mismatch / not-found / `company_status !== 'active'`: return `400 COMPANIES_HOUSE_MISMATCH` with a structured body `{ code, message, registry_response: { name, status } }`. SPA shows the diff so the employer can correct the data on their profile and retry.
- **VER-143 (Must).** Companies House API key in `COMPANIES_HOUSE_API_KEY` env var. When unset, the endpoint returns `503 COMPANIES_HOUSE_NOT_CONFIGURED` and the SPA hides the "Verify company" CTA. `GET /verification/providers` extends to return `{ stripe_identity: bool, companies_house: bool }`.
- **VER-144 (Should).** The Companies House check is rate-limited to 5/hour per IP and 3/hour per employer to stay well below the free tier (600 req/5min global). Per-employer cap also stops the user retrying a known-bad `company_number` in a tight loop.
- **VER-145 (Should).** Result of the API call is cached in `VerificationMilestone.notes` (full JSON of the registry response) for staff audit. No separate cache table.

#### 13.1bis HMRC CIS (worker; manual via gov.uk gateway)

- **VER-146 (Must).** Worker submits HMRC CIS credentials via a structured form: UTR (10-digit numeric) + NI number (regex `^[A-Z]{2}[0-9]{6}[A-Z]$`, case-normalised). Server validates both server-side, creates a `Document(doc_type='HMRC_CIS_DOCUMENT', metadata={ utr, ni_number })`. No file upload — `file_url` is set to a placeholder marker `(structured-only)` that the staff side-panel renders as "Structured submission — no file attached."
- **VER-147 (Must).** Staff side-panel for `HMRC_CIS_DOCUMENT` shows the UTR + NI prominently (read-only) and renders a **"Verify on gov.uk gateway"** button that opens the HMRC CIS lookup page in a new tab. Staff confirms the lookup result, approves or rejects with reason.
- **VER-148 (Must).** On approve: write `VerificationMilestone(milestone_type='HMRC_CIS_VERIFIED', evidence_ref=document_id)`. Surfaces as auxiliary "HMRC CIS verified" badge on the worker profile. Does NOT contribute to the Basic / Certified / Premium ladder.
- **VER-149 (Should).** UTR + NI are sensitive — at-rest they live inside `Document.metadata` (Json) which is column-level encrypted at the Postgres level if `pgcrypto` is configured (out of scope to set up here; production deploy concern). Application-side: never log UTR / NI in audit metadata or error messages — log only `document_id`. The audit event for HMRC review carries `document_id`, never the credentials themselves.

#### 13.2 Manual-review documents (with one-click register lookup)

For doc types where no free open API exists, the staff side-panel renders a **"Verify on register"** button that opens the public lookup page in a new tab. The staff member enters the credential number (visible in the doc preview), confirms the match visually, and approves / rejects. Per-doc-type configuration:

| `doc_type` | Public lookup URL (staff opens in new tab) | Notes |
|---|---|---|
| `CSCS_CARD` | `https://www.cscs.uk.com/check-a-card/` | Card number on front of card; site asks for it + uploader's surname (visible in profile). |
| `GAS_SAFE_CERT` | `https://www.gassaferegister.co.uk/find-an-engineer/` | Licence number from cert. Confirms engineer exists + active. |
| `NICEIC_CERT` | `https://www.niceic.com/find-a-contractor` | Contractor / company number. |
| `FIRAS_CERT` | `https://firas.co.uk/find-installer/` | Less standardised — staff confirms the cert PDF looks legitimate (issuer logo, dates, signature). |
| `RIGHT_TO_WORK_SHARE_CODE` | `https://www.gov.uk/view-right-to-work` | Staff enters the share code from `Document.metadata.share_code`, the worker's date of birth (from profile if present, otherwise prompt the user to add it before submitting RTW), and confirms the gov.uk page returns "Right to work confirmed." |
| `RIGHT_TO_WORK_DOCUMENT` | (no register — visual check) | PDF/image of right-to-work proof. Staff confirms it looks like a UK passport, BRP, or settled-status document. |
| `HMRC_CIS_DOCUMENT` | `https://www.tax.service.gov.uk/check-cis-status/start` | Structured submission — UTR + NI from `Document.metadata`. Staff enters into gov.uk gateway, confirms registration. |
| `INSURANCE` | (no register — visual check) | Insurance policy doc. Confirm policy number, expiry, covered activities. |
| `COMPANY_LETTERHEAD` | (no register — visual check) | Letter on company letterhead with company number matching `EmployerProfile.company_number`. |
| `ID_PHOTO`, `SELFIE` | (deprecated) | Staff rejects with the standard "Please use Stripe Identity at /profile → Verify identity" reason. |

- **VER-150 (Must).** Side-panel renders the lookup URL as a button labelled "Verify on register" with `target="_blank" rel="noopener"`. URL pulled from a per-doc-type lookup table on the frontend (no need to round-trip to backend). When `doc_type` has no public register (insurance, letterhead, RTW document, ID/selfie), the button is hidden and a textual hint replaces it: "Visual check only — confirm the scan looks legitimate."
- **VER-151 (Should).** Future automation upgrades are **additive** — each new auto-check writes the same milestone type the manual flow does (e.g. `CERTIFICATION_APPROVED`), so the promotion engine never changes. The existing manual path stays as the fallback when an API call errors or a partnership lapses. See §13.3 for the per-credential roadmap.

#### 13.3 Future automation roadmap

Each row below describes what needs to land — business / legal / technical — to upgrade a manual check to an auto-check. Listed in rough priority order (highest-volume credentials first). When a row's prerequisites are met, the implementing engineer writes a thin client + replaces the manual lookup button with an inline auto-call; no spec changes required since the milestone-type already exists.

| Credential | Prerequisite | Target API | Estimated implementation cost (after prerequisite) |
|---|---|---|---|
| **CSCS Smart Check** | B2B partnership / API key from cscs.uk.com (Smart Check business agreement). Highest priority — CSCS is the single most-uploaded cert on UK construction sites. | Smart Check API (REST + JSON) | ~1 day: REST client, response shape mapping, fallback on 5xx → manual queue. |
| **Gas Safe Register** | API partnership with Gas Safe Register (commercial agreement; engineer-by-licence-number lookup). | Gas Safe API (REST) | ~1 day: same shape as CSCS, plus engineer-status check ("Active" / "Suspended" / "Expired"). |
| **HMRC CIS verification** | HMRC Government Gateway enrolment as a corporate tax representative + secure-credentials handling for end-user UTR/NI. Higher cost — sensitive PII, OAuth-style consent flow. | HMRC CIS Subcontractor Verification API (gov.uk) | ~3–5 days: gateway enrolment paperwork (separate track), then OAuth client + signed-XML request format + webhook for verification result. |
| **Right-to-Work Online** | HMG Employer Checking Service enrolment (Home Office partnership). Public-API path requires a registered employer relationship. | Right-to-Work Online API | ~2 days: share-code lookup against the Employer Checking Service + parse returned status. |
| **NICEIC** | Limited B2B API access; requires contact and per-customer agreement. | NICEIC contractor lookup | ~2 days, mostly paperwork. |
| **FIRAS** | No public API today. Would require direct relationship with the scheme operator and possibly a custom integration (e.g. CSV export ingest). | n/a today | unknown — unlikely to automate; volume is low so manual is acceptable indefinitely. |
| **Insurance certificate** | No central UK insurance register. Per-insurer APIs vary wildly (and most insurers don't expose one). | n/a today | unlikely to automate; manual visual check stays. |
| **Company letterhead** | n/a — visual-check-only; no register exists. | n/a | will not be automated. |

Common upgrade pattern (so the implementing engineer doesn't redesign each time):
1. Add a per-credential service (e.g. `cscs.service.ts`) that takes the credential identifier from `Document.metadata` and hits the API.
2. Wire the service into `DocumentReviewService.review()`. On `decision='APPROVE'`, run the API check first; if it confirms, write the same `CERTIFICATION_APPROVED` (or whatever) milestone the manual flow writes. If it disagrees with the document scan, return a `409 REGISTRY_DISAGREEMENT { registry_response }` so staff sees the conflict and decides.
3. On any 5xx / timeout from the registry: degrade to manual — staff approves on visual inspection, audit log records the API failure for ops review.
4. Add a feature flag `verification.{cred}.auto` (default off) so we can roll out per-cred without touching the spec.

This roadmap is the **only** place forward-looking integrations are tracked. The rest of the spec describes the production-ready manual flow that ships now.

### 14. Cross-cutting

- **VER-110 (Must).** All new endpoints under `/verification/*` are documented in OpenAPI / Swagger (`@ApiOperation` + DTO classes). Profiles and any future feature consume the contract directly from `/api/docs`.
- **VER-111 (Must).** All new client-server interactions use `web/src/api.ts` `api()` + `parseApiError()` helpers per the Auth contract. No parallel fetch wrapper.
- **VER-112 (Must).** Frontend stays mobile-first 375 px, semantic-tokens-only, light + dark verified, `npm run lint:tokens` passes. New shadcn primitives only via the existing `web/src/components/ui/` directory.
- **VER-113 (Must).** Tests counterpart: a `tasks/in-progress/tests-verification/` folder is opened the same week implementation lands per repo `CLAUDE.md` "Every shipped feature has tests" working principle. E2E covers: (a) full Identity flow with Stripe test mode, (b) full document approve / reject cycle including rejection reason, (c) ladder promotion from Unverified → Basic → Certified.

## Edge Cases

### User-side
- Stripe Identity session expires before the user completes it — `GET /verification/identity/status` returns `requires_input`; UI offers re-start CTA.
- User uploads the same doc_type twice (e.g. two CSCS images). Both enter the queue; promotion engine counts ≥1 approved, so duplicate approvals don't double-count.
- User uploads a certification, gets it rejected, re-uploads. The rejected row stays with its `rejection_reason` for history; the new row is independent.
- User reaches Basic via Stripe, then Stripe issues a `requires_input` event later for the same session (rare). MVP: ignore — Basic is sticky once written.
- User reaches Certified via approved CSCS, then admin manually deletes the CSCS document (out-of-band SQL, not in the UI). The promotion engine's "demotion path" runs on the next inbound trigger — but if no event fires, the cached `verification_level` stays stale until the next event. **Accepted MVP behaviour**; document this as a known gap (followup: nightly re-evaluator).
- User signs up via Google with `email_verified=true`, never uploads any document. Stays at `UNVERIFIED` (Auth's email-verified is independent of Verification's identity-verified). Trust ladder shows all rungs as available.
- User account deactivated mid-flow — Stripe webhook still fires; promotion engine no-ops (level not written for deactivated accounts).
- RTW share code mistyped (e.g. `W12-ABC-345` instead of `W12 ABC 345`) — server-side regex rejects, user sees inline validation message.

### Staff-side
- Two staff members open the same queue row, both click Approve. First wins; second sees `409 INVALID_TRANSITION` and the row refreshes.
- Staff rejects a doc, types reason, hits submit, network drops. Frontend retries; backend is idempotent on resubmission of identical state — but if the first call landed and the second sees `INVALID_TRANSITION`, the UI refreshes and shows the now-rejected state (no resubmit).
- Staff rejects a `RIGHT_TO_WORK_SHARE_CODE` doc — the share code stays in `metadata` so the next reviewer can see what was tried.
- Admin deactivates a staff member who has open `IN_REVIEW` claims — claims stay (the foreign key on `Document.reviewed_by` doesn't cascade); the queue UI shows them as orphaned, any other staff can claim/decide.

### Public-read
- Visitor hits `/verification/levels/:clientProfileId` for a deactivated user — return `404 NOT_FOUND` (don't leak that the account exists but is deactivated).
- Search card / public profile renders `<VerificationBadge state="premium">` on a user who somehow has `verification_level = PREMIUM` set despite Reviews not shipping (data corruption / SQL backfill / future migration). Component renders "Premium" badge with no special handling; the "Coming soon" copy lives only in the user's own ladder panel.

## Acceptance Criteria

### Backend
- A staff member can clear the queue without SQL. They open AdminPage → Verification, see a paginated list of pending documents oldest-first, click into a row, see the file preview and uploader info, click Approve or Reject (with reason), and the queue updates.
- Approving a Stripe-Identity webhook (test mode) lifts the user from `UNVERIFIED` to `BASIC`. A `VerificationMilestone(IDENTITY_VERIFIED)` and a `VerificationMilestone(LEVEL_PROMOTED, notes='BASIC')` are written.
- Approving a CSCS document for a Basic user lifts them to `CERTIFIED`. Two milestones written: `CERTIFICATION_APPROVED` and `LEVEL_PROMOTED`.
- A Premium-eligible user (Basic + 5 reviews + insurance) **does not** reach Premium in MVP — the promotion engine returns `false` for the Premium predicate. Ladder UI renders "Coming soon" copy.
- Rejecting a document with reason "Image is too blurry to verify CSCS card number" populates `Document.rejection_reason` and writes an audit log entry.
- The user sees the rejection reason in their Documents tab.
- A Right-to-Work share code submission with format `W12 ABC 345` is accepted; `W12-ABC-345` is rejected with a validation error.

### Frontend
- AdminPage → Verification renders the queue, side-panel preview, decision controls. Mobile-first 375 px. Light + dark both work.
- VerificationBadge shows `Unverified` / `Basic` / `Certified` / `Premium` — no legacy `KYC` / `HMRC` strings rendered anywhere.
- Profiles' Trust Ladder Panel reads from `GET /verification/ladder/:clientProfileId` and shows per-rung state.

### Cross-cutting
- `npm run lint:tokens` passes with the new components.
- `vite build` clean.
- `tsc --noEmit` clean.
- Swagger / `/api/docs` shows all new `/verification/*` endpoints with full DTO schemas.

## Open Questions

All initial Open Questions from `brief.md` resolved 2026-05-05 — see Decisions Log below. New questions raised during implementation must be appended **here** (not the Decisions Log) until resolved.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-05 | **Right-to-Work scope: IN.** New `RIGHT_TO_WORK_SHARE_CODE` + `RIGHT_TO_WORK_DOCUMENT` doc types. Share code stored in `Document.metadata` with regex validation. RTW is an auxiliary milestone, not a ladder rung. | Product spec §3.1 lists RTW as a profile field. Profiles' `PROF-052` was held pending this decision. Adding the structured share-code path lets Profiles drop its `OTHER` fallback. |
| 2026-05-05 | **Stripe Identity coexistence: KEEP, becomes the canonical Basic-rung path.** Manual document review handles Certified. | Owner explicitly chose Stripe Identity for ID verification. Manual review is needed regardless for trade certifications. The two paths converge in the promotion engine — Stripe writes the `IDENTITY_VERIFIED` milestone, manual review writes `CERTIFICATION_APPROVED` etc. |
| 2026-05-05 | **Promotion timing: event-driven, inline.** Triggers: Stripe webhook, staff review endpoint. No nightly batch. | Simpler than batch; users see updates immediately; matches expectations. Demotion-on-deletion edge case accepted as a known MVP gap (followup: nightly re-evaluator). |
| 2026-05-05 | **`verification_level` enum: REPLACE.** Migrate `IDENTITY_VERIFIED` → `BASIC`, drop `KYC` / `REVIEWED` / `HMRC` from any code path. New values: `UNVERIFIED` / `BASIC` / `CERTIFIED` / `PREMIUM`. | Owner asked for product-spec vocabulary. Replacement is cleaner than extension; no production data yet, dev seeds are easy to migrate. |
| 2026-05-05 | **Companies House for employer Premium: manual gov.uk lookup in MVP.** Staff manually verifies `EmployerProfile.company_number` against gov.uk; no API integration. | Companies House API is Phase 2 per product spec §7. Premium isn't computable in MVP anyway (Reviews not shipped), so zero blast radius. |
| 2026-05-05 | **Audit log granularity: BOTH.** `VerificationMilestone` is the verification-specific state-transition record. `audit_log` captures the staff action. Separate concerns. | Milestone = "what evidence promoted this user." Audit = "which staff took which action when." They answer different questions. |
| 2026-05-05 | **Re-submission cooldown: NONE in MVP.** User can re-upload immediately after rejection. App-wide throttle handles abuse. | Cooldown adds friction with no evidence of need; we'll revisit if abuse signals emerge. |
| 2026-05-05 | **Premium tier visibility: render with "Coming soon" copy until Reviews ships.** Backend never writes `PREMIUM` in MVP; promotion engine has the predicate slot but it returns `false`. | Aligns with Profiles' approach (`PROF-032`). Lets the ladder feel complete without lying about achievability. |
| 2026-05-05 | **Endpoint hygiene: deprecate `PATCH /documents/:id/status`** in favour of `POST /verification/documents/:id/review`. One canonical staff decision endpoint with `{ decision, reason }` body. | Owner explicitly asked for "качественный код архитектора, чтобы 1 и тот же гет не возвращал разные результаты." `PATCH .../status` is overloaded (3 different status values, 2 different transitions, no reason capture). Replacing with a single intent-clear endpoint. |
| 2026-05-05 | **Read endpoints split by purpose.** `/verification/me` (own state, full), `/verification/levels/:id` (public, badge-only), `/verification/ladder/:id` (auth, panel data), `/verification/queue` (staff list), `/verification/queue/:id` (staff deep). One endpoint, one purpose. | Same hygiene principle. Avoids the "one GET returns different shapes per query param" antipattern. |
| 2026-05-05 | **Right-to-Work: not a ladder rung — auxiliary milestone.** RTW status surfaces as a separate badge on the user's profile; promotion engine does not gate Certified on RTW. | Product spec §3.1 frames RTW as a discrete legal compliance signal, not a trust-ladder rung. Tying it to Certified would conflate "trade competence" with "legal right to work." |
| 2026-05-05 | **Provider feature flag (`stripe_identity: bool`)** mirrors Auth's `/auth/providers` pattern. SPA hides Identity CTA when false; Trust Ladder shows the unavailable copy. | Keeps the SPA from offering a flow that will fail. Same pattern as Google sign-in CTA hiding. |
| 2026-05-05 | ~~**HMRC CIS verification: deferred to Phase 2.**~~ **SUPERSEDED 2026-05-05 by row below.** | — |
| 2026-05-05 | **REVISED:** HMRC CIS in scope as production-ready manual flow. Worker submits UTR + NI via structured form (no file); staff verifies on gov.uk gateway; approval writes `HMRC_CIS_VERIFIED` milestone (auxiliary badge, not a ladder rung). | Owner clarified "финальная стадия — production-ready, not Phase 2." Manual gateway lookup IS production-ready (it's how thousands of UK construction firms verify CIS today). Adds new doc_type `HMRC_CIS_DOCUMENT` and metadata shape `{ utr, ni_number }` with sensitive-data handling rules (never log credentials; column-level encryption if available). |
| 2026-05-05 | **Trade certifications: production-ready manual review against public registers.** CSCS, Gas Safe, NICEIC, FIRAS. Side panel offers "Verify on register" button with the public lookup URL. API integrations slot in additively when partnerships land — they don't replace the manual flow. | Owner clarified production-readiness scope. Manual lookup is a real workflow (staff opens the register's public page, types in the credential number, confirms a match) — not a placeholder. The manual flow is auditable, scales with staff headcount, and is the same process competitor verification companies run. |
| 2026-05-05 | **Right-to-Work: production-ready manual via gov.uk lookup.** Worker submits 9-char share code (regex-validated); staff opens gov.uk Right-to-Work check in a new tab, enters share code + worker DOB, confirms, approves. Auxiliary milestone `RIGHT_TO_WORK_VERIFIED`. | Same rationale: gov.uk Right-to-Work Online Employer Checking Service is the official UK process. Manual click-through against it is the production way until HMG enrolment lands an automated API hand-shake. |
| 2026-05-05 | **No "Phase 2" deferrals in this spec.** Every credential type has a chosen production path (auto via free public API or manual via official register) shipping in this feature. Future API integrations are additive milestone-types, not blocking work. | Owner: "у нас уже финальная стадия, поэтому всё должно быть продакшн реди". Reframes the auto-vs-manual table: it's not a wishlist of "what we'll build later," it's the chosen production model for each credential. |
| 2026-05-05 | **Manual is the production model for the majority of doc types** (CSCS / Gas Safe / NICEIC / FIRAS / RTW / HMRC CIS / Insurance / Letterhead). Only Stripe Identity and Companies House are auto on day one. Future automation roadmap captured in §13.3 with per-credential prerequisites (partnerships, enrolments) and a common upgrade pattern. | Owner clarification: "пускай по большинству это будет мануально, в спеке опиши что нужно для автоматизации этого в будущем." Manual review is real production workflow — staff opens the public register, types in the credential number, confirms, approves. The roadmap means future engineers don't have to redesign each integration; they slot in additively against the existing milestone types. |
| 2026-05-05 | **Document assignment system: pull-with-default-assignee.** Auto-assign new uploads to the on-duty staff with the smallest open-document workload (deterministic tie-break by oldest `staff_member.created_at`). Fallback: unassigned bucket when no staff on duty. Reassignment on duty-off / deactivation / admin override / claim. Non-admin staff scoped to `mine` + `unassigned`; admins see `all`. Decision endpoint enforces "must be assignee or admin." | Owner explicitly requested workload-balanced assignment with a working-hours signal. Manual `is_on_duty` toggle (no schedule table) keeps the MVP small. Pure-function `assignNext()` is unit-testable; transactional updates avoid double-assignment races. |
| 2026-05-05 | **Email notifications on Stripe Identity outcome.** `verified` → `MailService.sendVerificationVerified` ("you're verified, badge upgraded to Basic"). `requires_input` → `MailService.sendVerificationFailed` (with the Stripe error code, link to retry). Both fire-and-forget so SMTP transients don't trip the webhook (which would cause Stripe to redeliver and double-promote). | Owner asked for outcome emails on both pass and fail. Without them, users who close the Stripe redirect tab have no clue whether the check succeeded — the only signal is the badge changing on next profile load. The fail email also tells them the specific failure code so they know whether to retry or reach support. |
| 2026-05-05 | **CTA visibility: hide ONLY while Stripe is `processing`.** `requires_input` / `canceled` / `null` → CTA visible (labeled "Try again" when last attempt failed). `verified` (or `verification_level >= BASIC`) → CTA hidden, success state. | Owner: button shouldn't disappear forever after a single failure — that strands the user. The original logic conflated `requires_input` with "in progress" and made retry impossible from the UI. |
| 2026-05-05 | **Public surface: extend `/verification/levels/:id` with `flags` + `reviews`.** Booleans for each milestone type + a list of approved trade-cert doc types + `{review_count, average}`. Doc IDs / titles / staff actor still private. Frontend `<MilestonesStrip>` reads this and renders one Badge per truthy signal in `ProfileHeader`. | Owner: "the user is certified, has reviews, etc." — just a single rung-level badge wasn't enough context for other marketplace participants. Booleans don't leak privacy (no doc IDs, no metadata, no actor) and answer the "what specifically did this person verify" question. |
| 2026-05-05 | **Role-scoped Documents + OTHER title.** Worker doc types and Employer doc types are disjoint sets except for INSURANCE + OTHER. The Portfolio tab is worker-only (employers don't have portfolios). `OTHER` requires `metadata.title` (3–100 chars) at upload time, validated server-side; surfaced everywhere the doc is shown (checklist row, my-documents list, staff queue). | Owner: "сотруднику не зачем заполнять документы которые нужны для работодателя и наоборот" — visible cross-role options are noise. OTHER without a title makes the queue / checklist read "OTHER" with no context, useless to staff. |
| 2026-05-05 | **PROJECT_PHOTO removed.** Dropped from `DOCUMENT_DOC_TYPES` (backend) and `DOC_TYPES` (frontend). Project photos remain a portfolio concept handled by `PortfolioItem`; they never belonged in the verification queue (no milestone, no review value). | Owner asked to drop it after the role-scoping pass — leaving it as a worker option implied verification staff would review project photos, which they don't. Cleaner enum, cleaner UX. |
| 2026-05-05 | **Trust signals on every contact surface.** Conversation inbox now ships `other_participant.verification_level` + `client_profile_id` so `<ConversationListItem>` can render `<VerificationBadge>` next to the participant name. Own ProfilePage gets a `<MyTrustSummary>` block (level badge + `<MilestonesStrip>`) calling the same public `/verification/levels/:id` endpoint. | Owner: "має бути видно в оголошеннях і в себе в профілі, також при будь якому контакті з іншими користувачами." Trust info needs to be one glance away anywhere users meet — listings, messages, own profile — not buried under a profile click. Reusing the public endpoint avoids fan-out: same response shape powers public detail pages, own profile, and (eventually) any future contact surface. |
