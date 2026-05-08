# Status

- State: product
- Owner: TBA (sibling of `tasks/product/reviews/`; same engineer)
- Created: 2026-05-08
- Started: —
- Last Updated: 2026-05-08
- Shipped: —

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
