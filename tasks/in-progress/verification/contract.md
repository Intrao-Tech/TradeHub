# Contract — verification

Concrete technical decisions for implementation. Sealed on **2026-05-05**.

This document is **the single source of API shapes, DB columns, and routing rules** for verification. Any deviation in code is a bug. Any change to this document must come with a matching update in `spec.md` (Decisions Log) per the working principle in repo `CLAUDE.md`.

Adjacent contracts to read alongside this one:
- `tasks/done/auth-flow/contract.md` — `verification_state` ≠ `verification_level`; `AccountStateGuard` gates `ACTIVE` only.
- `tasks/done/profiles/contract.md` — Profiles consumes `verification_level`, `Document.rejection_reason`, `/verification/ladder/:id`.

---

## 1. Schema migrations

### 1A. `add_document_review_fields`

```prisma
model Document {
  id                BigInt    @id @default(autoincrement())
  client_profile_id BigInt
  doc_type          String    @db.VarChar(40)        // widened from 30
  file_url          String    @db.VarChar(500)
  status            String    @default("PENDING") @db.VarChar(20)
  rejection_reason  String?   @db.VarChar(500)        // ← new
  metadata          Json?                              // ← new (free-form per-doc-type structured data)
  assigned_to       BigInt?                            // ← new (staff_member.id, current assignee)
  reviewed_by       BigInt?                            // ← new (staff_member.id, who decided)
  reviewed_at       DateTime? @db.Timestamptz()
  created_at        DateTime  @default(now()) @db.Timestamptz()

  client_profile           ClientProfile           @relation(fields: [client_profile_id], references: [id], onDelete: Cascade)
  assignee                 StaffMember?            @relation("DocumentAssignee", fields: [assigned_to], references: [id])
  reviewer                 StaffMember?            @relation("DocumentReviewer", fields: [reviewed_by], references: [id])
  moderation_items         ModerationItem[]
  portfolio_item_documents PortfolioItemDocument[]

  @@index([client_profile_id, status])
  @@index([status, created_at])                     // ← new (queue-fairness)
  @@index([assigned_to, status])                    // ← new (per-assignee count for assignment algo)
  @@map("document")
}
```

`doc_type` widened from 30 → 40 chars to fit the longest new value. `assigned_to` and `reviewed_by` are intentionally separate columns — `assigned_to` is the **current responsibility pointer** (changes during reassignments, may be null), `reviewed_by` is **who actually decided** (terminal, written once on approve/reject).

### 1B. `add_milestone_staff_actor_and_duty`

```prisma
model VerificationMilestone {
  id                BigInt    @id @default(autoincrement())
  client_profile_id BigInt
  milestone_type    String    @db.VarChar(40)        // widened from 30
  staff_member_id   BigInt?                            // ← new (null when written by webhook)
  achieved_at       DateTime  @default(now()) @db.Timestamptz()
  expires_at        DateTime? @db.Timestamptz()
  evidence_ref      String?   @db.VarChar(500)
  notes             String?
  created_at        DateTime  @default(now()) @db.Timestamptz()

  client_profile ClientProfile @relation(fields: [client_profile_id], references: [id], onDelete: Cascade)
  actor          StaffMember?  @relation(fields: [staff_member_id], references: [id])

  @@index([client_profile_id])
  @@index([client_profile_id, milestone_type])      // ← new (promotion-engine lookup)
  @@map("verification_milestone")
}

model StaffMember {
  id                BigInt    @id
  display_name      String    @db.VarChar(100)
  staff_role        String    @db.VarChar(20)
  is_on_duty        Boolean   @default(false)         // ← new (assignment algorithm input)
  invite_expires_at DateTime? @db.Timestamptz()
  created_at        DateTime  @default(now()) @db.Timestamptz()

  account              Account                 @relation(fields: [id], references: [id], onDelete: Cascade)
  moderation_actions   ModerationAction[]
  assigned_documents   Document[]              @relation("DocumentAssignee")
  reviewed_documents   Document[]              @relation("DocumentReviewer")
  verification_actions VerificationMilestone[]

  @@index([is_on_duty])                                // ← new (assignment-pool lookup)
  @@map("staff_member")
}
```

### 1C. Data migration `rename_verification_level_vocab`

Pure SQL data migration (no schema change — `verification_level` is already `String`):

```sql
UPDATE client_profile SET verification_level = 'BASIC' WHERE verification_level = 'IDENTITY_VERIFIED';
UPDATE client_profile SET verification_level = 'BASIC' WHERE verification_level = 'COMPANY_VERIFIED';
UPDATE client_profile SET verification_level = 'UNVERIFIED' WHERE verification_level NOT IN ('UNVERIFIED', 'BASIC', 'CERTIFIED', 'PREMIUM');
```

Allowed values going forward: `UNVERIFIED` / `BASIC` / `CERTIFIED` / `PREMIUM`. Never `IDENTITY_VERIFIED`, `KYC`, `REVIEWED`, `HMRC`, `COMPANY_VERIFIED` again.

### 1D. Doc-type enum extension (no migration; enforced in DTO)

`backend/src/document/dto/upload-document.dto.ts` `DOCUMENT_DOC_TYPES` array gets these new entries:
- `RIGHT_TO_WORK_SHARE_CODE` (worker only; metadata required)
- `RIGHT_TO_WORK_DOCUMENT` (worker only; PDF/image of right-to-work proof)
- `FIRAS_CERT` (fire-stopping certification — Appendix B)
- `HMRC_CIS_DOCUMENT` (worker only; structured-only — UTR + NI in metadata, no file)

Existing entries (`ID_PHOTO`, `SELFIE`, `INSURANCE`, `CSCS_CARD`, `GAS_SAFE_CERT`, `NICEIC_CERT`, `COMPANY_LETTERHEAD`, `PROJECT_PHOTO`, `OTHER`) unchanged.

### 1E. Document metadata shape (TypeScript types, not DB-enforced)

`Document.metadata` is `Json?`. Per-doc-type expected shapes:

```ts
type DocumentMetadata =
  | { type: 'RIGHT_TO_WORK_SHARE_CODE'; share_code: string /* /^[A-Z0-9]{3} [A-Z0-9]{3} [A-Z0-9]{3}$/ */ }
  | { type: 'HMRC_CIS_DOCUMENT'; utr: string /* /^\d{10}$/ */; ni_number: string /* /^[A-Z]{2}\d{6}[A-Z]$/ */ }
  | { type: 'CSCS_CARD'; card_number?: string; expires_at?: string }
  | { type: 'GAS_SAFE_CERT'; cert_number?: string; expires_at?: string }
  | { type: 'NICEIC_CERT'; cert_number?: string; expires_at?: string }
  | { type: 'INSURANCE'; policy_number?: string; expires_at?: string }
  | null;
```

Server-side validation lives in `backend/src/document/validators/metadata.validator.ts`. Strictly enforced: `share_code` regex, `utr` regex, `ni_number` regex. The other fields are optional capture for staff convenience (future API integrations will lean on them).

**Sensitive-data handling for HMRC**: UTR + NI are PII. Audit-log events for HMRC review carry `document_id` only — never the credentials. Application logs scrub `metadata.utr` and `metadata.ni_number` from any printed `Document` row. Postgres-level column encryption (`pgcrypto`) is set up at deploy time on the `metadata` column; no code-level handling of encryption keys.

---

## 2. Endpoints

All under `/verification/*` unless noted. All use `JwtAuthGuard` for auth except `/verification/levels/:id` (public) and `/verification/providers` (public).

### Reads — user-facing

#### `GET /verification/me`
Auth required. The user's comprehensive verification view (single canonical "give me everything for my own trust state").

Response `200`:
```jsonc
{
  "verification_level": "BASIC",
  "milestones": [
    { "type": "IDENTITY_VERIFIED", "achieved_at": "...", "expires_at": null, "evidence_ref": "vs_xxx" }
  ],
  "documents": {
    "pending":   [{ id, doc_type, file_url, status, created_at, metadata }],
    "in_review": [...],
    "approved":  [...],
    "rejected":  [{ ..., rejection_reason: "Image is too blurry" }]
  },
  "next_action": {
    "rung": "CERTIFIED",
    "label": "Upload a trade certification",
    "doc_types": ["CSCS_CARD", "GAS_SAFE_CERT", "NICEIC_CERT", "FIRAS_CERT"]
  }
}
```

#### `GET /verification/levels/:clientProfileId`
**Public** (no auth). Used by Profiles' worker / employer detail pages, search cards, and the public `<MilestonesStrip>`.

Response `200`:
```jsonc
{
  "verification_level": "CERTIFIED",
  "last_evaluated_at": "2026-05-05T18:15:29.275Z",
  "flags": {
    "identity_verified": true,
    "insurance_approved": true,
    "company_house_verified": false,
    "company_letterhead_approved": false,
    "right_to_work_verified": true,
    "hmrc_cis_verified": false,
    "certification_doc_types": ["CSCS_CARD"]
  },
  "reviews": {
    "count": 12,
    "average": 4.7
  }
}
```

`flags` is a fixed-shape object — booleans for each milestone type plus `certification_doc_types` (list of approved trade-cert doc types). Doc IDs, titles, metadata, and staff actor IDs are NOT exposed publicly.

`reviews` is sourced from the worker / employer profile aggregates (`rating_count`, `rating_avg`). When the profile has neither rated worker nor rated employer, both fields are zero / null.

Errors: `404 NOT_FOUND` if the client profile doesn't exist OR is on a deactivated account (don't leak deactivation).

#### `GET /verification/ladder/:clientProfileId`
Auth required. Owner OR staff. Returns the panel data for `<TrustLadderPanel>`.

Response `200`:
```jsonc
{
  "current_level": "BASIC",
  "rungs": [
    {
      "level": "UNVERIFIED",
      "state": "DONE",
      "label": "Account created",
      "completed_at": "..."
    },
    {
      "level": "BASIC",
      "state": "DONE",
      "label": "Identity verified",
      "completed_at": "...",
      "evidence": { "type": "stripe_identity", "session_id": "vs_xxx" }
    },
    {
      "level": "CERTIFIED",
      "state": "NOT_STARTED",
      "label": "Upload a trade certification",
      "next_doc_types": ["CSCS_CARD", "GAS_SAFE_CERT", "NICEIC_CERT", "FIRAS_CERT"],
      "estimated_time": "Usually takes 24-48h after upload"
    },
    {
      "level": "PREMIUM",
      "state": "COMING_SOON",
      "label": "Coming soon — requires 5+ verified reviews"
    }
  ]
}
```

Forbidden: `403 FORBIDDEN` for non-owner non-staff.

### Stripe Identity (path to Basic)

#### `POST /verification/identity/start`
Auth required (`ACTIVE` only — gated by `AccountStateGuard + @RequiresVerifiedEmail()`). No body.

Response `200`:
```jsonc
{ "verification_url": "https://verify.stripe.com/start/...", "session_id": "vs_xxx", "status": "requires_input" }
```

Errors:
- `409 ALREADY_VERIFIED` — user already at Basic or higher.
- `503 STRIPE_NOT_CONFIGURED` — Stripe not configured server-side.

Audit: `verification.identity.started`.

#### `GET /verification/identity/status`
Auth required. Returns the status of the user's most recent Stripe Identity session, useful for diagnostic polling.

Response `200`:
```jsonc
{ "session_id": "vs_xxx" | null, "status": "requires_input" | "processing" | "verified" | "canceled" | null }
```

Returns `null` for both fields if the user has never started an Identity session.

#### `POST /webhooks/stripe` (Stripe-side webhook, existing endpoint)
Stripe Identity events handled server-side (no public endpoint added):
- `identity.verification_session.verified` → write `IDENTITY_VERIFIED` milestone, run promotion engine, audit `verification.identity.verified`, send `MailService.sendVerificationVerified(email, display_name)` (fire-and-forget). **Idempotent** — duplicate events for the same session are no-ops (no second milestone, no second email).
- `identity.verification_session.requires_input` → audit `verification.identity.failed { reason: session.last_error.code }`, send `MailService.sendVerificationFailed(email, display_name, reason)` (fire-and-forget). No promotion.
- Other Identity events → ignored (intermediate / canceled).

**Mail dispatch is fire-and-forget** so an SMTP transient cannot bubble up and cause Stripe to redeliver the webhook (which would double-promote). When SMTP is not configured (`SMTP_USER` / `SMTP_PASS` empty) the mail call is a no-op with a warning log; the webhook still completes.

### Document review (path to Certified)

#### `GET /verification/queue?status=&doc_type=&page=&limit=`
Staff-only (`@Roles('STAFF')`). Paginated queue.

Query params:
- `status` (optional, default `PENDING,IN_REVIEW`) — comma-separated subset of `PENDING / IN_REVIEW / APPROVED / REJECTED`
- `doc_type` (optional, default all)
- `page` (default 1)
- `limit` (default 20, max 100)

Response `200`:
```jsonc
{
  "items": [
    {
      "document": { id, doc_type, file_url, status, rejection_reason, metadata, created_at, reviewed_at, reviewed_by },
      "uploader": { id: clientProfileId, display_name, role: "WORKER" | "EMPLOYER" }
    }
  ],
  "total": 42, "page": 1, "limit": 20
}
```

Default sort: `created_at ASC` (oldest pending first — fairness).

#### `GET /verification/queue/:id`
Staff-only. Single queue item with full uploader profile snippet AND the uploader's prior history of same-doc-type documents (re-upload context).

Response `200`:
```jsonc
{
  "document": { ... },
  "uploader": {
    "id": ...,
    "display_name": "...",
    "role": "WORKER" | "EMPLOYER",
    "verification_level": "UNVERIFIED" | "BASIC" | "CERTIFIED" | "PREMIUM"
  },
  "reviewer": { "id": ..., "display_name": "..." } | null,
  "history": [
    /* prior documents with the same doc_type from the same uploader, oldest-first */
    { id, status, rejection_reason, created_at, reviewed_at }
  ]
}
```

#### `POST /verification/documents/:id/review`
Staff-only. The single canonical staff decision endpoint.

Body:
```jsonc
{ "decision": "APPROVE" | "REJECT", "reason": "string?" }
```
- `reason` is **required** when `decision = "REJECT"`. Min 10, max 500 chars.
- `reason` is **forbidden** when `decision = "APPROVE"` (validation rejects with `400 VALIDATION`).

Server-side state-transition gate (per VER-033):
- `PENDING` → `APPROVED` / `REJECTED` ✓
- `IN_REVIEW` → `APPROVED` / `REJECTED` ✓
- `APPROVED` → terminal ✗ (returns `409 INVALID_TRANSITION`)
- `REJECTED` → terminal ✗

Response `200`:
```jsonc
{
  "document": { ..., "status": "APPROVED" | "REJECTED", rejection_reason, reviewed_by, reviewed_at },
  "level_changed": { "from": "BASIC", "to": "CERTIFIED" } | null,
  "milestones_written": [
    { "type": "CERTIFICATION_APPROVED", "id": "..." },
    { "type": "LEVEL_PROMOTED", "id": "...", "notes": "CERTIFIED" }
  ]
}
```

Side effects on `decision = APPROVE`:
1. `Document.status = APPROVED`, `reviewed_by = user.staffMemberId`, `reviewed_at = now()`.
2. Write per-evidence `VerificationMilestone` mapped from `doc_type` (see VER-051 mapping table).
3. Run promotion engine — if the rung changes, write a `LEVEL_PROMOTED` milestone and update `client_profile.verification_level`.
4. Audit log: `verification.document.reviewed { decision: 'APPROVE', document_id }` and (if level changed) `verification.level_changed { from, to, evidence_milestones: [...] }`.

Side effects on `decision = REJECT`:
1. `Document.status = REJECTED`, `rejection_reason = body.reason`, `reviewed_by`, `reviewed_at`.
2. **No** milestone written (rejection is not a milestone).
3. **No** promotion engine run (rejection cannot advance the level; demotion-on-rejection only relevant if the doc was previously approved which is blocked by the state gate).
4. Audit log: `verification.document.reviewed { decision: 'REJECT', document_id, reason }`.

#### `POST /verification/documents/:id/claim` (Should, MVP-optional)
Staff-only. Soft-lock by setting `status = IN_REVIEW`, `reviewed_by = self`. No body. Used to signal "I'm working on this" to other staff. Optional in MVP — can ship with direct PENDING → APPROVED transitions.

#### Doc upload (existing endpoint, EXTENDED)

`POST /documents/upload` (existing) — extended to accept `metadata` as a JSON-string form field alongside `doc_type` and `file`. Server-side: parses the JSON and validates per the metadata-shape table (1E). Reject with `400 INVALID_METADATA` on shape mismatch. Reject with `400 INVALID_SHARE_CODE` on RTW share-code regex mismatch.

#### `PATCH /documents/:id/status` (DEPRECATED)

Endpoint stays in the routing table for one release for backward compatibility, but:
- Logs a deprecation warning on every call.
- Removed from Swagger / `/api/docs`.
- Internal callers migrated to `POST /verification/documents/:id/review`.
- Removed entirely in the next major.

### Document assignment & staff duty

#### `POST /staff/me/duty`
Staff-only (`@Roles('STAFF')`). Body `{ on_duty: boolean }`. Toggles `staff_member.is_on_duty` for the current user. When toggling **off**: any of the staff's `PENDING` or `IN_REVIEW` documents are reassigned via the assignment algorithm in a single transaction.

Response `200`:
```jsonc
{ "on_duty": false, "reassigned": 3 }
```

Audit: `staff.duty_changed { on_duty, reassigned_count }`.

#### `POST /verification/documents/:id/assign`
ADMIN only. Body `{ staff_member_id: number | null }`. `null` removes assignment (returns to unassigned bucket). Target staff (if not null) must be on-duty AND `account.status === 'ACTIVE'`.

Response `200`: `{ document, previous_assignee_id: number | null }`.

Errors: `400 STAFF_OFF_DUTY` if target not on duty; `400 STAFF_DEACTIVATED` if target deactivated; `404 STAFF_NOT_FOUND`.

Audit: `verification.document.assigned { from, to, reason: 'admin_reassign' }`.

#### `POST /verification/documents/:id/claim`
Staff-only. Claims an unassigned document (`assigned_to IS NULL`). Returns `409 ALREADY_ASSIGNED` if the doc has an assignee. Atomic — uses an `UPDATE ... WHERE assigned_to IS NULL` SQL guard.

Response `200`: `{ document, assigned_to: <self.id> }`.

Audit: `verification.document.assigned { from: null, to: <self.id>, reason: 'claim' }`.

#### `POST /verification/employer/companies-house-verify`
Auth required, employer role. No body — server reads `EmployerProfile.company_name` + `company_number` from the current user's profile and calls Companies House API (`https://api.company-information.service.gov.uk/company/{company_number}` with `Authorization: Basic base64(api_key:)`).

Response `200`:
```jsonc
{ "matched": true, "milestone_id": "...", "registry_company_name": "ACME BUILD LIMITED" }
```

Errors:
- `400 COMPANIES_HOUSE_MISMATCH { registry_response: { name, status } }` — name mismatch or `company_status !== 'active'`
- `404 COMPANIES_HOUSE_NOT_FOUND` — no company with that number
- `503 COMPANIES_HOUSE_NOT_CONFIGURED` — env key missing

Audit: `verification.companies_house.checked { result }`.

### Provider feature flag

#### `GET /verification/providers`
Public. Mirrors Auth's `/auth/providers` pattern.

Response `200`:
```jsonc
{ "stripe_identity": true, "companies_house": true }
```

Computed at boot from env (`STRIPE_SECRET_KEY` non-empty for Stripe; `COMPANIES_HOUSE_API_KEY` non-empty for CH).

---

## 3. Promotion engine

### Algorithm (pseudo-code)

```ts
async function evaluateLevel(clientProfileId: bigint): Promise<Level> {
  const role = await getRole(clientProfileId); // 'WORKER' | 'EMPLOYER'
  const milestones = await getMilestones(clientProfileId);
  const docs = await getApprovedDocuments(clientProfileId);
  const reviewCount = await countVerifiedReviews(clientProfileId); // returns 0 in MVP

  const isBasic = milestones.some((m) => m.milestone_type === 'IDENTITY_VERIFIED');
  if (!isBasic) return 'UNVERIFIED';

  const isCertified = role === 'WORKER'
    ? docs.some((d) => CERT_DOC_TYPES.includes(d.doc_type))
    : docs.some((d) => d.doc_type === 'INSURANCE') &&
      docs.some((d) => d.doc_type === 'COMPANY_LETTERHEAD');
  if (!isCertified) return 'BASIC';

  // Premium predicate — returns false in MVP because reviewCount is 0
  // and Companies House manual flag isn't implemented.
  const isPremium = role === 'WORKER'
    ? reviewCount >= 5
    : reviewCount >= 5 && /* companies-house flag */ false;
  if (!isPremium) return 'CERTIFIED';

  return 'PREMIUM';
}

const CERT_DOC_TYPES = ['CSCS_CARD', 'GAS_SAFE_CERT', 'NICEIC_CERT', 'FIRAS_CERT'];

async function runPromotion(clientProfileId: bigint, evidence: { milestoneIds: bigint[]; staffMemberId: bigint | null; ip?: string }) {
  const newLevel = await evaluateLevel(clientProfileId);
  const profile = await prisma.clientProfile.findUnique({ where: { id: clientProfileId } });
  if (profile.verification_level === newLevel) return null;

  await prisma.$transaction([
    prisma.clientProfile.update({
      where: { id: clientProfileId },
      data: { verification_level: newLevel },
    }),
    prisma.verificationMilestone.create({
      data: {
        client_profile_id: clientProfileId,
        milestone_type: 'LEVEL_PROMOTED',
        staff_member_id: evidence.staffMemberId,
        evidence_ref: evidence.milestoneIds.join(','),
        notes: newLevel,
      },
    }),
  ]);
  await audit.log(profile.id, 'verification.level_changed', 'client_profile', profile.id, {
    from: profile.verification_level,
    to: newLevel,
    evidence_milestones: evidence.milestoneIds.map(String),
  }, evidence.ip);

  return { from: profile.verification_level, to: newLevel };
}
```

### Triggers

| Trigger | Caller | Evidence milestones |
|---|---|---|
| `identity.verification_session.verified` webhook | `WebhooksController.handleStripeWebhook` → `VerificationService.handleIdentityVerified` | `[IDENTITY_VERIFIED.id]` |
| `POST /verification/documents/:id/review` with `decision=APPROVE` | `VerificationController.review` → `VerificationService.reviewDocument` | `[<per-doc-type milestone>.id]` |
| Staff manual demotion (NOT IMPLEMENTED MVP) | — | — |

### Idempotence

The engine is naturally idempotent — re-running on the same milestone state yields the same level, and the `LEVEL_PROMOTED` milestone is only written when the level actually changes. Re-running a Stripe webhook for the same session produces the same result (no extra `IDENTITY_VERIFIED` milestone is written because the webhook handler checks for existing `evidence_ref = session_id`).

### Demotion path (defined, not exposed in MVP)

If a staff member or admin invalidates a milestone (manual SQL today; future endpoint), the engine evaluates the new state. If the user no longer qualifies for their current level, `verification_level` drops to whatever level they currently qualify for. A `LEVEL_PROMOTED` milestone is written with the new (lower) level — naming is a slight misnomer for demotions, but we keep one milestone-type for both directions; readers can compare with the previous milestone to determine direction.

---

## 4. Per-doc-type milestone mapping (VER-051)

| `Document.doc_type` | Milestone written on APPROVE | Affects rung |
|---|---|---|
| `ID_PHOTO`, `SELFIE` | (none — staff rejects these with "use Stripe Identity") | none |
| `CSCS_CARD` | `CERTIFICATION_APPROVED` | Worker → Certified |
| `GAS_SAFE_CERT` | `CERTIFICATION_APPROVED` | Worker → Certified |
| `NICEIC_CERT` | `CERTIFICATION_APPROVED` | Worker → Certified |
| `FIRAS_CERT` | `CERTIFICATION_APPROVED` | Worker → Certified |
| `INSURANCE` | `INSURANCE_APPROVED` | Employer → Certified |
| `COMPANY_LETTERHEAD` | `COMPANY_LETTERHEAD_APPROVED` | Employer → Certified |
| `RIGHT_TO_WORK_SHARE_CODE` | `RIGHT_TO_WORK_VERIFIED` | none (auxiliary badge) |
| `RIGHT_TO_WORK_DOCUMENT` | `RIGHT_TO_WORK_VERIFIED` | none (auxiliary badge) |
| `HMRC_CIS_DOCUMENT` | `HMRC_CIS_VERIFIED` | none (auxiliary badge) |
| `PROJECT_PHOTO`, `OTHER` | (none — portfolio support, not a verification signal) | none |

Stripe Identity webhook writes `IDENTITY_VERIFIED` directly (no `Document` row). Companies House `POST /verification/employer/companies-house-verify` writes `COMPANY_HOUSE_VERIFIED` directly (no `Document` row).

`ID_PHOTO` and `SELFIE` exist as legacy doc_types from before Stripe Identity was wired. Once the manual queue is shipped, staff should reject incoming `ID_PHOTO` / `SELFIE` uploads with the reason "Please use the Stripe Identity flow at /profile → Verify identity." A future cleanup ticket removes them from the doc_type enum.

---

## 5. Frontend additions

### New components

- `web/src/components/verification/TrustLadderPanel.tsx` — owned by Profiles per `tasks/done/profiles/followups.md §1`, but the data shape is sealed here. Reads `GET /verification/ladder/:clientProfileId`.
- `web/src/components/admin/VerificationQueueTab.tsx` — staff-side queue list + decision controls (Approve / Reject / Claim) + filters. Replaces the legacy "Documents" tab in `AdminPage`.
- `web/src/components/MilestonesStrip.tsx` — public-facing strip of small Badge chips (Identity, Insurance, Companies House, Letterhead, Right to work, HMRC CIS, per-cert chips, Reviews). Reads `flags` + `reviews` blocks from `GET /verification/levels/:id`. Mounted inside `ProfileHeader` so every public + own profile picks it up.

### Updated components

- `web/src/components/VerificationBadge.tsx` — vocab swapped to `unverified | basic | certified | premium`. `verificationFromLevel(level)` retained as a forgiving normaliser (accepts upper / lower case, unknowns → `unverified`).
- `web/src/components/profile/ProfileHeader.tsx` — accepts a new `clientProfileId` prop; when provided, fetches `/verification/levels/:id` and renders `<MilestonesStrip>` underneath the rating row.
- `web/src/components/profile/DocumentsTab.tsx` — role-scoped doc-type lists (workers vs employers); `OTHER` requires a `metadata.title` (3–100 chars) input that gates the upload button and shows up wherever the doc is rendered.
- `web/src/pages/ProfilePage.tsx` — `Portfolio` tab gated on `isWorker` (hidden for employers).
- `web/src/pages/AdminPage.tsx` — "Documents" tab renamed "Verification"; content swapped to `<VerificationQueueTab />`.

### Helpers

- `web/src/hooks/useVerificationMe.ts` — query hook returning `GET /verification/me`. Cached per session, invalidated after document upload / review actions.
- `web/src/hooks/useVerificationLadder.ts` — query hook returning `GET /verification/ladder/:id`. Used by `TrustLadderPanel`.

---

## 6. Audit events

Written via `AuditService.log(account_id, action, entity_type?, entity_id?, metadata?, ip?)`.

| Event | When | metadata |
|---|---|---|
| `verification.identity.started` | `POST /verification/identity/start` succeeds | `{ session_id }` |
| `verification.identity.verified` | Stripe webhook `verified` | `{ session_id }` |
| `verification.identity.failed` | Stripe webhook `requires_input` | `{ session_id, reason }` |
| `verification.document.reviewed` | `POST /verification/documents/:id/review` succeeds | `{ decision, document_id, doc_type, reason? }` |
| `verification.level_changed` | Promotion engine writes a new level | `{ from, to, evidence_milestones: bigint[] }` |
| `verification.share_code_submitted` | RTW upload validates | `{ document_id }` |

`account_id` is the **subject** (the user whose verification state changed), not the actor. Staff actions are tracked by `staff_member_id` in the metadata or via the `Document.reviewed_by` foreign key, not by repurposing `account_id`.

### 6.1 Outgoing emails

Sent via `MailService` (existing service, fire-and-forget — when SMTP is not configured the call is a no-op with a warning log).

| Email | Trigger | Recipient | Method |
|---|---|---|---|
| `Identity verified ✅` | Stripe webhook `verified` (post-promotion) | The verifying user | `MailService.sendVerificationVerified(email, display_name)` |
| `Verification didn't go through` | Stripe webhook `requires_input` | The verifying user | `MailService.sendVerificationFailed(email, display_name, reason)` |

The success email links to `/profile`, the failure email links to `/profile?verification=retry`. Both are HTML with a plain-text fallback (HTML stripped by the existing `send()` helper). Subject lines are stable so users can grep / filter; copy lives entirely in `MailService` so spec changes here translate to a single file edit.

---

## 7. Rate limits

Per-route `@Throttle` decorators on top of the global 60/min:

| Endpoint | Limit | Window |
|---|---|---|
| `POST /verification/identity/start` | 5 | 1 hour per IP (avoid Stripe billing spike) |
| `POST /documents/upload` | 30 | 1 hour per IP (file uploads are heavier) |
| `POST /verification/documents/:id/review` | 60 | 1 minute per staff_member (queue-clearing rate) |
| `GET /verification/me` | 60 | 1 minute per IP |
| `GET /verification/queue` | 120 | 1 minute per IP (staff polling) |

---

## 8. Environment variables

```bash
STRIPE_SECRET_KEY="sk_..."             # required for /verification/identity/* to function
STRIPE_WEBHOOK_SECRET="whsec_..."       # required to verify the Identity webhook signature
COMPANIES_HOUSE_API_KEY="..."           # required for /verification/employer/companies-house-verify
FRONTEND_URL="..."                      # used for Stripe `return_url`
```

When a key is empty, the corresponding boolean in `GET /verification/providers` is `false` and the SPA hides the CTA. Production must have all three set.

---

## 9. Removal / deprecation list

To be done as part of this feature, in this order:

1. **Schema** — apply the three migrations (1A, 1B, 1C).
2. **`POST /verification/start`** → renamed to `POST /verification/identity/start`. Old route stays for one release with a 308 redirect; logs a deprecation warning.
3. **`PATCH /documents/:id/status`** → REMOVED. The endpoint is gone (no callers remain) — staff decisions go through `POST /verification/documents/:id/review` only. The `UpdateDocumentStatusDto` file is also deleted.
4. **`ID_PHOTO` / `SELFIE` doc types** → REMOVED from the upload DTO. Stripe Identity owns the ID + selfie path; manual review of those types was redundant and confusing.
5. **`web/src/components/VerificationBadge.tsx`** → vocab updated to `unverified | basic | certified | premium`. `verificationFromLevel()` retained as a forgiving normaliser (accepts mixed case, unknowns → `unverified`) since profile shapes ship the level as a free-form string.
6. **`web/src/pages/AdminPage.tsx`** → "Documents" tab renamed to "Verification"; primitive form replaced with `<VerificationQueueTab />`.

---

## 10. Acceptance pre-flight

Before marking VER-* requirement done:
1. `cd backend && npm run lint` clean
2. `cd backend && npx prisma format` and `npx prisma migrate dev` clean
3. `cd backend && npx tsc --noEmit` clean
4. `cd backend && npm run test` (unit specs) and `npm run test:e2e` (e2e specs against Testcontainer Postgres) green
5. `cd web && npm run lint:tokens` clean
6. `cd web && ./node_modules/.bin/vite build` clean
7. `cd web && npm test` (Vitest) and `npm run test:e2e` (Playwright with live backend) green
8. Manual smoke matrix at 375 px and desktop, light + dark:
   - User: Stripe Identity test-mode flow → Basic
   - User: upload CSCS → wait for staff → Certified
   - User: upload garbage CSCS → staff rejects with reason → user sees reason on Documents tab → user re-uploads
   - User: submit RTW share code `W12 ABC 345` → staff approves → `RIGHT_TO_WORK_VERIFIED` badge appears
   - Staff: queue filtering by status / doc_type, sort default oldest-first, side-panel preview works for PDF and image
   - Public: badge renders correctly on `/workers/:id` and `/employers/:id`
9. Swagger `/api/docs` visually checked for all `/verification/*` endpoints with full DTO shapes.
10. Profiles' followups §1 (Trust Ladder Panel) and §2 (RTW form) are now unblocked — open companion PRs in the Profiles repo if needed.
