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

- **PROF-010 (Must).** Remove the `<pre>{JSON.stringify(account)}</pre>` debug card from `ProfilePage.tsx`. Replace with a structured `Account` section that surfaces only user-meaningful fields (email, phone with verified badge, status).
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
- **PROF-031 (Should).** A status-by-doc-type matrix on the user's own profile shows which document types are missing or pending for the user's current verification target.

### 6. Verification (visibility only)

- **PROF-032 (Must).** Reconcile vocabulary: rename `VerificationBadge` levels to `Unverified` / `Basic` / `Certified` / `Premium` (product spec §3.2). Map any legacy strings (`KYC`, `REVIEWED`, `HMRC`) at the boundary.
- **PROF-033 (Must).** On the user's own ProfilePage, render a "Trust ladder" panel showing the four levels with the requirements for each, the user's current level, and the next concrete action to advance (e.g., "Upload one trade certification" to move from Basic → Certified).
- **PROF-034 (Should).** The level requirements panel uses the matrix from product spec §3.2 verbatim. No new levels are invented in this feature.

### 7. Profile completeness

- **PROF-035 (Must).** On the user's own ProfilePage only (LinkedIn convention — visible to self, never to public viewers), show a completeness indicator (percent + linear progress) and a list of actionable cards for each missing required section.
- **PROF-036 (Must).** Required sections are role-aware:
  - Worker: avatar · display_name · bio · city + postcode_area · ≥ 1 specialisation · day-rate (min and max) · ≥ 1 portfolio item · ≥ 1 verification document.
  - Employer: avatar / logo · display_name · bio · company_name · city + postcode_area · team_size.
  - Client (Phase 2): avatar · display_name · city.
  - Note: the worker "≥ 1 specialisation" line depends on a backend gap — see Open Questions ("Worker-specialisation linking endpoint"). Until resolved, the completeness card for specialisations is render-only and links to a "coming soon" disclosure.
- **PROF-037 (Should).** Each card has a primary action button that scrolls to or opens the relevant editor.

### 8. Multi-role accounts

- **PROF-038 (Must).** A single Account can hold both `worker_profile` and `employer_profile` simultaneously (single-user-model pattern, marketplace consensus). The UI must render both editors when both exist.
- **PROF-039 (Must).** Public detail pages remain role-scoped: `/workers/:id` only renders worker context; `/employers/:id` only renders employer context. There is no role-switching toggle in MVP.
- **PROF-040 (Should).** Add a "Become a [worker / employer]" CTA on the user's own profile when only one sub-profile exists. Backend endpoint scope is out of this feature (depends on whether existing endpoints support post-hoc creation of a sub-profile — see Open Questions).

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
- **PROF-050 (Should).** All new client-server interactions use the existing `api<T>()` helper in `web/src/api.ts` (which already handles 401 refresh) — no parallel fetch utility.

## Edge Cases

- User with no `client_profile` opens `/profile`. (Possible if `auth-flow` lands a state where account exists before `client_profile` does.) Render a guided "Complete your profile" first-run state, not a 500 / blank page.
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

A new account can be brought from "just signed up" to "credible-enough-to-be-referred" in one sitting using only the in-app UI. Specifically:

- A new worker signs up, uploads an avatar, fills bio and rates, picks specialisations, adds at least one portfolio project with media, uploads a CSCS card document, and reaches `Basic` verification — all without using Swagger or the database.
- A new employer signs up, uploads a logo, fills company details, optionally uploads insurance documentation, and has a public profile that other users can find and read.
- A staff moderator can clear the document queue with no SQL: list pending documents, view each, approve or reject, see the verification ladder reflect the change.
- The public profile page for any active account is reachable without authentication, renders the trust signals from §3 of the product spec, and does not expose a "Send message" button to unauthenticated viewers.
- The user's own ProfilePage contains zero `<pre>{JSON.stringify(...)}</pre>` blocks.
- The completeness indicator shown to a 100%-complete worker reads 100% and presents no remaining cards.
- All new endpoints appear in `/api/docs`.
- `npm run build` and `npm run lint:tokens` pass.

## Open Questions

- **Slug strategy for clients.** Backend treats `client_profile.slug` as globally unique with no documented generation strategy (`backend/prisma/schema.prisma`). Should slugs be system-generated from `display_name` with numeric collision suffix (Spatie / Slugify convention) and locked once issued, or user-editable? Privacy concern with name-based slugs is real (Stack Overflow `wpso72002100`); the MVP-safe answer is auto-generated, locked, opaque enough to not leak personal data.
- **Role activation endpoints.** `PROF-040` ("Become a worker / employer" CTA) requires the backend to support adding a `worker_profile` or `employer_profile` to an existing `client_profile` post-hoc. Audit needed: do `POST /worker-profiles` / `POST /employer-profiles` exist as standalone endpoints, or is creation only possible at registration time (in which case the Auth feature owns it)?
- **Worker-specialisation linking endpoint.** Confirmed gap: the backend reads `worker_specialisations` (`backend/src/worker-profile/worker-profile.service.ts:15, 39, 75, 90`) but exposes no `POST` / `DELETE` to attach or detach a specialisation to a worker. The specialisation controller exposes admin CRUD on the *catalog*, not the *linkage*. Until this is added, `PROF-036`'s "≥ 1 specialisation" requirement for worker completeness is unenforceable from the UI. Recommend adding `POST /worker-profiles/me/specialisations/:specialisationId` and `DELETE /worker-profiles/me/specialisations/:specialisationId` as a backend prerequisite to this feature.
- **Stripe Connect onboarding entry point.** Confirmed: no such endpoint exists. `backend/src/stripe/` contains only `stripe.module.ts` (module wiring, no controller). `PROF-041` and `PROF-042` are demoted to Should and gated on a backend endpoint that creates a Connect Account Link. Recommend `POST /worker-profiles/me/stripe-connect/onboarding-link` as a backend prerequisite.
- **Verification ladder ownership.** `PROF-032` reconciles vocabulary, but the *logic* that promotes a user from Basic → Certified → Premium based on document approvals is in the Verification module. Is that logic already wired, or does this feature need to add it?
- **Labourer role surface.** Product spec §3 names Labourer as a distinct role. Current code has only WORKER / EMPLOYER. Is "Labourer" a worker sub-type carried by specialisation tag (`General Labour` from product spec Appendix A), or does it warrant a dedicated profile entity? MVP recommendation: treat as a worker with a specific specialisation tag; flag for product if richer differentiation is needed.
- **Public-vs-authenticated visibility of contact info.** Product spec implies trust requires legibility; how much of `client_profile.bio`, location, and rates should be visible to anonymous viewers vs. logged-in members? MVP recommendation: everything except `phone` and `email` is public; contact actions are auth-gated.
- **Detail-page URL strategy for workers / employers.** Spec uses numeric `id` (matches existing endpoints). Is there value in extending the slug pattern to workers / employers (`/workers/:slug`)? Defer until SEO is in scope.
- **Boundary with the Auth feature on the `Account` section.** Both features touch `web/src/pages/ProfilePage.tsx`. Ownership split proposal: Auth owns `Account / Security` section (verification banner, logout-all, deactivate); Profiles owns `Identity` section (display name, avatar, phone display) and the entire Portfolio + Documents tabs. Confirm with the Auth track owner before implementation begins.
