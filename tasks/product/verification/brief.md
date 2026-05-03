# Brief

## Feature

Manual document-verification flow for TradeHub MVP — the staff-mediated approval pipeline that turns uploaded documents into trust signals on every profile.

## Problem

TradeHub's positioning as **trust infrastructure for UK construction trades** (`docs/TradeHub_UK_Technical_Specification_v2.docx` §1) lives or dies on whether the verification badges mean something. The backend already has the raw materials — `Document` rows with a `status` enum (`PENDING`, `IN_REVIEW`, `APPROVED`, `REJECTED`), a `client_profile.verification_level` column, and a `VerificationMilestone` table — but the connections between them are missing:

- The staff approval surface in `web/src/pages/AdminPage.tsx:624` is a numeric input + status dropdown. There is no queue view, no document preview, no decision audit trail, no ability to attach a rejection reason.
- `client_profile.verification_level` is only ever set by the existing Stripe Identity webhook (`backend/src/verification/verification.service.ts:82`) which writes the literal string `'IDENTITY_VERIFIED'`. None of the product-spec ladder values (`Basic` / `Certified` / `Premium`) are ever written by anything.
- `VerificationMilestone` is defined in the schema (`backend/prisma/schema.prisma:398`) but **nothing writes to it**. The audit trail of "which approved document advanced this user from Basic to Certified" does not exist.
- `Document` has no `rejection_reason` column. A staff member who rejects a document cannot tell the user why.
- The vocabulary the codebase uses (`UNVERIFIED` / `IDENTITY_VERIFIED` in DB; `unverified | kyc | reviewed | hmrc` in `VerificationBadge.tsx:5`) doesn't match the vocabulary the product spec uses (`Unverified / Basic / Certified / Premium` in §3.2).

The result is that the entire trust layer the product depends on is held together by a 30-line file and a hope. The Profiles feature renders these signals; the Auth feature gates trust-sensitive actions on them; the future Reviews and Referrals features will read them. None of those work credibly until the staff approval flow does.

## Goal

Define and ship the **manual staff document approval workflow** end to end:

- A real staff queue UI (queue list, filter by status, document preview, decision controls, reason capture).
- A consistent `verification_level` promotion engine that watches approved documents and writes the correct ladder rung — Unverified → Basic → Certified → Premium per product spec §3.2.
- `VerificationMilestone` rows written for every promotion so the audit trail exists.
- `Document.rejection_reason` so users learn what to fix.
- Vocabulary reconciliation: pick the product-spec values, migrate the existing data, and update `VerificationBadge` so Profiles renders the same names the product doc uses.
- A documented contract on what `doc_type` values exist, what each contributes to the ladder, and how the manual review process handles each — including Right-to-Work submissions if the feature owner takes that on.

## Users

- Staff / Moderator (the primary user — they live in the queue)
- Admin (sets policy, reviews audit trail)
- Self-Employed Tradesperson (uploads and waits for approval; the speed and clarity of the review affects their conversion)
- Company / Employer (uploads insurance, Companies House proof; same loop)
- Profiles feature (consumes the resulting `verification_level` and `Document.status` data)
- Future Auth-gated features (Job Posts, Applications, Reviews, Referrals, Escrow) — they trust badges this feature produces.

## Expected Outcome

A staff moderator can clear the verification queue without SQL: open the AdminPage, see every pending document in one list, pick one, see the file, see who uploaded it and why, click Approve or Reject (with reason), and watch the user's verification level update automatically. A user whose document is rejected sees the reason on their profile and can re-upload. A user who reaches Certified gets a Gold badge that means something to other tradespeople on the platform.

## Constraints

- Must align vocabulary with `docs/TradeHub_UK_Technical_Specification_v2.docx` §3.2 (Unverified / Basic / Certified / Premium).
- Must consume the existing `Document` and `VerificationMilestone` schema (extend, don't redesign).
- Must not require a third-party identity provider to be configured to function — the manual path stands alone (Stripe Identity stays in place but is parallel, not a dependency).
- Must coexist with the existing `backend/src/verification/` Stripe Identity flow without breaking it (decide whether to keep, replace, or run both — see Open Questions in the spec).
- Must publish a clear contract that `tasks/product/profiles/` (Igor) can consume — Profiles already declares what it expects to read; pin the field names and timing in `contract.md` early.
- Greater London soft launch only — do not over-engineer for HMRC or Companies House API integration in MVP (Phase 2 per product spec §7).

## Boundary with Profiles (`tasks/product/profiles/`)

| Verification owns | Profiles owns |
|---|---|
| Staff document queue UI in AdminPage (queue list, preview, decision controls, audit log) | User-side Documents tab UI (upload, list, status badges, retry) |
| `Document.rejection_reason` column + `PATCH /documents/:id/status` body extension | Rendering of rejection reason in user-side `DocumentList` and `TrustLadderPanel` |
| `client_profile.verification_level` promotion logic + `VerificationMilestone` writes | Trust-ladder display panel, completeness indicator, public-profile badge rendering |
| Vocabulary reconciliation: pick names, migrate existing data, update enums | Consume the chosen names; remove the legacy mapping in `verificationFromLevel()` once the migration lands |
| `doc_type` enum extension (RIGHT_TO_WORK_*, FIRAS_CERT, etc.) per product spec Appendix B | Right-to-Work submission UI (`PROF-052`) — frontend form posts to whatever endpoint Verification ships |
| Decision: Right-to-Work backend in MVP or deferred | If deferred, Profiles' RTW form falls back to a generic `OTHER` upload |
| Stripe Identity flow: keep, replace, or run in parallel | — |
| HMRC / Companies House integration (Phase 2) | — |

## Out of scope (for the first cut)

- Automated identity verification (Stripe Identity is already wired; touch only if reconciling vocabulary forces it).
- HMRC CIS verification (Phase 2 per product spec §7).
- Companies House API integration (Phase 2; manual entry in MVP).
- Subscription or rate-limit changes.
- Reviews-driven Premium-tier promotion (`5+ verified reviews`) — block the Premium rung at "ladder visible but not yet computable" until Reviews ships, same as Profiles does.

## Where to start

The teammate's AI should read, in order:

1. `docs/TradeHub_UK_Technical_Specification_v2.docx` §3.1 (Profile Fields), §3.2 (Verification Levels), §10 (Admin Panel & Moderation), Appendix B (Certification Types).
2. `backend/src/document/document.controller.ts` and `document.service.ts` — the existing Document surface.
3. `backend/src/verification/verification.service.ts` — the existing Stripe Identity flow, the only thing that currently writes `verification_level`.
4. `backend/prisma/schema.prisma` lines 50–80 (ClientProfile + verification fields) and 395–411 (VerificationMilestone).
5. `tasks/product/profiles/spec.md` — specifically the "Sealed Verification dependencies" subsection at the top of Requirements, plus `PROF-030` / `PROF-032` / `PROF-033` / `PROF-052` for the Profiles surface that consumes this feature.
6. `tasks/product/profiles/contract.md` for the slice-order Profiles assumes.
7. `tasks/in-progress/auth-flow/spec.md` and `contract.md` for the SDD discipline pattern (stable IDs `VER-NNN`, sealed contract, decisions log).

## Open Questions for the implementing AI to resolve in `spec.md`

These are deliberately left open here. Resolve in `spec.md` Open Questions and append decisions to a Decisions Log.

1. **Right-to-Work scope.** Take the share-code + document path now (matches product spec §3.1 "Right to work") or defer to Phase 2? If deferred, document the fallback so Profiles' `PROF-052` knows what to do.
2. **Stripe Identity coexistence.** Keep, retire, or run in parallel with the manual flow? The current `IDENTITY_VERIFIED` value is non-product-spec vocabulary — at minimum it needs reconciling.
3. **Promotion timing.** Is the promotion engine event-driven (fired by `PATCH /documents/:id/status` when status flips to APPROVED) or batch (a nightly job that re-evaluates everyone)? Product spec doesn't say; event-driven is simpler and matches user expectations.
4. **`verification_level` enum: extend or replace.** Today: `UNVERIFIED`, `IDENTITY_VERIFIED`. Target: `UNVERIFIED`, `BASIC`, `CERTIFIED`, `PREMIUM`. Migration plan: backfill existing `IDENTITY_VERIFIED` rows to which target value?
5. **Companies House for employer Premium tier.** Manual data entry in MVP (employer types in their company number, staff verifies against gov.uk separately) or Companies House API integration? Product spec §7 puts the API in Phase 2.
6. **Audit log granularity.** Every `VerificationMilestone` write goes through `AuditService` (audit_log table)? Or is `VerificationMilestone` the audit log for verification specifically?
7. **Re-submission cooldown.** If a document is rejected, can the user re-upload immediately, or is there a cooldown to prevent abuse?
8. **Premium tier visibility before Reviews ships.** Cap the visible ladder at Certified, or render Premium with the requirements text only (Profiles takes the latter — align)?

## Methodology note

Follow the SDD discipline already used by `auth-flow/` and `profiles/`: `brief.md` (this file) → `spec.md` (numbered requirements with stable IDs `VER-NNN`, user flows, edge cases, acceptance criteria, open questions, decisions log) → `notes.md` (codebase snapshot + research with cited sources) → `contract.md` (sealed implementation contract — API shapes, DB columns, env vars, error mapping). Move the folder from `tasks/product/` to `tasks/in-progress/` at the start of implementation.
