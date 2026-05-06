# Status

- State: done
- Owner: Igor
- Created: 2026-05-06
- Started: 2026-05-06
- Last Updated: 2026-05-06
- Shipped: 2026-05-06

## Notes

- Shipped 2026-05-06 alongside the parent `collaborations-polish` feature; locks the COLLAB-NNN surface (parent spec) and the existing-but-untested `backend/src/collaboration/` module behind 45 backend unit asserts (`collaboration.service.spec.ts` + `collaboration.controller.spec.ts`), 23 backend e2e asserts (`collaboration.e2e-spec.ts`, 0 skipped), 59 frontend unit asserts across 5 files, and 5 live + 8 fixme'd Playwright asserts across 3 files.
- Sits nested inside the parent feature folder (`tasks/done/collaborations-polish/tests-collaborations-polish/`), matching the pattern of `tasks/done/jobs-applications/tests-jobs-applications/`.
- Backend coverage in this feature is **net-new** for the collaboration module — `backend/src/collaboration/collaboration.service.spec.ts` and `backend/test/collaboration.e2e-spec.ts` did not exist before this PR.
- Tooling reuse only: extends `backend/test/util/factories.ts` (`seedCollaboration`, `seedEscrowTransaction`), `web/src/test/factories.ts` (`mockCollaboration`, `mockEscrowTransaction` + per-status helpers), and adds `web/src/test/handlers/{collaborations,escrow}.ts`. The Vitest setup gained jsdom polyfills for `Element.prototype.{hasPointerCapture,setPointerCapture,releasePointerCapture,scrollIntoView}` so RTL can drive Radix Select / Dialog (TEST-COLLAB-140 was the first test in the repo to exercise this path).
- Decisions Q1–Q4 resolved at the bottom of `spec.md` on 2026-05-06.
- Coverage matrix (TEST-COLLAB-232) at `coverage-matrix.md`. Followups (TEST-COLLAB-230) at `tasks/done/collaborations-polish/followups.md` — [COLLAB-073-001] (missing `AccountStateGuard` on `PATCH /collaborations/:id/status` and `POST /collaborations/:id/flag`) closed 2026-05-06 in the same slice; the associated assertion is now live and a sibling assertion covers the flag endpoint.

## Source inputs available to the implementing AI

- Parent feature spec: `tasks/done/collaborations-polish/spec.md` (the `COLLAB-NNN` requirement set this suite locks down).
- Backend production code (consumed, not modified): `backend/src/collaboration/{collaboration.controller.ts, collaboration.service.ts, dto/}`, `backend/prisma/schema.prisma:487-518` (`Collaboration`), `:550-573` (`EscrowTransaction` — read-only consumption only).
- Frontend production code (locked, not modified): `web/src/pages/{CollaborationsPage,CollaborationDetailPage,EscrowPlaceholderPage}.tsx`, `web/src/components/collaborations/{NewCollaborationSheet,FlagCollaborationDialog,CollaborationStatusBadge,CounterpartyChip,api}.tsx|.ts`.
- Sibling test specs (tooling reuse): `tasks/done/auth-flow/tests-auth-flow/`, `tasks/done/profiles/tests-profiles/`, `tasks/done/jobs-applications/tests-jobs-applications/`.
- Sealed contracts: `tasks/done/auth-flow/contract.md`, `tasks/done/profiles/contract.md`, `tasks/done/jobs-applications/contract.md`.
