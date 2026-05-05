# Spec

## Summary

Define the production-ready Jobs & Applications surface for TradeHub MVP. Covers the public job board, a real job-detail page, a "Post a job" form with searchable chip-multiselect for specialisations and tags, an employer dashboard for the employer's own posts (edit / close / reopen / delete + per-post applicants list with lifecycle actions), a worker dashboard for the worker's own applications (status tabs + withdraw + re-apply rules), and the role-aware primary CTAs that wire it all together.

The backend already ships the full surface (`backend/src/job-post/`, `backend/src/job-application/`, `backend/src/specialisation/`, `backend/src/tag/`, `prisma/schema.prisma:671–748`). This spec is mostly a frontend feature: the work is to replace JSON dumps and comma-separated-ID inputs with real flows, and to bind every action to the existing endpoints through `parseApiError()` so failures surface as human language.

Requirements use stable IDs (`JOBS-NNN`) so commits, tests, and reviews can reference them.

## Problem

The product spec frames TradeHub as **trust infrastructure for UK construction trades** (`docs/TradeHub_UK_Technical_Specification_v2.docx` §1). Profiles makes a tradesperson's reputation legible; Auth gates trust-sensitive actions on `verification_state === 'ACTIVE'`; Verification turns documents into trust signals. **Jobs is where all of that converts into actual marketplace activity** — and right now the conversion is broken at the surface:

- The "Post a job" sheet asks for **comma-separated specialisation IDs** and **comma-separated tag IDs** in raw text inputs (`web/src/pages/JobBoardPage.tsx:310, :319`), even though `GET /specialisations` and `GET /tags` are public and return the catalog (`backend/src/specialisation/specialisation.controller.ts:31`, `backend/src/tag/tag.controller.ts:24`).
- The Apply button is shown to every signed-in account (`web/src/pages/JobBoardPage.tsx:495`); the backend rejects non-workers with `403 Forbidden` (`backend/src/job-application/job-application.controller.ts:35` — `RolesGuard('WORKER')`). The user sees a generic error and has no idea why.
- The job-detail "page" is a Dialog whose body is `<pre>{JSON.stringify(selected, null, 2)}</pre>` (`JobBoardPage.tsx:478`).
- `MyApplicationsPage` displays three raw JSON dumps as its only view of the worker's applications (`:243`), the employer's posts (`:307`), and the per-post applicant list (`:409`).
- There is **no UI** for `PATCH /job-posts/:id` or `DELETE /job-posts/:id` even though both endpoints enforce ownership server-side (`backend/src/job-post/job-post.service.ts`).
- There is no employer dashboard at all — `GET /job-posts/me` (`backend/src/job-post/job-post.controller.ts:54`) is wired only as a debug section inside `MyApplicationsPage`.
- There are no status filters, no tabs, no empty states, no per-applicant verification badges, no employment-type badges. A user with five applications cannot find anything.

The Jobs work runs after Profiles (sealed) and in parallel with Verification; the spec must respect both contracts.

## Goals

- Replace every `<pre>{JSON.stringify(...)}</pre>` block in the Jobs surface with real components.
- Replace the comma-separated-ID inputs with a searchable chip-multiselect sourced from `GET /specialisations` and `GET /tags`.
- Ship a real `/jobs/:id` job-detail page (URL-shareable, route-registered) with a role-aware primary CTA.
- Ship `/my-jobs` for employers — list of their posts with status, application count, edit / close / reopen / delete actions.
- Ship `/my-jobs/:id/applicants` for employers — applicant cards with avatar / verification badge / cover message / proposed rate, status tabs, lifecycle actions.
- Ship a redesigned `/my-applications` for workers — status tabs (Pending / Shortlisted / Accepted / Rejected / Withdrawn), withdraw, post snapshot.
- Surface every API error through `parseApiError()` (Auth contract §10) — never a silent 403.
- Mobile-first, design-system-only, light + dark mode, `lint:tokens` clean.

## Non-goals

- **Tag CRUD admin UI** — read-only consumption of `GET /tags` only; staff-side tag management is its own feature folder.
- **Pay-to-apply / connects / lead-buying monetisation** — research consensus says this is the worst UX pattern on UK construction analogues (notes.md §B); MVP applies are free.
- **Algorithmic ranking ("best match", boost, sponsored")** — sort by `created_at desc` only.
- **Saved searches / saved filters** — Pro-tier feature on every analogue surveyed; defer.
- **Conversation / messaging UI between employer and applicant** — the invite endpoint already creates a conversation (`backend/src/job-application/job-application.service.ts:94`); rendering the inbox is a separate feature folder.
- **Collaboration UI surface** — `POST /job-applications/:id/to-collaboration` returns a collaboration; rendering it is a separate feature.
- **Reviews on completed collaborations** — separate feature.
- **Real edit-conflict resolution** — last-write-wins is acceptable in MVP.
- **Map-based browse** — postcode-area filter is text-only in MVP.
- **Real-time application updates** — page-level refetch on focus is acceptable; WebSocket push is not required.

## User Flow

### Worker (browse + apply)

1. Anonymous visitor lands on `/jobs` from the public nav. Sees a search bar, a chip-multiselect for specialisations (catalog fetched from `GET /specialisations`), a postcode-area picker, and a paginated grid of job cards.
2. Visitor clicks a card → routes to `/jobs/:id` (real route, not a dialog). Sees title, employer chip with verification badge, location, pay (day rate or fixed price), urgency flag, full description, required specialisations, tags.
3. Anonymous visitor sees a **"Sign in to apply"** primary CTA. Clicking it navigates to `/login?next=/jobs/:id` (Auth's `next` is sanitised — `auth-flow/contract.md` §5).
4. Signed-in worker (`is_worker: true`, `verification_state === 'ACTIVE'`) sees an **"Apply"** primary CTA. Clicking opens a sheet with cover-message textarea (optional, soft-warned if empty) and a proposed-rate input (optional). Submit calls `POST /job-applications/jobs/:jobPostId/apply`.
5. On success, sheet closes, a toast confirms ("Application submitted"), the CTA flips to "Application submitted" + a deep link to `/my-applications/:applicationId`.
6. Signed-in worker who is `PENDING_EMAIL_VERIFICATION` sees `<AuthBanner kind="EMAIL_NOT_VERIFIED">` above the Apply button and the button is disabled with a tooltip ("Verify your email to apply").
7. Signed-in **employer** viewing a job posted by another employer sees no Apply button (role-gated).
8. Signed-in employer viewing **their own** post sees "Edit", "Close" (or "Reopen"), and "View applicants" CTAs — no Apply.
9. Worker visits `/my-applications`, sees status tabs (`All` · `Pending` · `Shortlisted` · `Accepted` · `Rejected` · `Withdrawn`) with counts. Default tab: `All`. Each row shows post snapshot (title, employer chip, location, pay) + status badge + per-row "Withdraw" (only when status is `PENDING` / `REVIEWED` / `SHORTLISTED`).
10. Worker withdraws → confirms in dialog → `PATCH /job-applications/:id/status { status: 'WITHDRAWN' }` → row badge updates; the row is **not deleted** (history is preserved).

### Employer (post + manage)

1. Verified employer visits `/jobs` → sees a "Post a job" CTA in the page header.
2. Employer clicks → opens a sheet with: title, description (markdown-aware textarea), pay-type select (`Day rate` / `Fixed price`), conditional pay inputs, postcode-area picker (London-borough preset, `PROF-015` reused), duration in days, start date, expiry date, urgency toggle, **specialisations chip-multiselect** (catalog from `GET /specialisations`), **tags chip-multiselect** (catalog from `GET /tags`).
3. Submit calls `POST /job-posts`. On success, sheet closes, toast confirms, employer is routed to `/my-jobs/:id`.
4. Employer visits `/my-jobs` → table of their posts with columns: title, status badge, urgency, application count, created date. Row actions: View applicants · Edit · Close / Reopen · Delete.
5. Employer clicks "Edit" → same form, pre-filled. Soft-freeze rule applies: if any applications exist, **pay-type, day-rate range, fixed-price, postcode-area, and specialisations** are disabled with a tooltip ("Locked — applications received"). Description, urgency, expiry, tags, duration, start_date are still editable. Submit calls `PATCH /job-posts/:id`.
6. Employer clicks "Delete" on a post with **zero** applications → confirm dialog → `DELETE /job-posts/:id`. With **≥ 1** application, Delete is disabled and the tooltip points to "Close" instead.
7. Employer clicks "View applicants" on a post → `/my-jobs/:id/applicants`. Tabs: `All` · `Pending` · `Shortlisted` · `Accepted` · `Rejected` · `Withdrawn`. Each applicant row: avatar + display name + verification badge, proposed rate, cover message (truncated, "Read more" expand), submitted date, action buttons.
8. Action buttons depend on current status:
   - `PENDING` → `Mark reviewed` · `Shortlist` · `Accept` · `Reject`
   - `REVIEWED` → `Shortlist` · `Accept` · `Reject`
   - `SHORTLISTED` → `Accept` · `Reject`
   - `ACCEPTED` → `Convert to collaboration` (one-click, calls `POST /job-applications/:id/to-collaboration`); routes to the collaboration surface (out of this spec's scope)
   - `REJECTED` / `WITHDRAWN` → no actions; row is read-only
9. Each transition calls `PATCH /job-applications/:id/status`; the row optimistically updates and is reverted on error.

### Public visitor

1. Lands on `/jobs` from public nav → can browse, filter, paginate, and open `/jobs/:id`.
2. Cannot apply, post, or see employer dashboards. Apply CTA on detail page becomes "Sign in to apply" with `next=` preserved.

## Requirements

Conventions: each requirement has a stable ID. **Must** = MVP-blocking. **Should** = strongly preferred. **Defer** = explicitly out of MVP. Referenced as `@JOBS-NNN` from commits, tests, and PR descriptions.

### Sealed Auth dependencies (consumed, not duplicated)

`tasks/done/auth-flow/contract.md` (sealed 2026-04-26). This spec consumes — it does not redefine.

- `Account.status ∈ { PENDING_EMAIL_VERIFICATION, ACTIVE, DEACTIVATED }`. Apply / Post require `ACTIVE` (the `AccountStateGuard` is already applied to `JobPostController` and `JobApplicationController` per Auth contract §3).
- JWT payload includes `vs` (verification_state); `req.user.verification_state` exposes it. The frontend reads it through `useAccountMe()` (Profiles `PROF-051`).
- Frontend uses the `ApiError` class + `parseApiError()` helper (Auth contract §10). Every Jobs fetch surfaces errors through these.
- `<AuthBanner kind="EMAIL_NOT_VERIFIED">` is reused for the unverified-on-job-detail state — no parallel banner.
- Public job routes (`/jobs`, `/jobs/:id`) and authed dashboards (`/my-jobs`, `/my-jobs/:id/applicants`, `/my-applications`) register under `MarketplaceRouter` (Auth contract §10), never on the staff host.

### Sealed Profiles dependencies (consumed, not duplicated)

`tasks/done/profiles/spec.md` and `tasks/done/profiles/contract.md`.

- `useAccountMe()` (`PROF-051`) is the only client-side `/account/me` consumer; Jobs reads `{ account, isWorker, isEmployer, verificationState, refetch }` from it.
- `<VerificationBadge>`, `<StarRating>`, and the avatar primitive are reused as-is for both the employer chip on `/jobs/:id` and the applicant cards on `/my-jobs/:id/applicants`. Jobs does not invent parallel components.
- Postcode-area picker reuses the London-borough preset list from `PROF-015`.
- The status-badge token mapping established by Profiles (`bg-success-subtle` / `bg-warning-subtle` / `bg-info-subtle` / `bg-danger-subtle`, see `PROF-030`) is reused for both job-post status and application status.

### Verification dependency (consumed, in flux)

`tasks/product/verification/` is in flight. Until its contract is sealed:

- Apply / Post are gated **only** on `verification_state === 'ACTIVE'` (Auth's `AccountStateGuard` semantics). No tier-based gating in MVP.
- The verification badge rendered on employer chips and applicant cards renders whatever vocabulary Verification ships; today, `<VerificationBadge>` translates legacy `IDENTITY_VERIFIED` at the read boundary (Profiles `PROF-032`). Jobs uses the same component; no in-component translation.
- If Verification adds a tier-gating policy after this feature ships, it lands as a separate `JOBS-NNN` follow-up.

### 1. Public job board

- **JOBS-001 (Must).** Replace the existing `JobBoardPage` action-result and detail-dialog JSON dumps. Specifically: delete the `<pre>{JSON.stringify(lastActionJson)}</pre>` blocks at `JobBoardPage.tsx:339` and `:519`, and the `<pre>{JSON.stringify(selected)}</pre>` block at `:478`. The action-result feedback is replaced by a `<Toast>` and inline error mapping; the detail dialog is replaced by JOBS-008 (real route).
- **JOBS-002 (Must).** `/jobs` lists `OPEN` posts only by default. Closed / Filled / Cancelled are filtered out of the public board.
- **JOBS-003 (Must).** Filter bar: free-text search (`q`), specialisation chip-multiselect (single-select-or-multi — see JOBS-021), postcode-area picker (London-borough preset). All filters bind to URL query params so a filter state is shareable / back-button safe.
- **JOBS-004 (Must).** Job card shows: title, employer display name + `<VerificationBadge>` (small variant), location (postcode-area), pay summary (e.g., "£200–£280/day" or "Fixed £4,500"), urgency flag (red dot + "Urgent" chip when `is_urgent === true`), specialisation chips (max 3 visible + "+N more"), submitted-N-days-ago.
- **JOBS-005 (Must).** Pagination: 20 per page (matches `JobPostQueryDto` default at `backend/src/job-post/dto/job-post-query.dto.ts:5`); next / prev controls; URL-bound `page`.
- **JOBS-006 (Must).** Empty state: design-system illustration + "No open jobs match your filters." Anonymous viewers also see a secondary CTA "Sign up to be the first to apply when one is posted" linking to `/register?role=WORKER`.
- **JOBS-007 (Should).** Sort: default `created_at desc`. Secondary sort options (deferred): "Closest", "Highest day rate". MVP renders one sort only.

### 2. Job detail page

- **JOBS-008 (Must).** Add route `/jobs/:id` rendering a real page (no dialog) under `MarketplaceRouter`. Data source: `GET /job-posts/:id`. Page is public.
- **JOBS-009 (Must).** Header: title (h1), employer chip (avatar + display name + `<VerificationBadge>` linking to `/employers/:employerId`), location, pay summary, urgency chip if applicable, posted-N-days-ago, expires-in copy when `expires_at` is set.
- **JOBS-010 (Must).** Body sections: Description (rendered as plain-text with line-break preservation; no markdown until Reviews-style markdown renderer ships), Required specialisations (chips), Tags (chips, smaller weight), Site location (postcode-area + optional `site_address` if employer chose to share), Duration (`duration_days`), Start date.
- **JOBS-011 (Must).** Role-aware primary CTA bar (sticky on mobile):
  - Anonymous → "Sign in to apply" → `/login?next=/jobs/:id` (sanitised by Auth's `isSafeNext`).
  - Worker, `ACTIVE`, has not applied yet → "Apply" → opens Apply sheet (JOBS-012).
  - Worker, `ACTIVE`, already applied → "Application submitted · View status" → `/my-applications` (deep-link by application id where possible).
  - Worker, `PENDING_EMAIL_VERIFICATION` → disabled "Apply" + `<AuthBanner kind="EMAIL_NOT_VERIFIED">` above (Auth-shipped component).
  - Employer viewing **own** post → "Edit", "View applicants", "Close" / "Reopen" — no Apply.
  - Employer viewing **other** post → no CTA bar (no marketplace cross-employer applies in MVP).
  - Staff → "View as moderator" placeholder (out of scope; no controls in MVP).
- **JOBS-012 (Must).** Apply sheet form: cover-message textarea (optional, max 5000 chars per `apply-job.dto.ts:5`, soft-warn under 100 chars "A short message gets twice the response — Stripe / Upwork research"), proposed-rate input (optional, decimal, range guard `> 0`), Submit. Success closes sheet, fires toast, refetches the page.
- **JOBS-013 (Must).** Apply errors mapped through `parseApiError()`:
  - `401 INVALID_CREDENTIALS` (token expired mid-action) → redirect `/login?reason=expired&next=/jobs/:id`.
  - `403 EMAIL_NOT_VERIFIED` → render `<AuthBanner>` and disable Apply.
  - `403 ACCOUNT_DEACTIVATED` → redirect to `/login?reason=deactivated`.
  - `403 Forbidden` (employer trying to apply, or any other role-mismatch) → CTA never shown in the first place; defensive copy "Only verified workers can apply" if it leaks through.
  - `409 ALREADY_APPLIED` (or unique-constraint violation surfacing as 500 → catch in service layer) → CTA flips to "Application submitted".
  - `400 JOB_CLOSED` (race: post closed between page load and submit) → toast "This job is no longer accepting applications", refetch.

### 3. Post a job (employer create)

- **JOBS-014 (Must).** Replace the existing "Post a job" sheet form on `JobBoardPage.tsx:189`. New form fields, in order: title (required, max 200 chars per schema), description (textarea, optional), pay-type select (`Day rate` / `Fixed price`), conditional pay inputs (day-rate min/max with `max ≥ min` validation, **or** fixed-price single input), postcode-area picker (London-borough preset), site-address (optional, max 300 chars), duration-days (optional, positive int), start date (optional, date picker), expires-at (optional, date picker), urgency toggle, **specialisations chip-multiselect** (JOBS-021), **tags chip-multiselect** (JOBS-022).
- **JOBS-015 (Must).** Submit calls `POST /job-posts`. On success, navigate to `/my-jobs/:id`. On error, surface through `parseApiError()`; field-level errors map to the corresponding inputs.
- **JOBS-016 (Should).** Form is keyboard-accessible: tab order matches visual order, all inputs labelled, error messages `aria-describedby` on the failing input.
- **JOBS-017 (Must).** Form is gated by `useAccountMe().isEmployer && verificationState === 'ACTIVE'`. Workers don't see the "Post a job" CTA at all. Pending-verification employers see the CTA disabled with a tooltip ("Verify your email to post jobs") and the `<AuthBanner>` at the top of the page.

### 4. Edit a job

- **JOBS-018 (Must).** Add route `/my-jobs/:id/edit` under `MarketplaceRouter`. Data source: `GET /job-posts/:id`. Pre-fills the same form as JOBS-014. Submit calls `PATCH /job-posts/:id`.
- **JOBS-019 (Must).** Soft-freeze policy: when the post has `applications_count > 0` (counted client-side from the response of `GET /job-applications/jobs/:jobPostId`, or via JOBS-040 if shipped), the following fields are **disabled** with a tooltip "Locked — applications received": `pay_type`, `day_rate_min`, `day_rate_max`, `fixed_price`, `postcode_area`, `specialisation_ids`. Editable: `title`, `description`, `site_address`, `duration_days`, `start_date`, `expires_at`, `is_urgent`, `tag_ids`.
- **JOBS-020 (Must).** Edit-page guard: if the signed-in user is not the post owner (`req.user.clientProfileId !== job_post.employer_id`), the page renders a 403 redirect to `/jobs/:id`. Backend already enforces ownership in `JobPostService.update()`; the frontend gate is a UX courtesy.

### 5. Specialisation / tag multi-select

- **JOBS-021 (Must).** Add a reusable `<ChipMultiSelect>` component at `web/src/components/ui/chip-multi-select.tsx`. Behaviour:
  - Selected items render as removable chips inside the input frame.
  - Typing filters the dropdown (case-insensitive substring on `name`).
  - Dropdown stays open across selections.
  - Keyboard: Tab focuses, ArrowDown opens dropdown, Enter selects, Backspace on empty input removes the last chip.
  - Mobile (≤ 768 px): renders as a full-screen sheet with the same chip + filter pattern.
  - Empty state in dropdown: "No specialisations match." / "No tags match.".
  - Built on top of shadcn `Command` (`web/src/components/ui/command.tsx` if it exists, otherwise added in this feature) — no third-party autocomplete library.
- **JOBS-022 (Must).** Specialisation picker uses `<ChipMultiSelect>` sourced from `GET /specialisations` (cached in `useSpecialisations()` hook for the page lifetime). Tag picker likewise from `GET /tags` and `useTags()`.
- **JOBS-023 (Should).** Both pickers cap at a soft limit of 10 selections with a "Pick up to 10" helper hint above the limit (UX guard against tag-spam).
- **JOBS-024 (Must).** Submission converts selected chips to `number[]` arrays for the existing DTO (`specialisation_ids`, `tag_ids`).
- **JOBS-025 (Defer).** Tag CRUD admin UI (per backlog §5 of the original brief) is **out of scope** for this feature. If staff need a new tag, they seed via SQL or wait for the future Tag Admin feature folder.

### 6. Employer dashboard — `/my-jobs`

- **JOBS-026 (Must).** Add route `/my-jobs` under `MarketplaceRouter`. Page is gated by `useAccountMe().isEmployer`; non-employers redirect to `/profile`. Data source: `GET /job-posts/me`.
- **JOBS-027 (Must).** Page header: "My jobs", primary CTA "Post a job" (opens the JOBS-014 sheet directly).
- **JOBS-028 (Must).** Status tabs: `All` · `Open` · `Closed` · `Filled` · `Cancelled` with per-tab counts.
- **JOBS-029 (Must).** Each row: title (link to `/jobs/:id`), status badge, urgency chip if applicable, application count (link to `/my-jobs/:id/applicants`), created date, row actions menu (View applicants · Edit · Close / Reopen · Delete).
- **JOBS-030 (Must).** Close action: confirms in dialog, calls `PATCH /job-posts/:id` with `{ status: 'CLOSED' }`. Reopen: same with `{ status: 'OPEN' }`. Cancel: same with `{ status: 'CANCELLED' }` (offered only when the employer chooses Cancel from a longer menu — out of MVP, see JOBS-067).
- **JOBS-031 (Must).** Delete action: only enabled when application count is `0`. Confirms in dialog with copy "This permanently removes the post — applicants would lose their record. Close it instead?". Calls `DELETE /job-posts/:id`. With `≥ 1` application, Delete is disabled and the tooltip points to "Close".
- **JOBS-032 (Must).** Empty state: design-system illustration + "You haven't posted any jobs yet" + primary CTA.

### 7. Employer dashboard — `/my-jobs/:id/applicants`

- **JOBS-033 (Must).** Add route `/my-jobs/:id/applicants` under `MarketplaceRouter`. Page is gated by `isEmployer`. Data source: `GET /job-posts/:id` (post snapshot) + `GET /job-applications/jobs/:jobPostId` (applications). Backend already enforces ownership in `JobApplicationService` at `:140`; the frontend gate is a UX courtesy.
- **JOBS-034 (Must).** Page header: post title (link to `/jobs/:id`), status badge, urgency chip, application total count.
- **JOBS-035 (Must).** Status tabs: `All` · `Pending` · `Reviewed` · `Shortlisted` · `Accepted` · `Rejected` · `Withdrawn`, each with per-tab counts. Default tab: `Pending`.
- **JOBS-036 (Must).** Applicant card: avatar + display name (link to `/workers/:workerId`), `<VerificationBadge>`, `<StarRating>` (with `rating_count`), proposed rate, cover message (truncated to 3 lines, "Read more" expands inline), submitted-N-days-ago, current status badge, action buttons.
- **JOBS-037 (Must).** Action buttons drive `PATCH /job-applications/:id/status`. Allowed transitions per row's current status:
  - `PENDING` → `Mark reviewed` (REVIEWED) · `Shortlist` (SHORTLISTED) · `Accept` (ACCEPTED) · `Reject` (REJECTED)
  - `REVIEWED` → `Shortlist` · `Accept` · `Reject`
  - `SHORTLISTED` → `Accept` · `Reject`
  - `ACCEPTED` → `Convert to collaboration` (`POST /job-applications/:id/to-collaboration`)
  - `REJECTED` → no actions
  - `WITHDRAWN` → no actions
- **JOBS-038 (Must).** Optimistic UI: each transition flips the badge and disables buttons, reverts on error. Errors mapped through `parseApiError()`.
- **JOBS-039 (Should).** "Invite a worker" affordance: a button in the page header opens a sheet that lets the employer paste a worker id (or, in a follow-up, search by name / specialisation) and an optional message. Calls `POST /job-applications/jobs/:jobPostId/invite`. The current text-input-only invite (`MyApplicationsPage.tsx:416–445`) is migrated as-is in MVP; richer search is JOBS-068.
- **JOBS-040 (Should).** Aggregate `application_summary` field returned alongside `GET /job-posts/me` rows so the dashboard table doesn't need a per-row fetch. **Backend prerequisite — see BE-JOBS-1.** If not shipped, JOBS-029 falls back to `applications_count` server-side (one extra query per row in `JobPostService.findMine()`); decide in implementation.

### 8. Worker dashboard — `/my-applications`

- **JOBS-041 (Must).** Replace the current `MyApplicationsPage` worker section. Route `/my-applications` registered (already is, `web/src/App.tsx:213`). Data source: `GET /job-applications/me`. Page is gated by `useAccountMe().isWorker`.
- **JOBS-042 (Must).** Status tabs: `All` · `Pending` · `Reviewed` · `Shortlisted` · `Accepted` · `Rejected` · `Withdrawn` with counts. Default `All`.
- **JOBS-043 (Must).** Each row: post title (link to `/jobs/:id`), employer chip, location, pay summary, status badge, applied-N-days-ago, "Withdraw" button (only when status is `PENDING` / `REVIEWED` / `SHORTLISTED`).
- **JOBS-044 (Must).** Withdraw → confirm dialog → `PATCH /job-applications/:id/status { status: 'WITHDRAWN' }` → row badge flips. Row stays in the list for history (Edge Cases below covers re-apply rules).
- **JOBS-045 (Must).** Empty state: "No applications yet — browse jobs" + primary CTA to `/jobs`.
- **JOBS-046 (Should).** A small "Invitations" section at the top surfaces applications where `initiated_by === 'EMPLOYER'` (the invite-from-employer flow), pinned above the regular tabs. Renders the same row but with an "Invitation" chip instead of "Application", and a "View job" CTA. Worker accepts by replying through the existing apply / status flow.

### 9. Employer dashboard — eliminate the legacy MyApplicationsPage employer sections

- **JOBS-047 (Must).** Delete the employer-side sections of the current `MyApplicationsPage.tsx` (lines `:250–445`) once `/my-jobs` and `/my-jobs/:id/applicants` ship. The route stays worker-only.

### 10. Anti-patterns explicitly removed

- **JOBS-048 (Must).** Zero `<pre>{JSON.stringify(...)}</pre>` blocks across `JobBoardPage`, `MyApplicationsPage`, `JobDetailPage`, `MyJobsPage`, `MyJobsApplicantsPage`, `EditJobPage` after this feature ships. Enforce via grep test in `tests-jobs-applications/` (sibling spec).
- **JOBS-049 (Must).** Zero comma-separated-ID inputs across the Jobs surface. Enforce via the same grep test.
- **JOBS-050 (Must).** All Apply / Post / Edit / status-change actions surface their errors through `parseApiError()` (Auth contract §10) — never a silent 403, never a raw error.message dump. Verified by spot-check in the QA pass.

### 11. Cross-cutting

- **JOBS-051 (Must).** All new and modified files pass `web/scripts/lint-tokens.mjs` (no raw hex, no default Tailwind palette).
- **JOBS-052 (Must).** All new pages render correctly at the 375 px mobile-first baseline; tap targets ≥ 48×48 px; tabs collapse or scroll horizontally as needed.
- **JOBS-053 (Must).** All new client-server interactions use the `api<T>()` helper in `web/src/api.ts` (handles 401 refresh) and surface errors through `parseApiError()` / the `ApiError` class. No parallel fetch utility.
- **JOBS-054 (Must).** Every new page or component reuses `useAccountMe()` (Profiles `PROF-051`) for account-derived state instead of re-fetching `/account/me`.
- **JOBS-055 (Must).** Every new endpoint (if any) documented in OpenAPI / Swagger (`/api/docs`).
- **JOBS-056 (Must).** Light + dark mode verified for every new page, manually, on the QA pass.

### 12. Backend prerequisites (consolidated)

Items the backend may need before all Must requirements above are implementable. Most of the surface is already shipped — these are nice-to-have polish items.

- **BE-JOBS-1 (Should).** Extend `GET /job-posts/me` response to include `applications_count` (or `application_summary: { pending, reviewed, shortlisted, accepted, rejected, withdrawn }`) per row, so `/my-jobs` table doesn't need per-row fetches. Today the controller returns the bare `JobPost` rows; service-level aggregation is one `groupBy` away. Unblocks JOBS-029 / JOBS-040.
- **BE-JOBS-2 (Should).** Add `409 ALREADY_APPLIED` structured error code to the apply path. Today the unique-constraint violation surfaces as a 500 and the SPA cannot map it. Unblocks JOBS-013.
- **BE-JOBS-3 (Should).** Add `400 JOB_CLOSED` structured error when an apply hits a non-`OPEN` post (race condition between page load and submit). Unblocks JOBS-013.
- **BE-JOBS-4 (Defer).** Status `PAUSED` on `JobPost.status` — see Open Questions. Schema change required if accepted.
- **BE-JOBS-5 (Defer).** Worker-search endpoint behind the employer "Invite a worker" flow (JOBS-039 / JOBS-068). Out of MVP — invite remains by id paste.

None of these block the *first slice* of frontend work (JOBS-001 / JOBS-008 / JOBS-021 / JOBS-022 — kill JSON dumps, ship detail page, ship multi-select). They block specific slices and should be addressed in parallel.

## Edge Cases

- **Employer edits a post after applications arrive.** Soft-freeze (JOBS-019) disables structural fields. UX must clearly explain why the inputs are disabled — not just dim them.
- **Worker tries to apply to their own employer's job.** Cannot happen by role — workers don't have an `employer_profile`. If a multi-role account exists (Profiles `PROF-038`), the Apply button is hidden when the signed-in user owns the post (`employer_id === clientProfileId`).
- **Worker applies, then withdraws, then wants to re-apply.** `JobApplication` has `@@unique([job_post_id, worker_id])`. Default rule: **withdraw is permanent for that post**. Re-apply only by the employer reopening the post (Open Question 3 — recommend adopt). UI: the Apply CTA on `/jobs/:id` flips to "Application withdrawn" with no re-apply affordance.
- **Worker applies to a job that gets closed mid-review.** Application stays in the worker's `/my-applications`; status remains whatever it was; new actions are blocked at the controller layer. Worker sees a "This job has been closed" badge on the row.
- **Employer accepts one applicant, then accepts another.** Backend allows multiple `ACCEPTED` rows (no constraint preventing it); UX surfaces a warning dialog "You've already accepted N applicants — accept this one too?". Employer chooses; backend doesn't block.
- **Convert-to-collaboration fires twice.** Backend rejects the second call (`status === 'ACCEPTED'` and the collaboration already exists — service-side guard). UI handles a structured error mapping to "Collaboration already created · View it".
- **Apply sheet open, JWT expires.** `api.ts` 401 refresh fires; if refresh fails, redirect to `/login?reason=expired&next=/jobs/:id` (Auth contract §10).
- **Detail page hit with a numeric id for a `CLOSED` / `FILLED` / `CANCELLED` post.** Page renders normally with a status banner ("This job is no longer accepting applications"); Apply CTA is hidden.
- **Detail page hit with a numeric id for a deleted post.** `404 NOT_FOUND` → render the design-system 404 page.
- **Two browser tabs open on the same post; employer accepts on Tab A, then tries to reject on Tab B.** Tab B's optimistic action calls `PATCH` and either succeeds (status → REJECTED) or fails on a backend invariant. Last-write-wins is acceptable; a focus-refetch on the applicants page mitigates the surprise.
- **Specialisation chip picker shows a stale catalog after staff adds a new specialisation.** Cache TTL is the page lifetime; a hard refresh is the only invalidator. Acceptable for MVP — staff additions are rare.
- **Multi-select 30+ items selected.** JOBS-023 caps soft at 10 with a helper hint; hard cap is whatever the backend accepts (no current constraint).
- **Public visitor on a slow connection clicks Apply CTA.** CTA shows a loading state; clicking again is debounced.

## Acceptance Criteria

**E2E-1 — Worker first apply.** Brand-new worker registers, verifies email, completes profile, navigates to `/jobs`, filters by a specialisation (chip picker), opens `/jobs/:id` (real route), clicks Apply, fills cover message + proposed rate, submits. Sees toast confirmation. Visits `/my-applications`, finds the row in `Pending` tab with status badge.

**E2E-2 — Worker withdraws.** Continuing from E2E-1: on `/my-applications`, clicks Withdraw on the row, confirms. Row badge flips to `Withdrawn`. Returning to `/jobs/:id`, the CTA reads "Application withdrawn" (no re-apply).

**E2E-3 — Employer post → review → accept.** Verified employer visits `/jobs`, opens "Post a job", uses the chip-multiselect to pick 2 specialisations and 2 tags from `GET /specialisations` / `GET /tags` (no comma-separated IDs typed anywhere), submits. Lands on `/my-jobs/:id`. Visits `/my-jobs/:id/applicants`, sees one applicant in `Pending`, marks Reviewed, then Shortlisted, then Accepted. Clicks "Convert to collaboration", routes to the collaboration surface (out of scope to render here).

**E2E-4 — Employer edit (soft freeze).** Continuing from E2E-3 (post has 1 application): employer clicks Edit on `/my-jobs/:id/edit`. The pay-type, day-rate, postcode-area, and specialisation fields are disabled with the freeze tooltip. Description and urgency are editable. Saves — `PATCH /job-posts/:id` succeeds with the partial body.

**E2E-5 — Employer delete (zero applications).** Employer posts a fresh job, immediately clicks Delete from `/my-jobs`. Confirm dialog. `DELETE /job-posts/:id` succeeds. Row disappears.

**E2E-6 — Public visitor funnel.** Anonymous visitor lands on `/jobs`, opens a job, clicks "Sign in to apply". Lands on `/login?next=/jobs/:id`. Signs in. Auth's `postAuthRedirect` sends them back to `/jobs/:id`. CTA now reads "Apply" (assuming worker + ACTIVE).

**E2E-7 — Pending-verification gates.** Worker with `verification_state === 'PENDING_EMAIL_VERIFICATION'` hits `/jobs/:id`. Sees `<AuthBanner kind="EMAIL_NOT_VERIFIED">` and a disabled Apply button. Verifies email; the button becomes active without page refresh (after `useAccountMe().refetch()`).

**E2E-8 — Role gating.** Worker visits `/my-jobs` → redirects to `/profile`. Employer visits `/my-applications` → renders empty (employer has no applications); the route stays worker-scoped per JOBS-041.

**E2E-9 — Guardrails.**
- Zero `<pre>{JSON.stringify(...)}</pre>` blocks in any Jobs file (`JobBoardPage`, `MyApplicationsPage`, new pages). Verified by `grep -RIn "JSON.stringify" web/src/pages/Job* web/src/pages/My*` returning empty.
- Zero comma-separated-ID text inputs anywhere in the Jobs surface (verified by code review).
- All new endpoints (if any) appear in `/api/docs`.
- `cd backend && npm run lint` clean (any backend changes).
- `cd web && npm run lint:tokens` clean.
- `cd web && ./node_modules/.bin/vite build` clean (no TS errors).
- Manual smoke: every E2E above run in light + dark mode at 375 px and at desktop. Both worker and employer paths.

## Open Questions

- **JOBS-OQ-1 — Edit-after-applications policy.** Soft-freeze (JOBS-019, recommended adoption) vs full-edit-with-banner. Recommend soft-freeze; LinkedIn / Indeed consensus per `notes.md` §A.
- **JOBS-OQ-2 — Pause / Reopen state.** Add `PAUSED` to `JobPost.status` (BE-JOBS-4) to let employers stop receiving applications without closing? MVP recommendation: **defer** — the existing OPEN ↔ CLOSED toggle is sufficient.
- **JOBS-OQ-3 — Re-apply after withdrawal.** `@@unique([job_post_id, worker_id])` blocks re-apply. Recommend: withdraw is permanent; the row stays in the worker's history. Backend would need a "re-apply" endpoint that bumps the existing row back to PENDING if the policy changes.
- **JOBS-OQ-4 — Trust-tier gating on Apply / Post.** Today, `verification_state === 'ACTIVE'` is the only gate. Should Apply require Verification's `Basic` tier (ID approved) or Post require `Certified`? Recommend: **defer** until Verification's contract is sealed; surface tier as trust signal, do not block.
- **JOBS-OQ-5 — Cover message required vs optional.** Backend DTO has it optional. Recommend: keep optional, soft-warn under 100 chars.
- **JOBS-OQ-6 — Detail-page URL strategy.** Numeric `id` (matches existing endpoints) or slug (`/jobs/:slug`)? Recommend: numeric `id` for MVP; revisit when SEO is in scope.
- **JOBS-OQ-7 — Closed-post visibility on `/jobs`.** Default filter `status=OPEN` (recommended). Closed / Filled / Cancelled posts remain reachable via deep link `/jobs/:id` for portfolio reference.
- **JOBS-OQ-8 — Multi-accepted applications.** Backend allows multiple `ACCEPTED` rows. Should the UI block the second accept, or warn + allow (per Edge Cases)? Recommend: warn + allow; some employers genuinely want multiple workers per job.
- **JOBS-OQ-9 — Invitation flow surfacing.** Should worker-side `/my-applications` separate "Invitations" (`initiated_by === 'EMPLOYER'`) from "My applications"? Recommend yes (JOBS-046 covers); confirm during build.
- **JOBS-OQ-10 — Search rank / "best match".** Recommend: **defer**; sort by `created_at desc` only in MVP. Algorithmic ranking is unloved on r/Upwork (see notes.md §B).

## Decisions Log

- **2026-05-05 — Folder created.** `tasks/product/jobs-applications/` opened to define the marketplace surface that consumes Profiles + Auth + (in-flight) Verification. Owner: TBD; brief drafted same day.
- **2026-05-05 — Surf research folded in.** UK-construction analogues (MyBuilder, SubbieUK, Subcontractee, Checkatrade), B2B freelancer analogues (Upwork, Indeed, PeoplePerHour), and multi-select UX (Smashing Magazine 2026, NN/g, uxpatterns.dev) reviewed and condensed in `notes.md`. Findings folded into JOBS-019 (soft-freeze on edit), JOBS-021 (chip-multiselect over checkbox / `select multiple`), JOBS-031 (no hard delete after applications), JOBS-046 (invitations as a distinct surface), and the explicit non-goals (no pay-to-apply, no algorithmic ranking, no saved searches).
- **2026-05-05 — Tag CRUD admin UI scoped out (JOBS-025).** Original backlog §5 mentioned tag admin alongside the Jobs board; this feature consumes `GET /tags` read-only. Staff-side tag management is its own future feature folder.
- **2026-05-05 — Trust-tier gating deferred (JOBS-OQ-4).** Apply / Post gates remain `verification_state === 'ACTIVE'` only until Verification's contract seals. Tier is rendered as a non-blocking trust signal on cards and detail pages via the existing `<VerificationBadge>`.
- **2026-05-05 — Backend largely unchanged.** This is a frontend feature. The only "Should" backend asks are JSON shape polish (BE-JOBS-1) and structured error codes for two existing failure modes (BE-JOBS-2 / BE-JOBS-3); no schema migration in MVP.
