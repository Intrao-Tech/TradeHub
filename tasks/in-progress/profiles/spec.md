# Spec

## Summary

Define the production-ready Profiles surface for TradeHub MVP. Covers public profile pages for every role, self-service profile editing, avatar upload, portfolio CRUD with media and document linkage, document upload and verification visibility, profile completeness indicator, search detail entry, and Stripe Connect onboarding state.

The feature is the first user-visible expression of TradeHub's "trust infrastructure" positioning. It must make a tradesperson's reputation legible to another tradesperson, and an employer's track record legible to a worker, with no JSON dumps or paste-a-URL shortcuts.

Requirements use stable IDs (`PROF-NNN`) so that downstream commits, tests, and reviews can reference them.

## Problem

The product spec frames TradeHub as **trust infrastructure for UK construction trades** (`docs/TradeHub_UK_Technical_Specification_v2.docx` §1) — a B2B professional reputation network, not a homeowner-facing marketplace. The roadmap explicitly says reputation must exist before any financial layer is introduced (§2 BUILD ORDER, §7 STRATEGIC PRIORITY).

The current frontend cannot deliver that promise:

- The `/profile` page renders the user's account state as `<pre>{JSON.stringify(account)}</pre>` (`web/src/pages/ProfilePage.tsx:469`), labelled "Raw account data for debugging."
- Avatars are set by typing a URL string into a text input (`ProfilePage.tsx:517`).
- Portfolio items support create and delete only; there is no edit UI even though the backend exposes `PATCH /portfolio/:id`, `/:id/experience`, `/:id/project`, `/:id/certification`.
- There is no UI for `POST /portfolio/:id/media`, `DELETE /portfolio/media/:id`, or the portfolio↔document linkage endpoints.
- The portfolio tab requires a manual "Load portfolio" click — items do not load on mount.
- There is no `/workers/:id`, `/employers/:id`, `/clients/:slug`, or `/clients` directory page; `WorkerCard` accepts an `onSelect` prop that is never wired.
- The staff document-review surface is a numeric input + status select (`AdminPage.tsx:624`) with no queue view.
- The verification ladder shown by `VerificationBadge` (`KYC / REVIEWED / HMRC / UNVERIFIED`) does not match the names in the product spec (`Unverified / Basic / Certified / Premium`).

The Profiles work runs in parallel with Auth (`tasks/product/auth-flow/`); the spec must respect that boundary.

## Goals

- Give every active account a public, link-shareable profile.
- Replace every JSON dump and "Avatar URL" input with a real form.
- Make portfolio fully manageable in-app: experience / project / certification edits, media upload, document attachment.
- Make the verification ladder visible and actionable: the user knows what to upload to move from Unverified to Basic, and a moderator can clear the queue.
- Auto-load profile sub-resources where the user expects them; never require a manual "Load X" click for the user's own data.
- Surface profile completeness on the user's own profile only, tied to actionable cards (LinkedIn pattern).
- Add the missing detail-page routes and wire `WorkerCard` / `EmployerCard` to navigate to them.
- Expose Stripe Connect onboarding state for workers so the payout requirement is not invisible.
- Reconcile verification-level vocabulary between code and product spec.

## Non-goals

- Auth lifecycle (signup, login, Google, email verification, password reset, logout, session management) — owned by `auth-flow`.
- Phone OTP verification — explicitly out-of-scope of `auth-flow` and likewise out-of-scope here.
- Real KYC / HMRC / Companies House integration — referenced as Phase 2 in the product spec.
- The Stripe Connect *transaction* layer (escrow, transfers, refunds) — Phase 2.
- Reviews (read or write) — adjacent feature, separate spec.
- Subscriptions / Premium tier — separate spec.
- Messaging / inbox — separate spec.
- Native mobile apps.
- A Client write surface (Client = read-only consumer in MVP per product spec §3 Phase 2 note).

## User Flow

### Tradesperson / Labourer (worker)

1. After signup (Auth), user lands on their own profile.
2. A completeness indicator shows them the next missing required section.
3. User uploads an avatar (drag-drop / click, square crop, preview, save).
4. User fills display name, bio, city, postcode area, day-rate range, availability.
5. User picks specialisations from a list (multi-select).
6. User adds portfolio items: experience, project, certification. Each item supports edit and delete after creation.
7. User uploads media to a portfolio project (drag-drop or browse, preview, captions).
8. User uploads verification documents (CSCS card, certifications, ID). Status is visible: `Pending → In Review → Approved / Rejected`.
9. User links approved documents to the relevant portfolio certification item (e.g., CSCS card document → CSCS certification).
10. User sees Stripe Connect onboarding state. If not complete, a CTA links out to onboarding (handled by Stripe; no in-app onboarding form in MVP).
11. User opens their public profile via "View public profile" link and copies the URL.
12. From the public worker directory, another user clicks a card → arrives on the worker's public detail page.

### Company (employer)

1. After signup, user lands on their own profile.
2. Completeness indicator (with employer-specific required sections).
3. User uploads avatar / company logo.
4. User fills display name (representative), bio, company name, company number, team size, city, postcode area.
5. User uploads optional verification documents (insurance, company letterhead).
6. User opens public profile and copies URL.
7. Other users find the employer through `/employers` and click into the detail page.

### Staff / Moderator

1. Staff opens AdminPage → Documents queue.
2. Queue lists documents by `created_at` desc, filtered by status (`Pending`, `In Review`).
3. Staff clicks a document → preview + metadata + decision controls (`Approve` / `Reject` / `Request resubmission`).
4. Decision is recorded; user is notified out-of-band (notifications spec — out of scope here).
5. Approving the right combination of documents promotes the user's `verification_level` (logic owned by Verification module, surfaced here).

### Client (public)

1. Client lands on `/workers` or `/employers` from public navigation.
2. Filters and clicks into a card → worker / employer public profile page.
3. Sees the same trust signals as a logged-in user (rating, verification badge, portfolio, certifications). No edit affordances.

## Requirements

Conventions: each requirement has a stable ID. **Must** = MVP-blocking. **Should** = strongly preferred. Referenced as `@PROF-NNN` from commits, tests, and PR descriptions.

### Sealed Verification dependencies (consumed, not duplicated)

`tasks/product/verification/` (owner: teammate) owns the **manual staff document approval workflow**, the **`verification_level` promotion logic**, and the **vocabulary reconciliation**. Profiles consumes — it does not build any of that. The contract Profiles depends on:

- `Document.status` lifecycle: `PENDING → IN_REVIEW → APPROVED | REJECTED`. Profiles renders these as badges; never writes them.
- `Document.rejection_reason` field (Verification adds it; Profiles renders it on the user-side document list and in the trust-ladder unhappy-path card).
- `client_profile.verification_level` enum (final naming chosen by Verification; Profiles renders whatever ships). Promotion timing — when an approved document advances the level, when a rejection invalidates a milestone — owned by Verification.
- Staff queue UI in `AdminPage.tsx` Documents tab — owned by Verification. Profiles' Documents tab is **user-side only**.
- Product-spec Verification ladder matrix (`docs/...v2.docx` §3.2: Unverified / Basic / Certified / Premium) is the single source of truth shared by both features.
- Right-to-Work backend (new `doc_type` values, share-code validation, gov.uk handoff) — Verification's call. Profiles ships the *frontend submission form* but stages the request behind whatever endpoint Verification exposes.

Until Verification's contract is sealed, Profiles uses the existing `Document` shape (status enum + nothing else) and renders rejection text from a placeholder field if `rejection_reason` is not yet present.

### Sealed Auth dependencies (consumed, not duplicated)

`tasks/in-progress/auth-flow/contract.md` (sealed 2026-04-26) is the authoritative source for everything auth-shaped. This spec consumes — it does not redefine. The contractual surface this feature relies on:

- `Account.status ∈ { PENDING_EMAIL_VERIFICATION, ACTIVE, DEACTIVATED }`; new accounts default to `PENDING_EMAIL_VERIFICATION`. New `Account.email_verified_at` column.
- JWT payload includes `vs` (verification_state); `JwtStrategy` exposes it as `req.user.verification_state`.
- `account` summary returned by `/auth/login`, `/auth/verify-email/confirm`, `/auth/staff/login`: `{ id, email, is_worker, is_employer, is_staff, verification_state }`.
- `AccountStateGuard` is **NOT** applied to `AccountController.getMe`, `ClientProfileController.updateMe`, `WorkerProfileController.updateMe`, `EmployerProfileController.updateMe`, `PortfolioController.*`, `DocumentController.upload`. → A `PENDING_EMAIL_VERIFICATION` user can complete their profile before verifying email; profile editors must not gate themselves on `verification_state === 'ACTIVE'`.
- `/auth/register` creates `account + client_profile + worker_profile|employer_profile` atomically based on `role`. → `client_profile` and the role-specific sub-profile are guaranteed to exist for any account created post-Auth-shipment. Single-role only at registration time.
- Post-login routing helper: `web/src/lib/auth-routing.ts` (`postAuthRedirect`, `isSafeNext`). Active worker / employer lands on `/profile`. → This feature owns what they see there.
- New page: `web/src/pages/SettingsSecurityPage.tsx` at `/settings/security` owns logout-all and change-password. → ProfilePage does **not** host security actions; link out instead.
- Updated `web/src/api.ts` exposes `ApiError` class + `parseApiError(err)`. → All new fetches in this feature must use them.
- New shared component `web/src/components/AuthBanner.tsx` covers `EMAIL_NOT_VERIFIED`, `ACCOUNT_DEACTIVATED`, `password_changed`, `expired`, `verified`, `logged_out` reasons. → Reuse for the unverified-on-profile state.
- App routing has split into `MarketplaceRouter` and `StaffRouter` based on `IS_STAFF_HOST` (`web/src/lib/host.ts`). → All new public profile routes (`PROF-001`/`PROF-002`/`PROF-003`/`PROF-004`) register under `MarketplaceRouter`.

### 1. Public profile pages

- **PROF-001 (Must).** Add route `/workers/:id` rendering a public worker detail page. Data source: `GET /worker-profiles/:id` plus `GET /portfolio/worker/:workerId`.
- **PROF-002 (Must).** Add route `/employers/:id` rendering a public employer detail page. Data source: `GET /employer-profiles/:id`.
- **PROF-003 (Must).** Add route `/clients/:slug` rendering the underlying public client profile. Data source: `GET /client-profiles/:slug`.
- **PROF-004 (Should).** Add `/clients` directory page (search) using `GET /client-profiles`. Lower priority than role-specific directories that already exist.
- **PROF-005 (Must).** Wire `WorkerCard.onSelect` and `EmployerCard.onSelect` in `WorkerSearchPage` and `EmployerSearchPage` to navigate to the new detail routes.
- **PROF-006 (Must).** Public profile pages must render without authentication. They must redact contact-action affordances (e.g., "Send message") for unauthenticated viewers and replace them with an auth gate CTA.
- **PROF-007 (Must).** Public profile page header must show: avatar, display name, role chip(s), location (city + postcode area), `VerificationBadge`, `StarRating` (with `rating_count`), and an availability indicator (workers only).
- **PROF-008 (Must).** Below the header, render tabbed sections: `About`, `Portfolio` (workers only), `Certifications` (workers only — derived from portfolio items of type `CERTIFICATION`), `Reviews` (placeholder section that links to the Reviews feature when shipped).
- **PROF-009 (Should).** A "View public profile" link must be present on the user's own ProfilePage and link to the corresponding public route.

### 2. Profile editing (own profile)

- **PROF-010 (Must).** Remove the `<pre>{JSON.stringify(account)}</pre>` debug card from `ProfilePage.tsx`. Replace with a structured `Account` section surfacing: `email`, `email_verified_at` (✓ verified / pending), `phone` with `phone_verified` indicator, `verification_state` (per Auth contract), and a "Manage security" link to `/settings/security`. When `verification_state === 'PENDING_EMAIL_VERIFICATION'`, render `<AuthBanner kind="EMAIL_NOT_VERIFIED">` at the top of the page (do not invent a parallel banner). The Account section never hosts logout-all / change-password / deactivate — those live on `/settings/security` (Auth contract §10).
- **PROF-011 (Must).** Client-profile editor must support: `display_name`, `bio`, `city`, `postcode_area`. Save calls `PATCH /client-profiles/me`.
- **PROF-012 (Must).** Worker-profile editor (visible only when `worker_profile` exists) must support: `years_experience`, `day_rate_min`, `day_rate_max`, `available_from`, `is_available`. Save calls `PATCH /worker-profiles/me`.
- **PROF-013 (Must).** Employer-profile editor (visible only when `employer_profile` exists) must support: `company_name`, `company_number`, `team_size`. Save calls `PATCH /employer-profiles/me`.
- **PROF-014 (Should).** Each editor must validate inline (length caps from Prisma schema, decimal precision, decimal range — `day_rate_max ≥ day_rate_min`).
- **PROF-015 (Must).** Region picker for `city` / `postcode_area` is constrained to a London-borough preset list for MVP, consistent with product spec §1 ("MVP Region: Greater London") and §3.1.

### 3. Avatar upload

- **PROF-016 (Must).** Replace the `Avatar URL` text input with a file upload component supporting: drag-and-drop and click-to-browse, square (1:1) crop with pan/zoom, client-side preview, format whitelist (JPEG / PNG / WebP), client-side size cap of 5 MiB, replace and remove actions.
- **PROF-017 (Must).** Add backend endpoint `POST /client-profiles/me/avatar` (multipart, field `file`). Reuses the existing Multer pipeline that documents already use (`backend/src/document/document.controller.ts`); writes to `./uploads/{uuid}.{ext}` and updates `client_profile.avatar_url` server-side. Removes the prior file if any.
- **PROF-018 (Must).** Server-side validation: MIME type whitelist (image/jpeg, image/png, image/webp), 5 MiB cap, dimension floor (≥ 256×256). Reject with structured error the UI maps to a friendly message.
- **PROF-019 (Should).** Avatar component is keyboard-accessible (drop zone reachable by Tab, Enter / Space opens picker), with `aria-live` upload-state announcements.

### 4. Portfolio (workers only)

- **PROF-020 (Must).** Portfolio tab loads on mount when `worker_profile` exists; remove the manual "Load portfolio" button.
- **PROF-021 (Must).** Each portfolio item supports edit. Edit dialog branches by `item_type` and calls the matching backend endpoint: `PATCH /portfolio/:id` (common fields), `PATCH /portfolio/:id/experience`, `PATCH /portfolio/:id/project`, `PATCH /portfolio/:id/certification`.
- **PROF-022 (Must).** Portfolio item edit supports re-ordering via `sort_order` (drag handle or up/down controls).
- **PROF-023 (Must).** Add media upload UI on each portfolio item: drag-drop / browse, JPEG / PNG / WebP, 10 MiB per file cap, multiple files allowed (≤ 20 per item per product spec §3.1), per-file preview, captions, delete.
- **PROF-024 (Must).** Add backend endpoint `POST /portfolio/:id/media/upload` (multipart) so the client posts a file rather than a pre-hosted URL. The existing `POST /portfolio/:id/media` (URL-only) remains for programmatic use. Server side: same Multer pipeline, writes file, creates `PortfolioMedia` row, returns row.
- **PROF-025 (Must).** Wire `DELETE /portfolio/media/:mediaId` from the media grid.
- **PROF-026 (Must).** Add UI to link an approved Document to a portfolio item via `POST /portfolio/:id/documents/:documentId`. Document picker lists the user's `APPROVED` documents only. Show linked documents in the item view; support unlink via `DELETE /portfolio/:id/documents/:documentId`.
- **PROF-027 (Should).** Verified portfolio items (`portfolio_item.verified = true`) must show a "Verified by TradeHub" indicator in the public profile and the editor.

### 5. Documents

- **PROF-028 (Must).** Documents tab loads on mount when `client_profile` exists; remove the manual "Load documents" button.
- **PROF-029 (Must).** Document upload UI supports drag-drop / browse, type-aware file format guidance (e.g., PDF or image for certifications, image for selfie), 10 MiB cap, real progress indicator, retry on network error, clear error messages mapping HTTP 413 / 415 to human language.
- **PROF-030 (Must).** Document list shows: thumbnail (image) or filename + extension (PDF), `doc_type`, `status` badge (`Pending` / `In Review` / `Approved` / `Rejected`) with the existing `bg-success-subtle` / `bg-warning-subtle` / `bg-info-subtle` / `bg-danger-subtle` token mapping, upload date, delete (only when `status === 'PENDING'`).
- **PROF-031 (Should).** A status-by-doc-type matrix on the user's own profile shows which document types are missing or pending for the user's current verification target. Read-only; the *staff* queue and the *promotion logic* live in Verification.

### 6. Verification (visibility only)

- **PROF-032 (Must).** Render whatever level vocabulary Verification ships. Today's `VerificationBadge` (`unverified | kyc | reviewed | hmrc`) and the backend's current values (`UNVERIFIED`, `IDENTITY_VERIFIED`) both diverge from the product-spec ladder (`Unverified / Basic / Certified / Premium`). Vocabulary reconciliation is a Verification deliverable; this requirement is satisfied when Profiles consumes the post-reconciliation values without an in-app translation table. Until then, Profiles maps legacy strings at the read boundary in `verificationFromLevel()` (`web/src/components/VerificationBadge.tsx:31`).
- **PROF-033 (Must).** On the user's own ProfilePage, render a "Trust ladder" panel showing the four levels with the requirements for each, the user's current level, and the next concrete action to advance (e.g., "Upload one trade certification" to move from Basic → Certified). Each requirement card carries: the requirement statement, current state (`Done` / `Pending review` / `Not started`), a single primary CTA ("Upload CSCS card", "Verify right to work"), and a time-to-complete microcopy ("Usually takes 90 seconds" — Stripe / Onfido pattern). Document rejection cards must show the staff-provided reason and a "Re-upload" CTA.
- **PROF-034 (Must).** The level requirements panel uses the matrix from product spec §3.2 **verbatim**:
  - **Unverified (Grey)** — Email and phone confirmed only.
  - **Basic (Blue)** — ID uploaded and approved by admin.
  - **Certified (Gold)** — ID + at least one trade certification verified.
  - **Premium (Purple)** — Certified + insurance + Companies House (where applicable, employers only) + 5+ verified reviews.
  No new levels are invented in this feature. Reviews count is read from `worker_profile.rating_count` / `employer_profile.rating_count`; until the Reviews feature ships, the Premium row renders the requirement text but cannot resolve the count to "Done" (cap visible-state at Certified).

### 7. Profile completeness

- **PROF-035 (Must).** On the user's own ProfilePage only (LinkedIn convention — visible to self, never to public viewers), show a completeness indicator (percent + linear progress) and a list of actionable cards for each missing required section.
- **PROF-036 (Must).** Required sections are role-aware:
  - Worker: avatar · display_name · bio · city + postcode_area · ≥ 1 specialisation · day-rate (min and max) · ≥ 1 portfolio item · ≥ 1 verification document · **right-to-work submission (PROF-052)**.
  - Employer: avatar / logo · display_name · bio · company_name · city + postcode_area · team_size.
  - Client (Phase 2): avatar · display_name · city.
  - Note: the worker "≥ 1 specialisation" line depends on a backend gap — see Open Questions ("Worker-specialisation linking endpoint") and `BE-PROF-3`. Until resolved, the completeness card for specialisations is render-only and links to a "coming soon" disclosure.
- **PROF-037 (Should).** Each card has a primary action button that scrolls to or opens the relevant editor.

### 8. Multi-role accounts

- **PROF-038 (Must).** Schema permits a single `client_profile_id` to be the PK of both a `worker_profile` and an `employer_profile` row. The UI must render both editors when both exist (defensive: handles staff-seeded multi-role accounts and any future post-hoc role-extension flow). Note: Auth's `/auth/register` (contract §2) creates exactly one sub-profile per the chosen `role` — multi-role is not produced by the registration path today.
- **PROF-039 (Must).** Public detail pages remain role-scoped: `/workers/:id` only renders worker context; `/employers/:id` only renders employer context. There is no role-switching toggle in MVP.
- **PROF-040 (Defer).** "Become a [worker / employer]" CTA is removed from MVP scope. Role is locked at registration per Auth contract §2 and there is no backend endpoint to add a second sub-profile post-hoc. Re-introduce when the role-extension endpoint exists (see Open Questions).

### 9. Stripe Connect onboarding (workers, status only)

- **PROF-041 (Should).** When `worker_profile` exists and `client_profile.stripe_onboarding_complete` is `false`, show a "Set up payouts" panel on the user's own profile with a CTA that opens the Stripe-hosted onboarding flow in a new tab.
- **PROF-042 (Should).** When `stripe_onboarding_complete` is `true`, show "Payouts ready" with the masked `stripe_connect_account_id`.
- **PROF-043 (Must).** Backend endpoint to start the Connect onboarding session does not exist today (`backend/src/stripe/` contains only `stripe.module.ts`). PROF-041 / PROF-042 are blocked on that endpoint and demoted to Should. Until the endpoint exists, render a read-only state showing whether onboarding is complete, with no CTA.

### 10. Search detail entry

- **PROF-044 (Must).** Remove all `<pre>{JSON.stringify(...)}</pre>` blocks from `WorkerSearchPage` and `EmployerSearchPage`.
- **PROF-045 (Must).** Card click navigates to the corresponding detail page (`PROF-005`).
- **PROF-046 (Should).** Each card surfaces a verification badge consistent with `PROF-032` vocabulary.

### 11. Cross-cutting

- **PROF-047 (Must).** All new and modified files must pass `web/scripts/lint-tokens.mjs` — no raw hex colours or default Tailwind palette in `components/**` and `pages/**`.
- **PROF-048 (Must).** All new pages render correctly at the 375 px mobile-first baseline; tap targets ≥ 48×48 px; tabs collapse or scroll horizontally as needed (reuse existing `Tabs` shadcn primitive).
- **PROF-049 (Must).** All new endpoints documented in OpenAPI / Swagger (`/api/docs`) so the Auth track and any future track can consume them without reading source.
- **PROF-050 (Should).** All new client-server interactions use the `api<T>()` helper in `web/src/api.ts` (handles 401 refresh) and surface errors through `parseApiError()` / the `ApiError` class added by Auth (contract §10). No parallel fetch utility.
- **PROF-051 (Must).** Introduce `web/src/hooks/useAccountMe.ts` — single hook that calls `GET /account/me`, caches the response in module state, and exposes `{ account, clientProfile, isWorker, isEmployer, isStaff, verificationState, refetch }`. All profile pages and components consume this hook rather than re-fetching `/account/me` themselves. Auth's contract does not introduce a global `useAuth`, so this is the load-bearing client-side cache for account-derived state inside the Profiles surface.

### 12. Right to Work (UK legal requirement — workers only)

Per `docs/TradeHub_UK_Technical_Specification_v2.docx` §3.1, "Right to work" is required and admin-verified. UK employment law (gov.uk) defines two paths depending on nationality: share code (non-British/Irish citizens) or original document check (British / Irish). TradeHub mirrors that.

- **PROF-052 (Must).** On a worker profile, expose a "Right to Work" section with two mutually-exclusive submission paths the user picks from:
  - **Share code path** (non-British/Irish citizens): two text inputs — 9-character share code (validated client-side: must start with `W`, format `^W[A-Z0-9]{8}$`) + date of birth (DD-MM-YYYY). Submission creates a `Document` of new `doc_type = RIGHT_TO_WORK_SHARE_CODE` with `metadata = { share_code, dob }`.
  - **Document path** (British / Irish citizens): file upload of passport / passport card / passport-plus-NI-letter combo. Submission creates a `Document` of new `doc_type = RIGHT_TO_WORK_DOCUMENT`.
- **PROF-053 (Dependency on Verification).** Backend extension to support the share-code path: `RIGHT_TO_WORK_SHARE_CODE` / `RIGHT_TO_WORK_DOCUMENT` enum values, share-code regex validation, share-code metadata storage. **Verification owns this** — Profiles posts to whatever endpoint Verification exposes. If Verification scopes RTW out, `PROF-052` falls back to a generic `OTHER` document upload with a free-text caption.
- **PROF-054 (Dependency on Verification).** Staff-side handling of share-code submissions (gov.uk verification flow link, decision capture) is part of Verification's staff queue, not the Profiles surface.

### 13. Languages spoken (workers only)

Search filter listed in product spec §6.3 — relevant to UK construction's multilingual workforce.

- **PROF-055 (Should).** Add `languages` (`text[]`, ISO 639-1 codes) to `worker_profile`. Editor: multi-select from a curated list (English, Polish, Romanian, Lithuanian, Russian, Ukrainian, Bulgarian, Turkish, Portuguese, Spanish, Punjabi, Urdu, Arabic — ordered by frequency in UK construction). Public profile renders as language chips. Worker search filter to follow in a sibling spec.

### 14. Profile-spec-derived backend prerequisites (consolidated)

Items the backend needs before all Must requirements above are implementable. Compiled here so the Profiles owner can hand them to the backend track as a single ticket bundle, not scattered through prose.

- **BE-PROF-1.** `POST /client-profiles/me/avatar` (multipart) — see PROF-017 / PROF-018.
- **BE-PROF-2.** `POST /portfolio/:id/media/upload` (multipart) — see PROF-024.
- **BE-PROF-3.** `POST /worker-profiles/me/specialisations/:specialisationId` and `DELETE /worker-profiles/me/specialisations/:specialisationId` — unblocks PROF-036's "≥ 1 specialisation" requirement.
- ~~**BE-PROF-4.** Extend `Document.doc_type` enum…~~ **Moved to Verification feature** (`tasks/product/verification/`). Profiles consumes whatever shape Verification ships.
- **BE-PROF-5.** Specialisation seed: ensure `specialisation` rows cover all 30 categories from product spec Appendix A.
- **BE-PROF-6.** `worker_profile.languages text[]` migration — see PROF-055.
- **BE-PROF-7.** `POST /worker-profiles/me/stripe-connect/onboarding-link` returning `{ url, expires_at }` for the Stripe-hosted Account Link — unblocks PROF-041 / PROF-042. Today `backend/src/stripe/` contains only `stripe.module.ts`.
- **BE-PROF-8.** Multer config: hard-cap `fileSize` per route (5 MiB for avatar, 10 MiB for documents and portfolio media), MIME whitelist (`image/jpeg|image/png|image/webp` for avatar / portfolio media; `application/pdf|image/*` for documents). Today there are no explicit limits in `backend/src/document/document.controller.ts`.

None of these block the *first slice* of frontend work (PROF-010 + PROF-011 — kill JSON dump, real client editor) — the backend already supports that. They block specific slices and should be addressed in parallel with the frontend track.

## Edge Cases

- User with no `client_profile` opens `/profile`. Post-Auth-shipment this can only happen for legacy seed users or staff-only accounts. Render a guided "Complete your profile" first-run state, not a 500 / blank page; for staff-only accounts, redirect to `/internal/admin`.
- User opens `/profile` while `verification_state === 'PENDING_EMAIL_VERIFICATION'`. Render the `<AuthBanner kind="EMAIL_NOT_VERIFIED">` at the top, but allow all profile / portfolio / document edits — Auth's `AccountStateGuard` deliberately exempts these endpoints (contract §3).
- User opens `/profile` while `verification_state === 'DEACTIVATED'`. This state is unreachable through normal navigation (Auth refuses to issue tokens for deactivated accounts on login per contract §2 `/auth/login`); if it happens via stale session, the next API call returns `403 ACCOUNT_DEACTIVATED` and `api.ts` redirects to `/login?reason=deactivated`. No profile-side handling needed.
- User with both worker and employer profiles edits the same `client_profile.bio` from two contexts in two tabs. Last write wins; no merge UI in MVP.
- Avatar upload succeeds but the subsequent profile reload fails. Optimistic UI update is reverted on error and a retry is offered.
- Portfolio item edit: user reduces `sort_order` to a value that collides with another item — re-sequence server-side rather than reject.
- Document upload exceeds the 10 MiB server limit but passed the 10 MiB client check (e.g., user multi-uploads). Show per-file failure, keep successful uploads.
- Public profile route hit with a numeric ID for a profile that has been `DEACTIVATED`. Render a generic 404, not a deactivated-state page (privacy).
- Public profile of a worker with zero reviews: render rating section as "No reviews yet" — never show `0.0 ★`.
- Slug collision on a newly minted account (delegated to backend; covered in Open Questions). UI must not crash on duplicate-slug error responses.
- Stripe `stripe_onboarding_complete` flips while the page is open (webhook path). Refreshing the section on tab focus is acceptable; live websocket update is not required.
- A document is approved, linked to a portfolio item, then later rejected (re-review). The portfolio item must not display a "Verified" indicator solely because of that document; verification of portfolio items is a staff action, not a derived state.
- User on a slow mobile connection uploads multiple media. Show queued state and per-file progress; do not block UI.

## Acceptance Criteria

A new account can be brought from "just signed up" to "credible-enough-to-be-referred" in one sitting using only the in-app UI. Each scenario below is a verifiable end-to-end test scope.

**E2E-1 — Worker first-run, target Basic verification.** Brand-new worker registers (Auth flow), verifies email, lands on `/profile`. Without using Swagger or DB: uploads avatar (drag-drop, square crop, save); fills display name, bio, city (London-borough picker), postcode area; sets day-rate min/max and availability; picks ≥ 1 specialisation; adds 1 Project portfolio item with 2 media files and a caption; uploads ID document (`ID_PHOTO`); submits Right-to-Work via share code (`PROF-052`). Staff approves the ID. User refreshes — `verification_state` chip flips to `Basic`, completeness reads 100%, "View public profile" link works.

**E2E-2 — Worker advances to Certified.** Continuing from E2E-1: user adds a Certification portfolio item (`CertificationDetail.cert_type = CSCS`, `cert_number = …`), uploads matching `CSCS_CARD` document, links the document to the certification item via `POST /portfolio/:id/documents/:documentId`. Staff approves the document. Refresh — ladder advances to `Certified`, certification card on public profile shows "Verified by TradeHub".

**E2E-3 — Employer first-run.** Brand-new employer registers and verifies email; uploads logo, fills company name + number + team size, city + postcode area; optionally uploads `INSURANCE` and `COMPANY_LETTERHEAD` documents. Public `/employers/:id` is reachable, shows logo + name + verification badge + rating placeholder; no "Send message" affordance for anonymous viewers.

**E2E-4 — Public discovery.** Anonymous visitor opens `/workers`, applies a specialisation filter, clicks a card → arrives on `/workers/:id` rendering header (avatar, name, role chip, location, `VerificationBadge`, `StarRating`), tabs (About, Portfolio, Certifications, Reviews placeholder). Reload at 375 px width — layout works, tap targets ≥ 48 px, no horizontal scroll. Same for `/employers` → `/employers/:id`.

**E2E-5 — Staff document queue.** *Out of Profiles scope; owned by Verification.* Profiles' contribution: when Verification rejects a document, the user-side `DocumentList` and `TrustLadderPanel` surface the rejection reason and a "Re-upload" CTA (`PROF-030` / `PROF-033`). E2E test of the staff queue itself sits in the Verification spec.

**E2E-6 — Unverified user can edit.** A `PENDING_EMAIL_VERIFICATION` user opens `/profile` → sees `<AuthBanner kind="EMAIL_NOT_VERIFIED">` with Resend CTA, but every editor (client / worker / employer / portfolio / documents) is fully usable (Auth contract §3 exemption).

**E2E-7 — Multi-role render.** A staff-seeded account that has both `worker_profile` and `employer_profile` rows opens `/profile` → both editors render (`PROF-038`).

**E2E-8 — Guardrails.**

- Zero `<pre>{JSON.stringify(...)}</pre>` blocks across `ProfilePage`, `WorkerSearchPage`, `EmployerSearchPage`, `AdminPage` (Documents tab).
- All new endpoints appear in `/api/docs`.
- `cd backend && npm run lint` clean.
- `cd web && npm run lint:tokens` clean (no raw hex / default Tailwind classes in `components/**` or `pages/**`).
- `cd web && ./node_modules/.bin/vite build` clean (no TS errors).
- Manual smoke: every user-facing scenario above run in light + dark mode at 375 px and at desktop.

## Open Questions

- **Slug strategy for clients.** Backend treats `client_profile.slug` as globally unique with no documented generation strategy (`backend/prisma/schema.prisma`). Should slugs be system-generated from `display_name` with numeric collision suffix (Spatie / Slugify convention) and locked once issued, or user-editable? Privacy concern with name-based slugs is real (Stack Overflow `wpso72002100`); the MVP-safe answer is auto-generated, locked, opaque enough to not leak personal data.
- **Role activation endpoints.** Confirmed (2026-05-03) by Auth contract §2: `/auth/register` creates exactly one sub-profile (`worker_profile` XOR `employer_profile`) based on the chosen `role`. There is no current endpoint to add a second sub-profile to an existing account. `PROF-040` is therefore deferred. To re-enable, the backend would need `POST /worker-profiles/me` and `POST /employer-profiles/me` (or equivalent) that take a JWT and create the missing row. This is a backend feature request, not part of Profiles MVP.
- **Worker-specialisation linking endpoint.** Confirmed gap: the backend reads `worker_specialisations` (`backend/src/worker-profile/worker-profile.service.ts:15, 39, 75, 90`) but exposes no `POST` / `DELETE` to attach or detach a specialisation to a worker. The specialisation controller exposes admin CRUD on the *catalog*, not the *linkage*. Until this is added, `PROF-036`'s "≥ 1 specialisation" requirement for worker completeness is unenforceable from the UI. Recommend adding `POST /worker-profiles/me/specialisations/:specialisationId` and `DELETE /worker-profiles/me/specialisations/:specialisationId` as a backend prerequisite to this feature.
- **Stripe Connect onboarding entry point.** Confirmed: no such endpoint exists. `backend/src/stripe/` contains only `stripe.module.ts` (module wiring, no controller). `PROF-041` and `PROF-042` are demoted to Should and gated on a backend endpoint that creates a Connect Account Link. Recommend `POST /worker-profiles/me/stripe-connect/onboarding-link` as a backend prerequisite.
- **Verification ladder ownership.** `PROF-032` reconciles vocabulary, but the *logic* that promotes a user from Basic → Certified → Premium based on document approvals is in the Verification module. Is that logic already wired, or does this feature need to add it?
- **Labourer role surface.** Product spec §3 names Labourer as a distinct role. Current code has only WORKER / EMPLOYER. Is "Labourer" a worker sub-type carried by specialisation tag (`General Labour` from product spec Appendix A), or does it warrant a dedicated profile entity? MVP recommendation: treat as a worker with a specific specialisation tag; flag for product if richer differentiation is needed.
- **Public-vs-authenticated visibility of contact info.** Product spec implies trust requires legibility; how much of `client_profile.bio`, location, and rates should be visible to anonymous viewers vs. logged-in members? MVP recommendation: everything except `phone` and `email` is public; contact actions are auth-gated.
- **Detail-page URL strategy for workers / employers.** Spec uses numeric `id` (matches existing endpoints). Is there value in extending the slug pattern to workers / employers (`/workers/:slug`)? Defer until SEO is in scope.

## Decisions Log

- **2026-05-03 — Verification carved out as a sibling feature.** Teammate is taking ownership of the *manual staff document approval flow* (queue UI, approve/reject, ladder promotion logic, vocabulary reconciliation). Profiles' scope reduced accordingly: `BE-PROF-4` removed (Document model extensions become Verification's); `PROF-053` / `PROF-054` demoted to dependencies; `E2E-5` removed from Profiles acceptance and recast as a Verification deliverable; `PROF-032` rewritten as consumption-only; "Sealed Verification dependencies" subsection added at top of Requirements. Right-to-Work backend deferred to Verification's discretion (teammate undecided); Profiles' RTW frontend (`PROF-052`) stays but falls back to a generic upload if Verification scopes RTW backend out.
- **2026-05-03 — Surf-validated product alignment (final shape).** Re-ran surf research against the actual product analogue stack (LinkedIn-for-trades + UK B2B trade platforms — SubbieUK, Subcontractee — + UK Right-to-Work + KYC ladder UX from Stripe / Onfido / Persona + CSCS Smart Check / Gas Safe Register / NICEIC). Findings folded in: profile is a credentials portfolio with marketplace add-ons (rates, availability) layered on top, NOT a transactional storefront; verification ladder UX uses Stripe-style microcopy ("Usually takes 90 seconds"), document rejection cards must show staff reason + re-upload CTA, mobile-first is non-negotiable for trades audience; UK Right-to-Work is the missing legal field — added `PROF-052` / `PROF-053` / `PROF-054` covering both share-code and document paths; languages-spoken added as `PROF-055` (search-filter parity with product spec §6.3); backend prerequisites bundled into `BE-PROF-1`…`BE-PROF-8` for hand-off.
- **2026-05-03 — Sealed Auth contract consumed.** `tasks/in-progress/auth-flow/contract.md` (sealed 2026-04-26 by the Auth track) has been read end-to-end. Profiles spec aligned: account-state vocabulary uses `verification_state` (`PENDING_EMAIL_VERIFICATION` / `ACTIVE` / `DEACTIVATED`); ProfilePage hosts no security actions (Auth shipped `/settings/security`); `<AuthBanner>` reused for unverified state; `MarketplaceRouter` is the registration target for new public routes; `ApiError` / `parseApiError()` are the canonical error helpers; `useAccountMe()` is the only client-side `/account/me` consumer (added as `PROF-051`).
- **2026-05-03 — `PROF-040` deferred.** Auth contract locks role at `/auth/register`; no backend endpoint to add a second sub-profile post-hoc. Re-introduces only when that endpoint exists.
- **2026-05-03 — Open Question "Boundary with Auth on Account section" resolved.** Auth shipped `SettingsSecurityPage.tsx`; ProfilePage owns identity / portfolio / documents only.
- **2026-05-03 — Open Question "Role activation endpoints" resolved as a backend prerequisite.** Action: log a backend request rather than build a UI for missing endpoints.
- **2026-05-02 — Step-back fact-check.** Worker-specialisation linking endpoint and Stripe Connect onboarding endpoint confirmed missing in the backend. `PROF-036` notes the dependency; `PROF-041` / `PROF-042` demoted to Should and gated on those endpoints.
- **2026-05-02 — Vocabulary realignment.** TradeHub framed as B2B professional reputation network (LinkedIn analogue) per `docs/TradeHub_UK_Technical_Specification_v2.docx` §1, not a B2C marketplace. Trades-marketplace UX research downgraded to context.
- ~~**Boundary with the Auth feature on the `Account` section.**~~ **RESOLVED (2026-05-03):** Auth shipped `SettingsSecurityPage.tsx` at `/settings/security` (contract §10) hosting logout-all and change-password. Verification banner is the reusable `AuthBanner` component. ProfilePage owns identity + portfolio + documents only and links out for security actions. See `PROF-010`.
- ~~**Verification ladder ownership.**~~ **RESOLVED (2026-05-03):** Carved out as its own feature `tasks/product/verification/` (owner: teammate). Profiles owns user-facing rendering only; Verification owns staff queue + promotion logic + vocabulary reconciliation + RTW backend. See "Sealed Verification dependencies" at the top of Requirements.
