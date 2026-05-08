# Spec

## Summary

Production-ready frontend surface for **Reviews** in TradeHub MVP. Closes the post-`COMPLETED` collaboration loop end-to-end without coupling to escrow. Replaces:

- The engineer-only `web/src/pages/ReviewsPage.tsx` debug surface (deleted; `/reviews` route repurposed as a redirect).
- The "Reviews coming soon" empty state in the `Reviews` tab on `/workers/:id` (`WorkerDetailPage.tsx:267-272`) and `/employers/:id` (`EmployerDetailPage.tsx:154-158`) — replaced with paginated public review lists.
- The `Leave a review` gap on `/collaborations/:id` — added as a primary CTA on the existing `<ReviewsSummaryCard>` (`CollaborationDetailPage.tsx:719-752`, `COLLAB-024`).
- The bare-ID admin "Publish review" form in `AdminPage.tsx:606-625` — replaced with a paginated unpublished-reviews queue with inline `Publish` actions.

Adds:

- A new `/reviews/:id` permalink page (single review, public for published, gated for drafts per `review.service.ts:139-169`).
- A new `<LeaveReviewSheet>` shared component for the write flow.
- A new `<ReviewCard>` shared component for the public list rendering.

The Reviews backend (`backend/src/review/{review.controller.ts,review.service.ts,dto/}`) is consumed as-is — **no new endpoints, no new fields, no schema migration**. The frontend is the entire product change.

Requirements use stable IDs (`REVIEW-NNN`) so commits, tests, and reviews can reference them.

## Problem

The Collaborations feature ships a `Mark complete` action (`COLLAB-021`) that transitions a collaboration to `COMPLETED`; when that fires, the review-eligibility window opens. The backend (`backend/src/review/review.service.ts:26`) enforces `collaboration.status === 'COMPLETED'` as the create gate; the unique constraint `@@unique([collaboration_id, reviewer_role])` on `Review` (`schema.prisma:543`) caps each collaboration at one worker-side review and one employer-side review.

What the frontend ships today is not a usable product:

- **No write-flow CTA.** `<ReviewsSummaryCard>` on the collab detail page (`CollaborationDetailPage.tsx:719-752`) shows status badges for both reviews but offers no `Leave a review` button anywhere. A participant on a `COMPLETED` collaboration has no in-product path to write the review — they must navigate to `/reviews`, copy-paste their `collaboration_id` into a numeric input, and use the engineer-only debug form (`ReviewsPage.tsx:287-332`).
- **No public review-display surface.** `WorkerDetailPage.tsx:267-272` and `EmployerDetailPage.tsx:154-158` both render `<EmptyState title="Reviews coming soon">` placeholders in their `Reviews` tabs. The `GET /reviews/worker/:id` and `GET /reviews/employer/:id` endpoints are not called from anywhere in the frontend.
- **No staff publish queue.** `AdminPage.tsx:606-625` ships a `Reviews` admin tab containing a single "Publish review" form taking a raw `review_id` Input. There is no queue listing of unpublished reviews. Result: reviews are created (`is_published: false` by default per `schema.prisma:537`), but staff has no surface to discover them, so they remain drafts forever and never reach the public listing → users never see their submitted review.
- **No single-review permalink.** `GET /reviews/:id` exists on the backend with the published-or-author-or-staff visibility rule (`review.service.ts:139-169`), but no frontend route consumes it. Profile-list links would have nowhere to deep-link to.
- **JSON dumps everywhere.** `ReviewsPage.tsx:222`, `:259`, and `:336` are `<pre>{JSON.stringify(...)}</pre>` blocks. The page is unusable as a product.

The backend is complete and correct; this spec is a frontend feature.

## Goals

- Replace every `<pre>{JSON.stringify(...)}</pre>` block on the Reviews surface with real components.
- Add a `Leave a review` primary CTA on the collab-detail summary card, gated on `status === 'COMPLETED'` and "this party has not yet reviewed".
- Ship a real `<LeaveReviewSheet>` with star-rating inputs for `overall_rating` (required, 1-5) and the five optional sub-ratings, plus a comment field validated against the backend's 5000-char ceiling.
- Replace the "Reviews coming soon" tabs on `/workers/:id` and `/employers/:id` with paginated public review lists driven by `GET /reviews/{worker,employer}/:id?page&limit`.
- Ship `/reviews/:id` as a registered route, public for published, gated for drafts per the backend rule.
- Replace the bare-ID admin "Publish review" form with a paginated unpublished-reviews queue, each row showing reviewer role, collaboration link, ratings preview, comment preview, and a `Publish` action.
- Delete `web/src/pages/ReviewsPage.tsx`. Repurpose `/reviews` as a redirect (`/collaborations` for logged-in, `/login` for guests).
- Surface every API error through `parseApiError()` — never a silent 403.
- Mobile-first, design-system-only, light + dark, `lint:tokens` clean.

## Non-goals

- **Backend changes.** No new endpoints, no DTO additions, no schema migration, no new field on `Review`. The existing 6 endpoints (`POST /reviews/collaboration/:id`, `GET /reviews/collaboration/:id`, `GET /reviews/worker/:id`, `GET /reviews/employer/:id`, `GET /reviews/:id`, `PATCH /reviews/:id/publish`) are consumed as-is.
- **Escrow coupling.** Eligibility is `status === 'COMPLETED'` only — the existing rule. No "funded escrow required" gate. If product later wants that gate, it ships in the escrow feature, not here.
- **Edit / delete of reviews.** No author-side `PATCH` or `DELETE`. No edit window. The backend has no such endpoints; adding them is out of scope.
- **Review reply / response thread.** A reviewee cannot reply on this surface. The existing `Flag dispute` on `/collaborations/:id` (`COLLAB-021`) is the only dispute primitive in MVP.
- **Notifications on publish.** No email, push, or in-app toast on the reviewee's side when staff publishes a review. Future feature.
- **SEO / OG tags / pre-rendering for `/reviews/:id`.** It's a React-Router page; no per-review meta tags or SSR.
- **Real-time updates.** Page-level refetch on focus and after a mutation is acceptable; WebSocket push is not in scope.
- **Aggregate-rating recompute on the frontend.** `WorkerProfile.rating_avg` / `rating_count` and `EmployerProfile.rating_avg` / `rating_count` are recomputed by the backend on publish (`review.service.ts:131-136`); the frontend reads them as authoritative and never re-derives.
- **Bulk publish / staff multi-select.** No "Publish all" button. One row, one click.
- **Search / filter on the staff queue.** `?page=1&limit=20` newest-first is the only ordering. No search by reviewer / collaboration / rating.
- **Anonymous / pseudonymous reviews.** The reviewer is the worker or the employer of the collaboration — not configurable. No name-hiding option.

## User Flow

### Worker (write path)

1. Verified worker (`is_worker: true`, `verification_state === 'ACTIVE'`) marks a collaboration `COMPLETED` from `/collaborations/:id` (`COLLAB-021`).
2. The page refetches; the `<ReviewsSummaryCard>` (`COLLAB-024`) now renders a primary `Leave a review` button next to the worker-review row, because `collaboration.status === 'COMPLETED'` and no `WORKER` review exists yet on this collaboration.
3. Worker clicks `Leave a review` → `<LeaveReviewSheet>` opens with: `Overall rating` (required, `<StarRating>` 1-5, defaults to 0 = not picked, submit blocked until ≥ 1), five optional sub-ratings (`Quality`, `Reliability`, `Communication`, `Payment`, `Safety`) each as a `<StarRating>` with a `Clear` button, and an optional `Comment` `<Textarea>` (≤ 5000 chars, character counter). Submit calls `POST /reviews/collaboration/:id` with the body shape per `CreateReviewDto`.
4. On success: sheet closes, `<Toast>` "Review submitted — staff will review it before it appears publicly", page refetches the collaboration, summary card now reads `Worker review · Draft`, `Leave a review` button hides for the worker side.
5. On error: error inline above the submit button via `parseApiError()`. Sheet does not close. The 5 known error shapes (`No client profile` 400 → "Complete your profile to leave a review" + link to `/profile`; `Reviews can only be created for completed collaborations` 400 → close sheet & toast + refetch (race); `Not a participant in this collaboration` 403 → "You can't review a collaboration you're not part of" + close sheet; `A WORKER/EMPLOYER review already exists` 400 → close sheet & toast + refetch (race); rest → fallback `parseApiError()` message) each map to copy.

### Employer (write path)

Same surface, same component, mirrored: opens for the employer side, hides the worker-side button for them, calls the same endpoint, the backend infers `reviewer_role` from the requester's `client_profile_id` (`review.service.ts:33-39`).

### Public visitor (browse path)

1. Visitor lands on `/workers/:id` → `Reviews` tab (the third tab, alongside `About` and `Specialisations`).
2. Tab calls `GET /reviews/worker/:id?page=1&limit=10`. While loading, render skeleton cards. On success, render a list of `<ReviewCard>`s; each card shows: reviewer-side context (`From an employer`), overall rating + numeric label (`4.5 / 5`), sub-ratings as compact `<StarRating size="sm">`s, the `comment`, and the linked collaboration's `project_type` + `started_at..ended_at` dates if available on the included `collaboration` payload.
3. Pagination footer: `Previous` / `Next` buttons + `Page X of Y · N reviews`. URL is not updated with `?page` — it's local state. (Aligns with `WorkerSearchPage` precedent; deep-linking to a page is not in MVP.)
4. Empty state when `total === 0`: `<EmptyState icon={Star} title="No reviews yet" description="When this worker completes a collaboration, the employer can leave a review here.">`.
5. Each `<ReviewCard>` is wrapped in a `<Link to={\`/reviews/${review.id}\`}>` for permalinking.
6. Same surface on `/employers/:id` with `From a worker` framing and the worker-side endpoint.

### Public visitor (permalink path)

1. Visitor opens `/reviews/:id` (typed in, shared, or clicked from a profile list).
2. Page calls `GET /reviews/:id`. Three outcomes:
   - `200 published` (anyone): renders the full review with reviewer-role label, ratings, comment, and a "Reviewed `<counterparty chip>`" header (counterparty is the worker if `reviewer_role === 'EMPLOYER'`, employer if `'WORKER'` — derived from the embedded `collaboration` payload).
   - `200 draft` (author or staff only): renders the same with a `<Badge variant="warning">Draft — pending staff review</Badge>` chip and a copy line "This review is not public yet."
   - `403` (anyone else on a draft): `<EmptyState title="Review not available" description="This review hasn't been published yet.">` + back-link.
   - `404`: `<EmptyState title="Review not found">`.
3. The detail page header has a back-link: if loaded from a profile list (`document.referrer` matches `/workers/:id` or `/employers/:id`), back-link reads `← Back to <name>'s reviews`; else `← Back`.

### Staff (publish path)

1. Staff opens `/admin` → `Reviews` tab.
2. Tab calls `GET /reviews/unpublished?page=1&limit=20` (the single new backend endpoint added in this feature, staff-only via `@Roles('STAFF')`; see REVIEW-046). Response shape mirrors the existing paginated lists: `{ items, total, page, limit, totalPages }`, ordered `created_at desc`, with `include: { collaboration: true }` so each row has the same context the public lists already render.
3. The queue renders unpublished reviews newest-first as a list. Each row: `<Badge>` reviewer role, `Reviewing collaboration #<id>` link to `/collaborations/:id`, `<StarRating size="sm">` overall, comment preview (truncated to 200 chars), `Submitted <relative-time>`, `[Publish]` button, and a secondary `View →` link to `/reviews/:id`.
4. Staff clicks `Publish` → calls `PATCH /reviews/:id/publish`. Optimistic remove the row from the list. On error, rollback + inline alert via `parseApiError()`. On success, `<Toast>` "Review published — counterparty rating recalculated".
5. Staff clicks `View →` → routes to `/reviews/:id`. The detail page shows the draft banner (REVIEW-032) and a `← Back to publish queue` back-link (REVIEW-033).
6. The bare-ID `Publish review` form (`AdminPage.tsx:614-625`) is removed.

### Logged-out visitor on protected surfaces

- `/reviews/:id` is **public for published**; `<Protected>` is not applied. Drafts return 403 from the backend; the frontend renders the `<EmptyState>`.
- `/admin` Reviews tab inherits `/admin`'s existing `<Protected loggedIn>` (App.tsx:273) plus the role guard already enforced on the backend (`@Roles('STAFF')` on `PATCH /reviews/:id/publish`).

## Requirements

Conventions: each requirement has a stable ID. **Must** = MVP-blocking. **Should** = strongly preferred. **Defer** = explicitly out of MVP. Referenced as `@REVIEW-NNN` from commits, tests, and PR descriptions.

### Sealed Auth dependencies (consumed, not duplicated)

`tasks/done/auth-flow/contract.md` (sealed 2026-04-26).

- `Account.status === 'ACTIVE'` and `verification_state === 'ACTIVE'` are required for the create-review action; the backend already enforces this via `AccountStateGuard` and `RequiresVerifiedEmail` on `review.controller.ts:33-34`. The frontend reads these via `useAccountMe()` (Profiles `PROF-051`) and renders disabled-with-tooltip states; it does not invent a parallel guard rule.
- All API errors are surfaced through the `ApiError` class + `parseApiError()` helper. Every Reviews fetch uses these.
- `<AuthBanner kind="EMAIL_NOT_VERIFIED">` is reused for the unverified-on-leave-review state.

### Sealed Profiles dependencies (consumed, not duplicated)

`tasks/done/profiles/contract.md`.

- `<StarRating>` (`web/src/components/StarRating.tsx`) is reused for all rating inputs and read-only displays. Reviews does not invent a parallel star component.
- `<VerificationBadge>` and the avatar primitive are reused for the counterparty chip on `/reviews/:id`.
- `WorkerProfile.rating_avg / rating_count` and `EmployerProfile.rating_avg / rating_count` are read as authoritative; this feature does not re-derive aggregates on the client.
- The `/workers/:id` and `/employers/:id` page shells (header, tabs) are extended; this feature does not redesign them.

### Sealed Collaborations dependencies (consumed, not duplicated)

`tasks/done/collaborations-polish/spec.md`.

- `COLLAB-024` `<ReviewsSummaryCard>` (`CollaborationDetailPage.tsx:719-752`) is **extended in this feature** (gain a `Leave a review` button per side, eligibility-aware) — it is not rewritten. The card's "no review yet / draft / published" badge logic stays.
- `COLLAB-021` `Mark complete` lifecycle transition is consumed unchanged; review eligibility is gated on the resulting `status === 'COMPLETED'`.
- Sealed contracts referenced (no duplication): `tasks/done/auth-flow/contract.md`, `tasks/done/profiles/contract.md`.

### 1. Page hygiene & route registration

- **REVIEW-001 (Must).** Delete every `<pre>{JSON.stringify(...)}</pre>` block on Reviews surfaces. Specifically: `ReviewsPage.tsx:222`, `:259`, `:336`. (Achieved by deleting the file in REVIEW-002.)
- **REVIEW-002 (Must).** Delete `web/src/pages/ReviewsPage.tsx`. Remove the lazy import in `web/src/App.tsx:41`. Remove the `/reviews` nav item from `App.tsx:58`. Replace the `/reviews` route in `App.tsx:214` with a `<Navigate>` redirect: logged-in → `/collaborations`, anonymous → `/login`.
- **REVIEW-003 (Must).** Register `/reviews/:id` in `web/src/App.tsx` (no `<Protected>` wrapper — public for published; backend gates drafts). Add the lazy import for `ReviewDetailPage` alongside the rest.
- **REVIEW-004 (Should).** When the existing `/reviews` redirect lands a logged-in user on `/collaborations`, append `?from=reviews` to the URL so a future analytics surface can detect the redirect. Frontend is then free to consume or ignore.

### 2. Leave-a-review flow on `/collaborations/:id`

- **REVIEW-010 (Must).** Extend `<ReviewsSummaryCard>` (`CollaborationDetailPage.tsx:719-752`): when `collaboration.status === 'COMPLETED'` AND the current user is a participant AND that participant has no review for this collaboration, render a primary `Leave a review` button on the relevant row. When all four "no" conditions are met for either side (status, participant, no existing review, action available), the row keeps its existing `Not submitted` badge and gains the button. When any condition fails (e.g. the worker has already reviewed), the button hides and the existing `Draft` / `Published` badge stays.
- **REVIEW-011 (Must).** Implement `<LeaveReviewSheet>` in `web/src/components/reviews/LeaveReviewSheet.tsx`. Props: `collaborationId: string`, `open: boolean`, `onOpenChange(b): void`, `onSubmitted(review): void`. Renders a `<Sheet side="right">` (mobile: full-screen) with the form below.
- **REVIEW-012 (Must).** Form fields, in order:
  1. `Overall rating` — required, label "Overall rating *", helper "1 to 5 stars", input is `<StarRating value onChange label>` with a numeric label `<value> / 5` next to it (`0` shown as `Not picked`). Submit blocked while value is 0.
  2. Optional sub-ratings (`Quality`, `Reliability`, `Communication`, `Payment`, `Safety`) — collapsible `<details>` group titled `Add detailed ratings (optional)` (defaults to closed); each row is `<label>` + `<StarRating onChange>` + `Clear` button (only visible when value > 0). Setting a sub-rating then clearing it is identical to never setting it (omitted from request body).
  3. `Comment` — `<Textarea>`, optional, 0-5000 chars, character counter under the field showing `<n> / 5000`. Counter goes danger-coloured at 4900+. Submit blocked at > 5000.
- **REVIEW-013 (Must).** Submit calls `POST /reviews/collaboration/:collaborationId` with the body `{ overall_rating, [optional sub-ratings if non-zero], [comment if non-empty] }`. Network in progress: button disabled with spinner. On success: invoke `onSubmitted(response)`, close sheet, fire `<Toast>` "Review submitted — staff will review it before it appears publicly", parent (`CollaborationDetailPage`) refetches the collaboration so the summary card updates.
- **REVIEW-014 (Must).** Error mapping (all via `parseApiError()`):
  - 400 `No client profile for this account` → inline alert "Complete your profile first" with `<Link to="/profile">` and a `Cancel` button. Sheet stays open.
  - 400 `Reviews can only be created for completed collaborations` → close sheet, `<Toast variant="warning">` "This collaboration is no longer eligible for review", refetch collaboration. (Race: someone moved status off `COMPLETED` between page load and submit.)
  - 400 `A WORKER review already exists for this collaboration` (or `EMPLOYER`) → close sheet, `<Toast variant="info">` "A review already exists for this side", refetch collaboration.
  - 403 `Not a participant in this collaboration` → close sheet, `<Toast variant="danger">` "You can't review a collaboration you're not part of".
  - Anything else → inline alert with the `parseApiError()` message above the submit button. Sheet stays open.
- **REVIEW-015 (Must).** Account-state gating: if `useAccountMe()` returns a non-`ACTIVE` `Account.status` or non-`ACTIVE` `verification_state`, the `Leave a review` button on the summary card is rendered as disabled with a tooltip "Verify your email to leave reviews", linking to `/settings/security` (consistent with other write-flow gates). Backend rejection (the `RequiresVerifiedEmail` 403) is a fallback for race; surfaced via REVIEW-014's "anything else" branch.
- **REVIEW-016 (Should).** When the sheet opens, focus the overall-rating star (`tabIndex={0}` on the first star). When it closes, return focus to the `Leave a review` button that opened it.
- **REVIEW-017 (Should).** Local draft autosave. While `<LeaveReviewSheet>` is open, persist the form state (overall + sub-ratings + comment) to `localStorage` under the key `review-draft:<collaborationId>:<clientProfileId>` on every change (debounced 300ms). On open, hydrate from this key if present and render an inline `<Banner variant="info">Draft restored — last edited <relative-time>. <Button variant="ghost" size="sm">Discard draft</Button></Banner>` above the form. Clear the key on successful submit, on `Discard draft`, and on any of the 4 known terminal-error paths in REVIEW-014 (the review is no longer creatable). Keys older than 30 days are cleared on sheet open via a one-shot housekeeping pass that walks `localStorage` for the `review-draft:` prefix. Do not autosave between sheet sessions where the user clicked the X without explicit `Discard` — restoring a draft is the desired behaviour.

### 3. Public review listings on profile pages

- **REVIEW-020 (Must).** Replace the `Reviews` tab content in `web/src/pages/WorkerDetailPage.tsx:267-272` with a paginated list driven by `GET /reviews/worker/:id?page=<n>&limit=10`. Same on `web/src/pages/EmployerDetailPage.tsx:154-158` with `/reviews/employer/:id`.
- **REVIEW-021 (Must).** Implement `<ReviewCard>` in `web/src/components/reviews/ReviewCard.tsx`. Props: `review` with the embedded `collaboration` payload, `linkToPermalink?: boolean = true`. Renders:
  - Header row: reviewer-side label (`From an employer` / `From a worker`), `<Badge variant="success">Published</Badge>` (or `Draft` when shown on a permalink to author/staff), and `<time>` for `published_at`.
  - Rating block: `<StarRating value={overall_rating} size="md">` + numeric label `<n> / 5`; below, a compact `<dl>` with all five sub-ratings (each shown as `<StarRating size="sm">` or `—` when null).
  - Comment block: full text, with `<em>No comment</em>` when null.
  - Footer row: `Project: <project_type>` + `<dates>` (collaboration's `started_at..ended_at` if both present, or `Started <date>` if only one) — derived from `review.collaboration`.
  - When `linkToPermalink`, the entire card is wrapped in `<Link to={\`/reviews/${review.id}\`}>` with hover styling.
- **REVIEW-022 (Must).** Pagination: footer row with `Previous` / `Next` and `Page X of Y · N reviews`. State is in-page (no URL query). Disable `Previous` on page 1, `Next` on the last page. `limit=10` is fixed for MVP.
- **REVIEW-023 (Must).** Empty state: when `total === 0`, render `<EmptyState icon={Star} title="No reviews yet" description="<Worker / Employer name>'s first review will appear here once a collaboration completes.">`. No CTA — the visitor isn't necessarily a participant.
- **REVIEW-024 (Should).** Skeleton loader: while the request is in flight, render three skeleton cards (`<Skeleton>` from primitives) the same shape as `<ReviewCard>`. No layout shift on first load.

### 4. Single-review permalink (`/reviews/:id`)

- **REVIEW-030 (Must).** Implement `web/src/pages/ReviewDetailPage.tsx` rendering `GET /reviews/:id`. Header: counterparty chip (avatar + display name + verification badge), back-link (REVIEW-033), status pill (`Published` / `Draft`). The counterparty chip is built by issuing **one extra fetch** alongside the review fetch — `GET /worker/:id` if `reviewer_role === 'EMPLOYER'` (the reviewee is the worker), else `GET /employer/:id` — and rendering the existing `<VerificationBadge>` + avatar primitive from `tasks/done/profiles/contract.md`. The two fetches issue in parallel; while either is in flight, render a `<Skeleton>` for the chip. If the counterparty fetch 404s, render `Worker #<id>` / `Employer #<id>` with the avatar slot showing the existing initials fallback. (Locked 2026-05-08 per spec Q2 — option (a): the second fetch is the more professional UX and `/reviews/:id` is the lowest-traffic surface in the feature, so the extra request is acceptable.)
- **REVIEW-031 (Must).** Body: re-uses `<ReviewCard linkToPermalink={false}>` to render the same shape used on the profile lists, plus a "About this collaboration" footer block linking to `/collaborations/:id` (only when the viewer is the author, the counterparty, or staff — otherwise the link is hidden, since the backend's `GET /collaborations/:id` would 403 a non-participant). For public visitors viewing a published review, the link is hidden.
- **REVIEW-032 (Must).** Three-state response handling:
  - `200` published OR draft-as-author OR draft-as-staff → render the page. If draft, prepend a sticky `<Banner variant="warning">This review is not public yet — pending staff review.</Banner>`.
  - `403` (draft-as-stranger) → `<EmptyState icon={Lock} title="Review not available" description="This review hasn't been published yet.">` with a back-link (REVIEW-033).
  - `404` → `<EmptyState icon={SearchX} title="Review not found">` with a back-link to `/`.
- **REVIEW-033 (Must).** Back-link logic on `/reviews/:id`. Detect the entry surface from `document.referrer` (matched against `window.location.origin`); choose the most specific match in this priority order:
  1. `/admin` (any path under it) → `← Back to publish queue` linking to `/admin?tab=reviews`. Visible only when `useAccountMe()` reports `isStaff`; non-staff who somehow followed an admin referrer get the next-best fallback.
  2. `/workers/:id` → `← Back to <name>'s reviews` linking back to that page's Reviews tab. The name is read from the counterparty fetch in REVIEW-030 when the worker on the referrer matches the review's counterparty; otherwise generic `← Back to worker reviews`.
  3. `/employers/:id` → analogous to (2).
  4. Any other or empty referrer → generic `← Back` that calls `navigate(-1)` if the history stack is non-empty, else routes to `/`.
  This logic also means the staff queue's `View →` link (REVIEW-040 step 5) lands on a detail page that knows how to send them back home.

### 5. Staff publish queue (`/admin` Reviews tab)

- **REVIEW-040 (Must).** Replace the contents of the `Reviews` tab in `web/src/pages/AdminPage.tsx:606-625` with a paginated unpublished-reviews queue driven by `GET /reviews/unpublished?page&limit` (the new backend endpoint specified in REVIEW-046). The bare-ID `Publish review` form is removed.
- **REVIEW-041 (Must).** Each queue row renders: `<Badge>` reviewer role (`WORKER` / `EMPLOYER`), `Reviewing collaboration <Link to="/collaborations/:id">#<id></Link>`, `<StarRating size="sm">` overall + `<n>/5`, comment preview truncated to 200 chars (`Read more` link expands inline if > 200), `Submitted <relative-time>` (`X days ago` via existing date helper), and two actions: `[Publish]` primary button and `View →` secondary link to `/reviews/:id`. Rows on mobile stack vertically; on ≥ md they're in a `<Card>` grid.
- **REVIEW-042 (Must).** `Publish` button calls `PATCH /reviews/:id/publish`. Optimistically remove the row; on error, restore + inline alert via `parseApiError()`; on success, `<Toast>` "Review published — counterparty rating recalculated". The `recalculateRatings()` side-effect is the backend's responsibility (`review.service.ts:131-136`); the frontend trusts it.
- **REVIEW-043 (Must).** Pagination: `?page=1&limit=20` newest-first. Same `Previous`/`Next` controls as the profile lists.
- **REVIEW-044 (Should).** Empty queue state: `<EmptyState icon={CheckCircle2} title="Queue clear" description="No reviews waiting to be published.">`.
- **REVIEW-045 (Defer).** Bulk select / "Publish all". Future feature.
- **REVIEW-046 (Must — Backend).** Add a single new endpoint `GET /reviews/unpublished` to `backend/src/review/review.controller.ts`, guarded by `JwtAuthGuard` + `RolesGuard` + `@Roles('STAFF')`, accepting the existing `ReviewQueryDto` (`page`, `limit` — defaults `1` / `20`, max `limit=100` per the existing DTO). Implementation in `review.service.ts`: `findMany({ where: { is_published: false }, include: { collaboration: true }, orderBy: { created_at: 'desc' }, skip, take })` + a parallel `count()`; return the same `{ items, total, page, limit, totalPages }` shape used by `getBySubject()`. No DTO changes to the existing endpoints; no schema migration. This is the **only** backend change in this feature (locked 2026-05-08 per spec Q1).
- **REVIEW-047 (Must — Backend tests).** A backend integration test for `GET /reviews/unpublished`: (a) returns a 403 to a non-staff caller; (b) returns only `is_published: false` rows; (c) paginates correctly; (d) orders newest-first. Lives in the existing backend test surface (colocated `review.service.spec.ts` for unit, plus an e2e in `backend/test/` per the repo `CLAUDE.md` testing matrix).

### 6. Error surfacing & access control

- **REVIEW-050 (Must).** Every fetch and mutation on the surface surfaces errors through `parseApiError()` and renders human-language messages. No raw `error.message`. No silent 403.
- **REVIEW-051 (Must).** `/reviews/:id` is **not** wrapped in `<Protected>`. Anonymous visitors hitting it for a published review render the page; for a draft they get a 403 from the backend, surfaced as REVIEW-032's `<EmptyState>`.
- **REVIEW-052 (Should).** When the create-review request fails for an unauthenticated user (token expired mid-flow), the global `<ApiError>` interceptor's existing redirect-to-login path applies (`/login?next=/collaborations/:id`); this feature does not invent a parallel auth-recovery flow.

### 7. Design-system compliance

- **REVIEW-060 (Must).** Zero raw hex / Tailwind default scale / inline-style-color usage. `npm run lint:tokens` is clean.
- **REVIEW-061 (Must).** `vite build` is clean. Light + dark mode toggle works for every new surface (`<LeaveReviewSheet>`, `<ReviewCard>`, `/reviews/:id`, the admin queue). 375px viewport works (mobile-first).
- **REVIEW-062 (Must).** Reuse: `<StarRating>`, `<Card>`, `<Sheet>`, `<Dialog>`, `<Badge>`, `<Button>`, `<Textarea>`, `<Label>`, `<Skeleton>`, `<EmptyState>`, `<Toast>`, `<VerificationBadge>` — from `web/src/components/ui/` and `web/src/components/`. No new domain primitives unless explicitly required by a requirement here.
- **REVIEW-063 (Should).** New domain components live under `web/src/components/reviews/{LeaveReviewSheet.tsx, ReviewCard.tsx, api.ts}` to match the `web/src/components/collaborations/` precedent shipped in `collaborations-polish`.

### 8. Tests counterpart

- **REVIEW-070 (Must).** A `tests-reviews/` folder opens the same week implementation starts and lives in `tasks/in-progress/` until the implementation feature ships. It covers:
  - Leave-review sheet: overall-rating required, sub-rating optionality + clear button, comment 5000-char ceiling + danger counter at 4900+, error mapping for the 4 known 400/403 shapes (race conditions: status changed off `COMPLETED`, duplicate review, non-participant, no client profile).
  - Local draft autosave (REVIEW-017): a draft persists across `<Sheet>` close-without-submit and re-open; the `Discard draft` button clears it; the key clears on successful submit; the 30-day housekeeping pass evicts stale keys.
  - `<ReviewsSummaryCard>` extension: button visibility matrix (`COMPLETED` × participant × no-existing-review on each of the two sides) — 2×2×2 = 8 cases. Disabled-with-tooltip when account state is non-`ACTIVE`.
  - Profile-page `Reviews` tab: pagination, empty state, skeleton render, link-to-permalink wrapping.
  - `/reviews/:id`: 200 published (public render), 200 draft-as-author (sticky banner + collab-link visible), 200 draft-as-staff (same with staff badge), 403 (`<EmptyState>`), 404 (`<EmptyState>`); counterparty chip avatar fetch (REVIEW-030); back-link priority (REVIEW-033) — admin / worker / employer / fallback.
  - Staff queue: row render, `Publish` mutates + optimistic remove, optimistic-error rollback + inline alert, `View →` link routes correctly.
  - Token lint clean: a smoke test that `lint:tokens` passes on the changed files.
- **REVIEW-071 (Must).** Do **not** test the `recalculateRatings()` side-effect from the frontend test suite — it's a backend integration concern. Add a comment to the test file referencing `backend/src/review/review.service.ts:171-234` and the backend test added by REVIEW-047.

## Edge Cases

- **Worker is the responder, employer is the initiator (or vice versa).** Reviewer role is derived from `client_profile_id` matching `worker_id` / `employer_id` (`review.service.ts:33-39`); the frontend does not pass `reviewer_role` in the request body and never trusts a client claim. Both sides see the same `Leave a review` UX from their seat.
- **A user who is both worker and employer on the same TradeHub account.** They have one `client_profile_id`. Backend resolves which side they sit on based on which of `collaboration.worker_id` / `employer_id` matches that id — they cannot ever be both on the same row, so the determination is unambiguous.
- **A user opens the leave-review sheet, the network drops, and they retry.** Idempotency: backend's `existing` check (`review.service.ts:41-50`) blocks duplicates. The frontend treats the `400 A <ROLE> review already exists` as the recovery path (REVIEW-014).
- **Two tabs: tab A submits, tab B has stale `<ReviewsSummaryCard>` and shows the button.** Tab B's submit hits the duplicate-error path; sheet closes, refetch, button hides.
- **Backend recalculates `rating_avg` to 0 because there are no published reviews yet.** Frontend reads it as authoritative; profile-card header shows `0 stars · 0 reviews`. Acceptable; no special-case copy required.
- **Comment contains valid HTML / Markdown.** Stored as plain text. Rendered as plain text via React (escaped automatically). No Markdown rendering on this surface; future feature.
- **Sub-ratings: user picks 4 then clicks `Clear` then re-picks 5.** Submit body sends `5`, not `null`. The frontend treats `0` and `unset` as identical (omitted from request body).
- **Public visitor opens `/reviews/:id` for a draft they didn't write.** Backend 403; `<EmptyState>` per REVIEW-032.
- **`/reviews/:id` for a `Review` whose `Collaboration` was deleted.** Schema has `collaboration` as a non-nullable relation; backend's `findUnique` with `include: { collaboration: true }` cannot return null collaboration. If it does (data corruption), the `<ReviewCard>` falls back to "Project details unavailable" in the footer — no crash.
- **Network failure on first list load (profile-page `Reviews` tab).** Inline alert with a `Retry` button; no skeleton-stuck state. Identical to the JobBoardPage retry pattern.
- **Staff queue shows 0 unpublished reviews.** Empty state per REVIEW-044.
- **A `Review` is created with all five sub-ratings null and no comment.** Backend allows it (DTO `?` on each). Frontend renders the card with `—` for each sub-rating and `<em>No comment</em>` for the comment. Acceptable; the card does not look broken.
- **The `<LeaveReviewSheet>` is opened, the user idles, and their access token expires.** The submit hits `401`. Global `<ApiError>` interceptor redirects to `/login?next=/collaborations/:id`. Sheet state is lost; user re-opens after re-auth and re-fills.
- **A user lands on `/reviews` after the redirect lands them on `/collaborations` (REVIEW-002).** No banner, no toast — silent redirect is acceptable. The `?from=reviews` query (REVIEW-004) is informational only.

## Acceptance Criteria

- `web/src/pages/ReviewsPage.tsx` is deleted from the tree. (`find web/src -name 'ReviewsPage*' -type f` returns nothing.)
- `web/src/App.tsx` no longer imports `ReviewsPage`, no longer has `{ to: '/reviews', label: 'Reviews' }` in the nav, and `/reviews` resolves to a `<Navigate>` redirect.
- `/reviews/:id` is a registered route in `web/src/App.tsx`. Hitting it for a published review renders the page when logged-out; for a draft when logged-out, renders the `Review not available` `<EmptyState>`.
- On `/collaborations/:id` for a `COMPLETED` collaboration where the current user is a participant who has not yet reviewed, the `<ReviewsSummaryCard>` shows a primary `Leave a review` button. Opening it opens `<LeaveReviewSheet>`. Submitting a valid form (overall ≥ 1) closes it, fires a toast, and the row badge changes to `Draft`. The button hides for that side.
- On `/workers/:id` and `/employers/:id` Reviews tabs: paginated `<ReviewCard>` lists; `Page X of Y · N reviews` footer; empty state when `N === 0`; each card links to `/reviews/:id`.
- On `/admin` Reviews tab: paginated unpublished-reviews queue; each row has reviewer-role badge + collab link + ratings preview + comment preview + `[Publish]`. Click `Publish` removes the row; toast confirms.
- All API errors render via `parseApiError()` — no raw `error.message`, no silent 403.
- Zero `<pre>{JSON.stringify(...)}</pre>` blocks remain on any reviews-related surface. (`grep -rn 'JSON\.stringify' web/src/pages/Review* web/src/components/reviews/` returns nothing.)
- `npm run lint:tokens` is clean. `./node_modules/.bin/vite build` is clean. Light + dark mode parity verified. 375px viewport verified.
- `tests-reviews/` has a `spec.md` covering the REVIEW-070 / REVIEW-071 test set.

## Open Questions

(All six open questions were resolved on 2026-05-08 — see the Decisions Log below. Future questions go here as they surface.)

## Decisions Log

- **2026-05-08 — Q1 resolved.** Add the `GET /reviews/unpublished` endpoint. The brief's "no backend changes" constraint flexes on this one read-only staff-only endpoint (now the only backend addition in the feature). New requirements: `REVIEW-046` specifies the endpoint shape; `REVIEW-047` covers backend tests. The publish queue (`REVIEW-040`) consumes it directly; the staff user-flow step that previously hand-waved "client-side aggregation" is now concrete.
- **2026-05-08 — Q2 resolved.** Counterparty chip on `/reviews/:id` (`REVIEW-030`) issues a parallel second fetch (`GET /worker/:id` or `GET /employer/:id`) and renders the full chip with avatar + verification badge. Skeleton during load; initials-fallback if the chip-fetch 404s. Chosen for the more professional UX over the cheaper id-only fallback; `/reviews/:id` is the lowest-traffic surface in the feature, so one extra request is acceptable.
- **2026-05-08 — Q3 resolved.** `<LeaveReviewSheet>` autosaves drafts to `localStorage` and restores them on re-open. New requirement `REVIEW-017` specifies the storage key (`review-draft:<collaborationId>:<clientProfileId>`), the 300ms debounce, the restore-banner with `Discard draft` action, the success / terminal-error key clears, and the 30-day housekeeping eviction.
- **2026-05-08 — Q4 deferred.** The admin `Reviews` queue is **unpublished-only**. The backend has no un-publish endpoint and adding one is explicitly out of scope. Published-review review (e.g. for moderation re-review) is a future feature, not this one.
- **2026-05-08 — Q5 resolved.** The `/reviews/:id` back-link reads `document.referrer` and selects the most specific match in priority order: `/admin*` → `/admin?tab=reviews` (staff only); `/workers/:id` → that page's Reviews tab; `/employers/:id` → analogous; otherwise → `navigate(-1)` if history is non-empty, else `/`. New requirement `REVIEW-033` codifies this; the staff queue's `View →` link (`REVIEW-041`) is the source for the admin path.
- **2026-05-08 — Q6 deferred.** No `Helpful` / `Report` actions on `<ReviewCard>` in MVP. Would require a new schema (`ReviewVote`) and endpoints; future feature.
