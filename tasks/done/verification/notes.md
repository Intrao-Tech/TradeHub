# Notes — Verification

Codebase snapshot at the start of implementation, plus research on Stripe Identity that informs the spec / contract.

## Current Codebase Snapshot

### Backend — schema (`backend/prisma/schema.prisma`)

- `client_profile.verification_level: String, default "UNVERIFIED"` — only ever set to `"IDENTITY_VERIFIED"` by the Stripe webhook today. No other writes anywhere in the codebase.
- `Document` model has `id`, `client_profile_id`, `doc_type` (free string with class-validator gate), `file_url`, `status` (PENDING / IN_REVIEW / APPROVED / REJECTED), `reviewed_at`, `created_at`. **No `rejection_reason`. No `metadata`. No `reviewed_by`.**
- `VerificationMilestone` table exists but has zero writes anywhere in the codebase. Fields: `id`, `client_profile_id`, `milestone_type`, `achieved_at`, `expires_at`, `evidence_ref`, `notes`, `created_at`.
- `ModerationItem` is the polymorphic generic-moderation table. `Document` already auto-creates a `ModerationItem(entity_type='DOCUMENT', queue_type='DOCUMENT')` row on first status change via `DocumentService.ensureModerationItem` (`backend/src/document/document.service.ts:83-97`). The generic moderation queue (`/moderation/queue`) reads these.

### Backend — verification module (`backend/src/verification/`)

- `verification.controller.ts`: two endpoints today.
  - `POST /verification/start` — creates a Stripe Identity session (calls `verification.service.ts createSession`)
  - `GET /verification/status` — returns `{ verification_level }` from `client_profile`
- `verification.service.ts:23-63`: `createSession` requires Stripe configured, throws `503 ServiceUnavailableException` otherwise. Creates a session of `type: 'document'`, `allowed_types: ['driving_license', 'passport', 'id_card']`, `require_matching_selfie: true`. Sets `metadata.account_id` and `metadata.client_profile_id`.
- `verification.service.ts:65-97`: `handleWebhookEvent` — handles `identity.verification_session.verified` (writes `client_profile.verification_level = 'IDENTITY_VERIFIED'`) and `identity.verification_session.requires_input` (logs warning only). **Does NOT write a `VerificationMilestone`.** Called from `webhooks/stripe.controller.ts`.

### Backend — document module (`backend/src/document/`)

- `document.controller.ts`:
  - `POST /documents/upload` — multipart upload, doc_type from a fixed enum (`ID_PHOTO`, `SELFIE`, `INSURANCE`, `CSCS_CARD`, `GAS_SAFE_CERT`, `NICEIC_CERT`, `COMPANY_LETTERHEAD`, `PROJECT_PHOTO`, `OTHER`), 10 MiB cap, MIME whitelist (PDF / JPEG / PNG / WebP). Stores file under `./uploads/{uuid}.{ext}`. Returns the document row.
  - `GET /documents/me` — caller's documents.
  - `GET /documents/:id` — owner or staff.
  - `PATCH /documents/:id/status` — staff-only, body `{ status: 'IN_REVIEW' | 'APPROVED' | 'REJECTED' }`. **No rejection reason field.** Enforces a state machine but doesn't capture reason.
  - `DELETE /documents/:id` — owner only, PENDING only.
- `document.service.ts:99-124`: `updateStatus` is the workhorse for `PATCH /documents/:id/status`. Calls `ensureModerationItem` so the `ModerationItem` row exists, then mutates `Document.status` + `reviewed_at`. **Does not run any promotion logic; does not write a `VerificationMilestone`; does not capture reason; does not record `reviewed_by`.**

### Frontend — current verification surface

- `web/src/components/VerificationBadge.tsx`: legacy state union `'unverified' | 'kyc' | 'reviewed' | 'hmrc'`. Includes a translation function `verificationFromLevel(level)` that maps a backend string to the FE state. Profiles' `PROF-032` mandated dropping this once Verification reconciles vocabulary.
- `web/src/pages/AdminPage.tsx:629-668`: "Documents" tab is a primitive form — numeric Document ID input + status dropdown + raw JSON response display. **No queue list, no preview, no reason capture, no audit detail.**
- Profiles' `tasks/done/profiles/contract.md` documents what Profiles consumes from this feature: `verification_level` final naming, `Document.rejection_reason` field, promotion timing, public ladder shape. Profiles' `TrustLadderPanel` (`PROF-032 / 033 / 034`) is on hold in `tasks/done/profiles/followups.md` §1 until this contract seals.

### Auth-flow contract surface (already shipped)

- `tasks/done/auth-flow/contract.md` (sealed 2026-04-26) defines: `verification_state` (`PENDING_EMAIL_VERIFICATION` / `ACTIVE` / `DEACTIVATED`) — orthogonal to `verification_level`. Verification's domain begins at `ACTIVE`; trust-sensitive routes are gated by `AccountStateGuard + @RequiresVerifiedEmail()` (which checks `account.status`, not the level).
- `ApiError` / `parseApiError()` shape from `web/src/api.ts` is the canonical error helper. New endpoints follow the same `{ code, message, ... }` body shape.
- Audit events follow `auth.*` / `staff.*` naming convention (`AuditService.log(account_id, action, entity_type?, entity_id?, metadata?, ip?)`). New verification events use `verification.*`.

### Profiles contract surface (already shipped)

- `tasks/done/profiles/contract.md` defines what Profiles consumes:
  - `useAccountMe()` returns `{ id, email, verification_state, client_profile, ... }` — Profiles' canonical hook. Ladder reads happen via separate hooks (per `PROF-051`).
  - User-side `DocumentsTab` already renders `Document.rejection_reason` as an optional pass-through. Verification adds the column and the rejection text appears.
  - Profiles' RTW form (`PROF-052`) is in `followups.md §2`; it stages a POST to whatever endpoint Verification ships. Sealed contract here is `POST /documents/upload` with `doc_type=RIGHT_TO_WORK_SHARE_CODE` and `metadata.share_code` — Profiles can build against this directly.

## Product spec alignment (`docs/TradeHub_UK_Technical_Specification_v2.docx`)

§3.2 Verification Levels (the source of truth for vocabulary):

| Level | Worker meaning | Employer meaning | MVP computable? |
|---|---|---|---|
| Unverified | account exists, no identity proof | account exists, no identity proof | yes (default) |
| Basic | identity verified via ID + selfie | representative identity verified via ID + selfie | yes (Stripe Identity) |
| Certified | Basic + ≥1 approved trade certification | Basic + insurance approved + company letterhead approved | yes (manual review) |
| Premium | Certified + 5+ verified reviews | Certified + Companies House verified + 5+ reviews | **no** (Reviews not shipped) |

§3.1 (Profile Fields) lists Right-to-Work as a discrete worker field with a share-code path — separate from the trust-ladder rungs.

§7 (Strategic Priorities) puts HMRC CIS verification and Companies House API in Phase 2.

§10 (Admin Panel & Moderation) describes the staff queue UI and audit-trail expectations.

Appendix B (Certification Types) lists the recognised UK trade certifications: CSCS, Gas Safe, NICEIC, FIRAS (fire stopping), and "other" with manual staff review.

## Stripe Identity research (cited)

Stripe Identity is the chosen provider per owner explicit decision (2026-05-05 conversation).

### Session lifecycle

1. **Create**: `stripe.identity.verificationSessions.create({ type, options, metadata, return_url })` → returns a session with a hosted `url` and `id`. We redirect the user there.
2. **Hosted UI**: Stripe collects ID + selfie. User clicks "Done", redirects back to our `return_url`.
3. **Webhook**: `identity.verification_session.verified` fires once Stripe finishes async checks (can be seconds to minutes). This is the authoritative success signal — the `return_url` arrival is NOT (it could fire even if processing isn't done).

Source: https://docs.stripe.com/identity/verification-sessions (read 2026-05-05)

### Webhook events we handle

| Event | Meaning | Our action |
|---|---|---|
| `identity.verification_session.verified` | All checks passed | Write `IDENTITY_VERIFIED` milestone, run promotion engine, audit-log `verification.identity.verified` |
| `identity.verification_session.requires_input` | Failed (mismatch / unsupported doc / etc.); user can retry | Audit-log `verification.identity.failed { reason: session.last_error.code }`. Don't promote. UI shows "Try again". |
| `identity.verification_session.processing` | In-progress | Ignored (intermediate state) |
| `identity.verification_session.canceled` | User abandoned | Ignored |

Source: https://docs.stripe.com/identity/handle-verification-outcomes

### Pricing context

Stripe Identity charges per verified session (~£1.50–£2.00). `ALREADY_VERIFIED` short-circuit (VER-022) prevents re-billing. Test mode is free and the webhook signatures are real — we use Stripe CLI (`stripe listen --forward-to localhost:8081/api/webhooks/stripe`) for local development, same pattern Auth's webhook tests use.

### Trust signal: `email_verified`

Google's OAuth `email_verified` claim is leveraged in Auth (`AUTH-015-002`) for fast-tracking signups. Stripe Identity has a similar trust signal (`session.last_verification_report`) with sub-fields like `document.status`, `selfie.status`. We treat **only** `session.status === 'verified'` as authoritative — sub-field inspection is unnecessary because Stripe wraps them into the top-level status.

## Design-system alignment

Profiles + Auth shipped the design-system patterns:
- Semantic tokens only — `bg-warning-subtle` not `bg-yellow-100`. Lint enforced by `web/scripts/lint-tokens.mjs`.
- shadcn primitives in `web/src/components/ui/` (Card, Sheet, Dialog, Tabs, Select, Badge, Skeleton).
- Mobile-first 375 px, tap targets ≥ 48×48 px.
- Loading: `<Skeleton>` not spinners.
- Error states: `<AuthBanner>` (already used by Auth) — reusable for Verification.

Verification UI conforms to the same patterns. Side panel for the queue uses `<Sheet>`; reject reason modal uses `<Dialog>`.

## Implementation order (notes for the implementing AI)

A natural order:

1. **Schema migrations first** (`add_document_review_fields` + `add_milestone_staff_actor` + `rename_verification_level_vocab` data migration). These unblock everything else.
2. **Backend domain** — `VerificationService.runPromotion()`, refactored Stripe webhook handler, new `POST /verification/documents/:id/review`, new `GET /verification/queue` and `/queue/:id`, new `/verification/me` / `/levels/:id` / `/ladder/:id`, RTW share-code validator.
3. **Audit log calls** in every flow.
4. **Backend tests** — unit (`*.spec.ts`) for `VerificationService.runPromotion()` predicate truth tables; e2e (`*.e2e-spec.ts`) covering the three acceptance flows.
5. **Frontend** — rewrite AdminPage Documents tab into Verification tab with queue + side panel + decision controls; update VerificationBadge to new vocabulary; build `<TrustLadderPanel>` (Profiles' followups §1 unblocks here, but the panel itself is Profiles' code).
6. **Backward-compat retirement** — drop `PATCH /documents/:id/status` from Swagger (keep route for one release per VER-034); drop `verificationFromLevel()` legacy mapper.

## Source links

- Stripe Identity API docs — https://docs.stripe.com/identity/verification-sessions
- Stripe Identity webhook events — https://docs.stripe.com/identity/handle-verification-outcomes
- Stripe Identity testing — https://docs.stripe.com/identity/testing
- Stripe webhook signing — https://docs.stripe.com/webhooks/signatures
- HMG right-to-work share-code format — https://www.gov.uk/prove-right-to-work
- TradeHub product spec: `docs/TradeHub_UK_Technical_Specification_v2.docx` §3.1, §3.2, §7, §10, Appendix B
- Sibling specs: `tasks/done/auth-flow/spec.md`, `tasks/done/profiles/spec.md`, `tasks/done/profiles/contract.md`, `tasks/done/profiles/followups.md`
