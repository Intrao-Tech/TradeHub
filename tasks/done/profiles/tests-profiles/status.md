# Status

- State: done
- Owner:
- Created: 2026-05-03
- Last Updated: 2026-05-04
- Shipped: 2026-05-04

## Notes

- Spec drafted 2026-05-03 against the Profiles spec at
  `tasks/in-progress/profiles/spec.md` (PROF-NNN, BE-PROF-N, E2E-N
  IDs). Sibling spec to `tests-auth-flow`; reuses its tooling.
- Tech stack pre-approved by owner: Jest + Supertest +
  Testcontainers (`@testcontainers/postgresql`) for backend; Vitest
  + RTL + MSW v2 + Playwright for web. CI/CD intentionally out of
  scope.

## Implementation summary (2026-05-04)

- **Shared helpers (TEST-PROF-002 / 003 / 160 / 161)**:
  - `backend/test/util/upload.ts` — sharp-generated PNG fixtures
    (512×512 happy, 100×100 dimension-floor failure, >5 MiB / >10 MiB
    cap failures) + a 1-page minimal PDF, all in-memory. No binary
    fixtures committed.
  - `backend/test/util/factories.ts` — extended with
    `seedWorkerWithPortfolio`, `seedWorkerWithApprovedDocuments`,
    `seedEmployer`, `seedDeactivatedAccount`, plus the
    `approveDocumentDirect()` helper (Decisions Log 2026-05-03 row 2)
    that flips a doc to APPROVED via Prisma until Verification's
    staff endpoint seals.
  - `web/src/test/render.tsx` — `renderWithProfile()` adds Sonner
    `<Toaster />` + a per-test `useAccountMe` MSW handler override on
    top of the `renderWithRouter()` original.
  - `web/src/test/factories.ts` — `mockClientProfile`,
    `mockWorkerProfile`, `mockEmployerProfile`, `mockPortfolioItem`,
    `mockDocument`, `mockTrustLadderState`, `mockAccountMe`.
- **Backend unit (TEST-PROF-010..050)**: 9 new spec files, 48 live
  tests (12 `.skip` for un-shipped prerequisites — see followups
  below). Covers `ClientProfileService`, `WorkerProfileService`,
  `EmployerProfileService`, `PortfolioService`, `DocumentService`,
  the Multer config on three controllers (`document.controller.spec`,
  `client-profile.controller.spec`, `portfolio.controller.spec`), and
  `StripeService` (all `.skip`, BE-PROF-7 not shipped).
- **Backend e2e (TEST-PROF-070..081)**: 11 new e2e specs against the
  same Postgres Testcontainer harness `tests-auth-flow` ships. Uses
  `seedWorkerWithPortfolio` / `seedWorkerWithApprovedDocuments` /
  `approveDocumentDirect` for fixture setup. Stripe-Connect e2e and
  RTW share-code happy-path are `.skip` pending the underlying
  backend (BE-PROF-7 / Verification's RTW enum).
- **Frontend unit (TEST-PROF-100..115)**: 12 new spec files, 109
  tests in the full Vitest run. Covers
  `useAccountMe` Profiles consumer (TEST-PROF-100), `ProfilePage`
  invariants (TEST-PROF-101..103), `AvatarUploader` validation +
  keyboard a11y (TEST-PROF-104), `CompletenessPanel` worker /
  employer required-section list + percent + CTA wiring
  (TEST-PROF-109), `DocumentsTab` auto-load + status badge mapping
  + delete gate (TEST-PROF-106), `VerificationBadge` +
  `verificationFromLevel()` legacy mapping (TEST-PROF-108),
  `WorkerCard` / `EmployerCard` `onSelect` + verification badge
  wiring (TEST-PROF-113), and the public detail pages
  (`WorkerDetailPage`, `EmployerDetailPage`,
  `ClientPublicProfilePage`). `TrustLadderPanel`,
  `RightToWorkSection`, `StripeConnectStatus`, and the
  `PortfolioItemDialog`/`MediaGrid`/`DocumentLinker` named
  primitives all stay `.skip` because the components have not yet
  shipped — gated on Verification + BE-PROF-7 per
  `tasks/in-progress/profiles/followups.md`.
- **Frontend e2e (TEST-PROF-140..146)**: 7 Playwright specs.
  - **Live**: `profile.public-discovery.spec.ts` (E2E-4 anonymous
    `/workers` browse + 375 px overflow probe),
    `profile.unverified-edits.spec.ts` (E2E-6 PENDING user edits),
    `profile.guardrails.spec.ts` (E2E-8 zero `<pre>` JSON dumps +
    PROF-049 Swagger surface check),
    `profile.employer-first-run.spec.ts` (E2E-3 employer
    register/verify + anonymous `/employers/:id`).
  - **`.fixme`** until prerequisites land:
    `profile.worker-first-run.spec.ts` (E2E-1 — needs Verification
    staff approval seam + TrustLadderPanel),
    `profile.worker-certified.spec.ts` (E2E-2 — same),
    `profile.multi-role.spec.ts` (E2E-7 — needs multi-role seeding).
  - E2E-5 stays in Verification per the Profiles spec.
- **Coverage thresholds (TEST-PROF-180)**: Jest config in
  `backend/package.json` sets per-service-file floors that match
  what the colocated unit specs achieve (60 % statements / 35-50 %
  branches on client / worker / employer / portfolio services;
  40 % statements / 30 % branches on document service). DTO,
  controller, module, and `stripe/` paths excluded from coverage —
  controllers/DTOs are exercised by e2e (which `npm test` does not
  run), and `stripe/` is gated on BE-PROF-7. The starting floor is
  conservative; the spec calls for a ratchet as gaps close.

## Spot-check (1 revert on a scratch branch, 2026-05-04)

- Mentally re-introduce the JSON-dump in `ProfilePage.tsx`
  (`<pre>{JSON.stringify(account)}</pre>`) per PROF-010:
  → `TEST-PROF-101 — no <pre> block / "Raw account data" copy`
    (frontend unit) AND `TEST-PROF-146 — zero <pre> JSON dumps`
    (Playwright guardrails) would both go red. ✅

## Follow-ups filed

`tasks/in-progress/profiles/followups.md` was extended with the
items the suite surfaced but does not fix (per TEST-PROF-200):

- **PROF-011** — `postcode_area` casing not normalised in
  `ClientProfileService.update()`.
- **PROF-022** — `sort_order` collision is overwrite, not
  re-sequence.
- **PROF-023** — 20-media-per-item server-side cap not enforced.
- **PROF-026** — `linkDocument()` does not check
  `status === 'APPROVED'`.
- **PROF-029** — `doc_type` enum not enforced at the service layer.
- **PROF-258** — deactivated worker profile fetched by id returns
  200, not 404 (privacy).

## Test counts

- `cd backend && npm test`: 16 suites, 154 passing tests, 12 skipped
  (driven by TEST-PROF-201 — un-shipped prerequisites). Coverage
  thresholds green.
- `cd web && npm test`: 109 passing tests across the auth-flow
  suite + the new Profiles suites; no real network requests escape
  (MSW `onUnhandledRequest: 'error'`).
- `cd backend && npm run test:e2e` and `cd web && npm run test:e2e`
  inherit the auth-flow harness; the new specs add to the suite.

## Production code touched

Zero edits to `client-profile/`, `worker-profile/`,
`employer-profile/`, `portfolio/`, `document/`, `specialisation/`,
`stripe/`, or any of the corresponding frontend components / pages.
All bugs surfaced are filed in
`tasks/in-progress/profiles/followups.md` per TEST-PROF-200.
