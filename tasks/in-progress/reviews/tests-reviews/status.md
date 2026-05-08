# Status

- State: in-progress
- Owner: TBA (sibling of `tasks/product/reviews/`; same engineer)
- Created: 2026-05-08
- Started: 2026-05-08
- Last Updated: 2026-05-08
- Shipped: —

## Implementation summary (2026-05-08)

- **Backend unit (TEST-REVIEW-010..020)** landed in `backend/src/review/review.service.spec.ts` (10 describe blocks, 53 tests) + `backend/src/review/dto/create-review.dto.spec.ts` (5 tests for the @MaxLength + 1..5 bounds). Deep-mocked Prisma; no Postgres touched. `cd backend && npx jest src/review/` → 53 / 53 green.
- **Backend e2e (TEST-REVIEW-070..077)** landed in `backend/test/review.e2e-spec.ts` (8 describe blocks, 48 tests) against the existing `test-app.ts` Postgres Testcontainer. Adds `seedReview` to `backend/test/util/factories.ts` (mirrors `recalculateRatings` so seeded published rows have correct rating aggregates). `cd backend && npm run test:e2e -- --testPathPatterns review.e2e` → 48 / 48 green.
- **Frontend unit (TEST-REVIEW-100..172)** landed across:
  - `web/src/components/reviews/ReviewCard.test.tsx` (14 tests)
  - `web/src/components/reviews/LeaveReviewSheet.test.tsx` (20 tests)
  - `web/src/components/reviews/ReviewsTab.test.tsx` (7 tests)
  - `web/src/components/admin/ReviewsPublishQueueTab.test.tsx` (6 tests)
  - `web/src/pages/ReviewDetailPage.test.tsx` (13 tests)
  - `web/src/pages/CollaborationDetailPage.test.tsx` (extended with TEST-REVIEW-120..122; 14 new tests)
  - `web/src/__tests__/reviews-routes.test.tsx` (5 tests, TEST-REVIEW-170..172)
  - Adds `mockReview`, `mockReviewDraft`, `mockReviewListResponse`, `MockReviewCollaboration` to `web/src/test/factories.ts`; `web/src/test/handlers/reviews.ts` (MSW v2 for all 7 review endpoints) wired into `web/src/test/handlers.ts`.
  - `cd web && npm test` → 370 / 370 green (7 pre-existing skipped).
- **Playwright e2e (TEST-REVIEW-200..207)** landed in `web/e2e/reviews.scenarios.spec.ts`. Three active scenarios:
  - TEST-REVIEW-200 (worker leave-review happy path)
  - TEST-REVIEW-205 (permalink visibility: published vs draft)
  - TEST-REVIEW-206 (privilege wall on `GET /reviews/unpublished`)
  Five `.fixme` blocks with inline unblock notes:
  - TEST-REVIEW-201 (employer mirror of 200; no harness gap, just copy + swap)
  - TEST-REVIEW-202 (worker reviews tab → permalink → back-link; needs deterministic worker_id → URL mapping in the public worker-search UI)
  - TEST-REVIEW-203 (staff publish; needs `loginAsStaffViaApi` helper to bypass staff-host login redirect)
  - TEST-REVIEW-204 (autosave across sheet close; needs a deterministic sheet-X selector)
  - TEST-REVIEW-207 (mobile 375 px; needs a 375 px Playwright project)
  Adds `seedReviewViaApi` to `web/e2e/util.ts` and a backing `POST /test/seed/review` endpoint in `backend/src/test-only/test-seed.controller.ts` (gated by `NODE_ENV === 'test'`, mirrors the production `recalculateRatings` for `isPublished: true`).
  `cd web && npx playwright test reviews.scenarios --project=chromium` → 3 passed, 5 skipped (`.fixme`), 0 failed.
- **Guardrails (TEST-REVIEW-220..223)** landed in `web/src/__tests__/reviews-guardrails.test.tsx` (8 tests). Asserts no `<pre>{JSON.stringify(...)}</pre>` debug panes on the Reviews surface, the deleted `ReviewsPage.tsx`, the `lint:tokens` script being wired, and `App.tsx` having no resurrected ReviewsPage import or `/reviews` nav entry.
- **No followups filed.** No production bugs were surfaced by the suite during implementation. `tasks/in-progress/reviews/followups.md` was therefore not created.

## Notes

- Sibling test feature for `tasks/product/reviews/`. Opens at the same time as the parent feature per `tasks/GUIDE.md` Working Principles + project `CLAUDE.md` "Tests are not optional" rule. Moves to `tasks/in-progress/reviews/tests-reviews/` alongside its parent and ships in the same `done/` move.
- Closes a real coverage gap in addition to locking the new behaviour: `backend/src/review/` has zero existing test files (no `review.service.spec.ts`, no `review.e2e-spec.ts`). The six already-shipped endpoints get their first regression guard in this feature, plus the new `GET /reviews/unpublished` endpoint (REVIEW-046) gets full unit + e2e + Playwright privilege-wall coverage from day one.
- No new test stack. Reuses Vitest + RTL + MSW v2 (frontend), Jest + `jest-mock-extended` (backend unit), Testcontainers + Supertest (backend e2e), Playwright (frontend e2e), and the factories / handlers / seed helpers established by `tests-auth-flow`, `tests-profiles`, `tests-jobs-applications`, and `tests-collaborations-polish`.
- The four documents in this folder are: `brief.md` (why), `spec.md` (the `TEST-REVIEW-NNN` requirements), `coverage-matrix.md` (every parent `REVIEW-NNN` and Edge Case → ≥ 1 test), and this `status.md`.

## Source inputs available to the implementing AI

- Parent spec: `tasks/product/reviews/spec.md` — 25+ `REVIEW-NNN` requirements + 13 Edge Cases + 9 acceptance criteria.
- Backend code under test (no `*.spec.ts` exists today): `backend/src/review/{review.controller.ts, review.service.ts, dto/}`.
- New backend code added by the parent feature: `GET /reviews/unpublished` per `REVIEW-046`; service method `getUnpublished()`.
- Frontend code under test (some new, some extended): `web/src/components/reviews/{LeaveReviewSheet.tsx, ReviewCard.tsx, api.ts}`, `web/src/pages/ReviewDetailPage.tsx` (new), `web/src/pages/CollaborationDetailPage.tsx:719-752` (`<ReviewsSummaryCard>` extension), `web/src/pages/{Worker,Employer}DetailPage.tsx` (Reviews tab body), `web/src/pages/AdminPage.tsx` (Reviews tab body), `web/src/App.tsx` (route registration).
- Schema (no migration): `backend/prisma/schema.prisma:526-546` (`Review`).
- Sealed contracts consumed: `tasks/done/auth-flow/contract.md` (verified-email gate, `parseApiError`), `tasks/done/profiles/contract.md` (`<StarRating>`, `<VerificationBadge>`, avatar primitive, `rating_avg / rating_count` columns), `tasks/done/collaborations-polish/spec.md` (`COLLAB-021`, `COLLAB-024`).

## Move-to-in-progress checklist

This folder moves to `tasks/in-progress/reviews/tests-reviews/` alongside the parent feature. Before that move:

- [x] Parent spec (`tasks/product/reviews/spec.md`) has all six Open Questions resolved and a Decisions Log.
- [x] `coverage-matrix.md` lists every parent `REVIEW-NNN` and Edge Case with ≥ 1 `TEST-REVIEW-NNN`.
- [ ] Owner field above filled with the implementing engineer.
- [ ] `tasks/done/tests-collaborations-polish/coverage-matrix.md` reviewed once for any test-pattern updates this feature should mirror (drift / fixme conventions).
