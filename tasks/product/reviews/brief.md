# Brief

## Feature

Production-ready **Reviews** surface for TradeHub MVP — the post-completion two-way feedback loop where a worker rates the employer they just worked with, and the employer rates the worker. Closes the collaborations loop end-to-end, independently of escrow. This feature only covers the **review write path, the public review-display surfaces, the single-review permalink, and the staff publish queue**. Stripe-Connect escrow logic is **not** a dependency: review eligibility is gated solely on `Collaboration.status === 'COMPLETED'`, which is already driven by the existing `PATCH /collaborations/:id/status` flow shipped in `tasks/done/collaborations-polish/` (`COLLAB-021`).

## Problem

The backend already ships the full Reviews surface (`backend/src/review/{review.controller.ts,review.service.ts,dto/}`, `prisma/schema.prisma:526-546`) — 6 endpoints (create / list-by-collab / list-by-worker / list-by-employer / get-by-id / staff publish), the unique-per-collab-per-role constraint, the published-only-public visibility rule, and the auto-recalculation of `WorkerProfile.rating_avg / rating_count` and `EmployerProfile.rating_avg / rating_count` on publish (`review.service.ts:171-234`). The frontend exposes none of this as a real product surface:

- `web/src/pages/ReviewsPage.tsx` is an engineer-only debug page. The worker-reviews search dumps `<pre>{JSON.stringify(workerReviews, null, 2)}</pre>` (`:222`), the employer-reviews search dumps the same (`:259`), and the create-review form's response dumps `<pre>{JSON.stringify(createResult, null, 2)}</pre>` (`:336`). Worker / employer search take raw numeric IDs with no autocomplete, no link to a profile, no source-of-truth UX.
- `web/src/pages/CollaborationDetailPage.tsx:719-752` already renders a `<ReviewsSummaryCard>` for the collaboration detail (delivered by `COLLAB-024`), but it only shows `Published` / `Draft` / `Not submitted` badges — there is **no "Leave a review" CTA**, so a participant on a `COMPLETED` collaboration has no in-product path to write the review. They have to navigate to `/reviews`, copy-paste their `collaboration_id`, and use the debug form.
- `web/src/pages/WorkerDetailPage.tsx:267-272` and `web/src/pages/EmployerDetailPage.tsx:154-158` both render `<EmptyState title="Reviews coming soon" description="Two-way verified reviews will appear here once collaborations complete.">` in their `Reviews` tabs — the `GET /reviews/worker/:id` and `GET /reviews/employer/:id` endpoints exist and return paginated published reviews, but neither tab calls them.
- `web/src/pages/AdminPage.tsx:606-625` ships a `Reviews` admin tab that contains a single "Publish review" form taking a raw `review_id` Input. **There is no queue listing of unpublished reviews**, so a staff member has no way to discover which reviews are pending publish — they would have to query the DB directly or get the ID out-of-band. Result: reviews are created (`is_published: false` by default), but none reach the public listing → users never see their submitted review surface anywhere.
- `GET /reviews/:id` (the public-or-author single-review fetch) has no frontend route. There is no shareable permalink for an individual review.

The goal of this feature is to turn this into a usable, design-system-compliant product surface **without any backend change**, and to fully close the Reviews feature so the only remaining post-collaboration delivery is escrow (which a teammate is delivering separately).

## Goal

Make Reviews a real product surface for the post-collaboration loop:

- A real **"Leave a review"** CTA on `/collaborations/:id` for each party once the collaboration is `COMPLETED` and that party has not already submitted a review. Opens a `<Sheet>` with the same six rating fields the backend supports (overall + 5 optional sub-ratings) and a comment field, validated client-side.
- Real public **review lists on `/workers/:id` and `/employers/:id`** Reviews tabs, replacing the "Reviews coming soon" placeholders. Paginated (`page=1&limit=10`), shows reviewer-side context (collaboration project type, dates), and reflects the published-only visibility rule.
- A real **single-review permalink at `/reviews/:id`**, public for published reviews and gated for the author / staff for drafts (matches `review.service.ts:139-169`). Used as the deep-link target from profile lists, the collab-detail summary, **and the admin publish queue**. Renders a counterparty chip with avatar (one extra fetch to `GET /worker/:id` or `GET /employer/:id`) for visual polish.
- A real **staff publish queue** in the Admin Reviews tab: paginated list of unpublished reviews with reviewer role, collaboration link, ratings preview, comment preview, and a `Publish` action. The bare-ID form is removed.
- The draft `web/src/pages/ReviewsPage.tsx` is **deleted**. The `/reviews` route is repurposed as a redirect to the user's most relevant surface (their `/collaborations` for logged-in users, `/login` for guests). All three `<pre>{JSON.stringify(...)}</pre>` blocks on that page disappear with it.
- Every API error surfaces through `parseApiError()`. No silent 403. No raw `error.message`.
- Mobile-first, design-system-only, light + dark, `lint:tokens` clean.

## Users

- **Worker** — leaves a review of an employer after a `COMPLETED` collaboration; reads published reviews about themselves on their public profile; reads published reviews about employers when browsing.
- **Employer** — leaves a review of a worker after a `COMPLETED` collaboration; reads published reviews about themselves on their public profile; reads published reviews about workers when browsing.
- **Public / unauthenticated visitor** — reads published reviews on `/workers/:id` and `/employers/:id` Reviews tabs and via the `/reviews/:id` permalink. Cannot leave a review.
- **Staff** — works the publish queue in the Admin Reviews tab; publishes reviews; sees draft reviews via the single-review permalink.
- **Profiles feature** (`tasks/done/profiles/`) — supplies `<StarRating>`, `<VerificationBadge>`, the avatar primitive, and the `WorkerProfile.rating_avg / rating_count` and `EmployerProfile.rating_avg / rating_count` columns rendered in the profile-page header. This feature does not invent a parallel rating component.
- **Auth feature** (`tasks/done/auth-flow/`) — supplies `Account.status === 'ACTIVE'` and `verification_state === 'ACTIVE'` (already enforced by the backend's `AccountStateGuard` + `RequiresVerifiedEmail` on `POST /reviews/collaboration/:collaborationId`, see `review.controller.ts:32-35`); supplies `parseApiError()` and `<ApiError>` patterns.
- **Collaborations feature** (`tasks/done/collaborations-polish/`) — supplies the `COLLAB-024` review-summary card on `/collaborations/:id` that this feature extends with the `Leave a review` CTA, and the `COMPLETED` lifecycle transition (`COLLAB-021`) that gates eligibility.

## Expected Outcome

- A worker who marked a collaboration `COMPLETED` lands on `/collaborations/:id`, sees a primary `Leave a review` button on the reviews summary card, opens the sheet, picks an overall rating + any sub-ratings + an optional comment, submits, and sees a `<Toast>` confirming the review will appear once staff publishes it. The sheet hides on submit; the summary card now reads `Worker review · Draft` and the `Leave a review` button disappears for that party.
- An employer does the same from their side — same surface, same component.
- A public visitor browsing `/workers/:id` clicks the `Reviews` tab and sees a real list of published employer-side reviews about that worker, with overall rating, sub-ratings, comment, project type, dates, and pagination. Same on `/employers/:id` with worker-side reviews about that employer.
- Anyone with a permalink (`/reviews/:id`) opens a self-contained review page — published reviews are public; drafts are visible only to the author and staff.
- A staff member opens the Admin Reviews tab, sees a paginated list of unpublished reviews newest-first, scans each row's ratings + comment + collaboration link, clicks `Publish`, and the row disappears from the queue. The auto-recalculation of `rating_avg / rating_count` already shipped in the backend (`review.service.ts:131-136`) fires as a side-effect.
- Zero `<pre>{JSON.stringify(...)}</pre>` rendering blocks remain on any reviews-related surface.
- The `tests-reviews/` counterpart opens the same week (per repo `CLAUDE.md` "Tests are not optional" rule) covering the page-level acceptance criteria.

## Constraints

- **One backend addition only:** a single staff-only `GET /reviews/unpublished?page&limit` endpoint to drive the publish queue (locked 2026-05-08 per spec Q1). No schema migration, no DTO changes to the existing 6 endpoints, no new fields on `Review`. The existing endpoints in `backend/src/review/review.controller.ts` are consumed as-is. The `CreateReviewDto` contract (`overall_rating` int 1-5 required, 5 optional sub-ratings same range, `comment` ≤ 5000 chars) is honoured by the client form.
- **No escrow coupling.** Eligibility for `Leave a review` is `Collaboration.status === 'COMPLETED'` — the same rule the backend's `review.service.ts:26` enforces. We deliberately do not introduce a "funded escrow required" gate; if escrow lands later and product wants that gate, it ships in the escrow feature folder, not here.
- **No edit / delete of reviews.** Once submitted, a review is staff-publish-or-don't. No author-side delete. No edit window. (Backend has no `PATCH` / `DELETE` review endpoint anyway — adding either is out of scope.)
- **No review reply / dispute thread.** A reviewee cannot reply to a review on this surface; a flagged-review workflow is staff-tools, not here. The existing `Flag dispute` on `/collaborations/:id` (`COLLAB-021`) is the only dispute primitive in MVP.
- **No notifications on publish.** No email, no push, no in-app notification when staff publishes a review. Add later if user feedback demands it; out of scope here.
- **No SEO / OG-tag work for `/reviews/:id`.** It's a private-or-public route under React Router; we do not pre-render or add per-review meta tags. Future feature.
- **No real-time updates.** Page-level refetch on focus and after a mutation is acceptable; WS push for new published reviews is not in scope.
- **Design-system rules from `web/CLAUDE.md` apply.** Semantic tokens only, shadcn primitives, light + dark, mobile-first, `lint:tokens` clean.
- **Sealed contracts to consume, not redefine:** `tasks/done/auth-flow/contract.md`, `tasks/done/profiles/contract.md`, `tasks/done/collaborations-polish/spec.md` (`COLLAB-024` summary card extended in this feature).
