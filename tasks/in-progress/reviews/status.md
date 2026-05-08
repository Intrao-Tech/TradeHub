# Status

- State: in-progress
- Owner: Igor (PM); implementing engineer TBA
- Created: 2026-05-08
- Started: 2026-05-08
- Last Updated: 2026-05-08 (implementation landed)
- Shipped: —

## Notes

### Implementation notes (2026-05-08)

- Backend: added `GET /reviews/unpublished` endpoint (REVIEW-046) — staff-only, paginated, newest-first, includes `collaboration`. No schema migration. Backend `npm run build` and `npm run lint` clean.
- Frontend new files: `web/src/components/reviews/{api.ts,LeaveReviewSheet.tsx,ReviewCard.tsx,ReviewsTab.tsx}`, `web/src/components/admin/ReviewsPublishQueueTab.tsx`, `web/src/pages/ReviewDetailPage.tsx`.
- Frontend changes: `web/src/App.tsx` (deleted nav item, deleted lazy import for ReviewsPage, added `/reviews` redirect, registered `/reviews/:id`); `web/src/pages/ReviewsPage.tsx` deleted; `web/src/pages/CollaborationDetailPage.tsx` (extended ReviewsSummaryCard with `Leave a review` CTA + verify-email fallback + `<LeaveReviewSheet>` mount); `web/src/pages/{WorkerDetailPage,EmployerDetailPage}.tsx` (Reviews tab → `<ReviewsTab>`); `web/src/pages/AdminPage.tsx` (Reviews tab → `<ReviewsPublishQueueTab>`, Tabs now controlled by `?tab=` so REVIEW-033 back-link to `/admin?tab=reviews` opens the right tab).
- Touched test: `src/pages/CollaborationDetailPage.test.tsx` TEST-COLLAB-115 — the two cases that asserted the previous "no reviews yet" sentinel and the absence of any write-review CTA were updated to match the new Reviews-extended shape (per REVIEW-010 the card now always shows two badge rows; the absence-of-CTA check was rewritten to assert `Leave a review` is hidden until `status === 'COMPLETED'` + participant + no existing review).
- Tests still green: `web` 285 passed / 7 skipped; `lint:tokens` clean; `vite build` clean; backend `npm run build` + `npm run lint` clean.
- Tests counterpart (`tasks/in-progress/reviews/tests-reviews/`) is unchanged and still owns the REVIEW-070 / REVIEW-071 acceptance set; that session is the next step.

### Scope context

- Scope locked 2026-05-08: this feature fully closes the Reviews loop end-to-end **without** an escrow dependency — eligibility is `Collaboration.status === 'COMPLETED'`, the same rule the backend already enforces (`backend/src/review/review.service.ts:26`). Escrow is being delivered separately and is explicitly not on this surface's critical path.
- The Reviews backend (`backend/src/review/{review.controller.ts,review.service.ts,dto/}`) is consumed as-is for the existing six endpoints. **One backend addition is in scope:** the staff-only `GET /reviews/unpublished` endpoint specified in `REVIEW-046` (resolves spec Q1, locked 2026-05-08); backend tests in `REVIEW-047`.
- The `<ReviewsSummaryCard>` on `/collaborations/:id` (`web/src/pages/CollaborationDetailPage.tsx:719-752`, delivered by `COLLAB-024`) is **extended** in this feature to add the `Leave a review` CTA — not rewritten. The card's existing Published/Draft/Not-submitted badges stay.
- `web/src/pages/ReviewsPage.tsx` is deleted; the `/reviews` route becomes a redirect; `/reviews/:id` is the new permalink page with a referrer-aware back-link (REVIEW-033) that handles `/admin`, `/workers/:id`, `/employers/:id`, and a generic fallback.
- `<LeaveReviewSheet>` autosaves drafts to `localStorage` and restores them across accidental closures (REVIEW-017).
- Tests counterpart: `tasks/product/tests-reviews/` (TBD; opens the same week implementation starts per `tasks/GUIDE.md` Working Principles + `CLAUDE.md` "Tests are not optional" rule). Acceptance set is REVIEW-070 / REVIEW-071.
- All six Open Questions resolved 2026-05-08; see Decisions Log at the bottom of `spec.md`. This folder is ready to move to `tasks/in-progress/reviews/` once an owner is assigned.

## Source inputs available to the implementing AI

- Backend (consumed as-is, no changes unless Q1 lands on option (b)): `backend/src/review/review.controller.ts`, `…/review.service.ts`, `…/dto/{create-review.dto.ts, review-query.dto.ts}`.
- Schema (no migration): `backend/prisma/schema.prisma:526-546` (`Review`), `:488-520` (`Collaboration` — `status === 'COMPLETED'` gate, embedded `reviews[]` relation).
- Frontend deleted: `web/src/pages/ReviewsPage.tsx`.
- Frontend extended: `web/src/pages/CollaborationDetailPage.tsx` (summary card + button), `web/src/pages/WorkerDetailPage.tsx` (Reviews tab), `web/src/pages/EmployerDetailPage.tsx` (Reviews tab), `web/src/pages/AdminPage.tsx` (Reviews tab — replaces bare-ID form with queue), `web/src/App.tsx` (routes + nav).
- New routes wired in `web/src/App.tsx`: `/reviews/:id` (`web/src/pages/ReviewDetailPage.tsx`); `/reviews` repurposed as a `<Navigate>` redirect.
- New components: `web/src/components/reviews/{LeaveReviewSheet.tsx, ReviewCard.tsx, api.ts}`.
- Sealed contracts consumed: `tasks/done/auth-flow/contract.md`, `tasks/done/profiles/contract.md`, `tasks/done/collaborations-polish/spec.md` (`COLLAB-021`, `COLLAB-024`).

## Move-to-in-progress checklist

Before this folder moves to `tasks/in-progress/`:

- [x] Q1 (publish-queue source) locked. Option (b) chosen; `brief.md` Constraints updated; `spec.md` requirements REVIEW-046 + REVIEW-047 added.
- [x] Q2 (counterparty chip avatar fetch) locked. Option (a) chosen; codified in REVIEW-030.
- [x] Q3–Q6 resolved or deferred in the Decisions Log (Q3 → REVIEW-017; Q4 → deferred; Q5 → REVIEW-033; Q6 → deferred).
- [x] `tasks/product/reviews/tests-reviews/` created with `brief.md` + `spec.md` + `coverage-matrix.md` + `status.md` covering REVIEW-070 / REVIEW-071. Note: the tests folder is **nested inside** the parent feature folder (matches the `tests-collaborations-polish/` precedent), not a sibling under `tasks/product/`.
- [ ] Owner field above filled with the implementing engineer.
