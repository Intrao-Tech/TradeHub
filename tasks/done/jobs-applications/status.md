# Status

- State: shipped (folder moved to tasks/done/ on 2026-05-05; contract.md sealed; all 10 slices shipped same day)
- Owner: Igor
- Created: 2026-05-05
- Last Updated: 2026-05-05
- Shipped: 2026-05-05

## Implementation summary (2026-05-05)

All 10 slices from contract.md §12 landed in one session:

- **A** — `<Toaster />` mounted; `JobDetailPage` at `/jobs/:id`; legacy `<pre>{JSON.stringify}</pre>` blocks removed across `JobBoardPage` and `MyApplicationsPage`.
- **B** — `<ChipMultiSelect>` (no cmdk dep — built on native combobox + ARIA), `useSpecialisations()`, `useTags()`.
- **C** — `<JobPostForm>` shared between create / edit, with structured validation + `parseApiError()` mapping; comma-separated id text inputs deleted.
- **D** — `<ApplyJobSheet>`, role-aware CTA bar with sticky-bottom mobile, structured error mapping for `ALREADY_APPLIED` / `JOB_CLOSED` / `EMAIL_NOT_VERIFIED` (with substring-fallback while BE-JOBS-2/3 were in flight — now no longer needed since Slice J landed in the same session).
- **E** — `MyJobsPage` at `/my-jobs` with status tabs, row dropdown actions (View applicants · Edit · Close · Reopen · Delete), confirm dialogs, employer-only gating + add to private nav.
- **F** — `MyJobApplicantsPage` at `/my-jobs/:id/applicants` with applicant cards (avatar / name / verification badge / star rating / cover-message expand), optimistic lifecycle actions, `<InviteWorkerSheet>` (id paste).
- **G** — `MyApplicationsPage` rewritten worker-only with status tabs, withdraw + ConfirmDialog, "Invitations" pinned section.
- **H** — Legacy employer-side sections deleted as part of Slice G's full rewrite.
- **I** — `EditJobPage` at `/my-jobs/:id/edit` reusing `<JobPostForm mode="edit">` with soft-freeze on `pay_type` / `day_rate_min` / `day_rate_max` / `fixed_price` / `postcode_area` / `specialisation_ids` when `_count.applications > 0`; ownership-redirect courtesy.
- **J** — `JobApplicationService.apply()`: `BadRequestException` for "not OPEN" → `400 { code: 'JOB_CLOSED' }`; "already applied" → `409 { code: 'ALREADY_APPLIED' }`. `BE-JOBS-1` was already shipped via existing `_count: { applications }` Prisma include.

Pre-flight: `web/scripts/lint-tokens.mjs` clean, `vite build` clean (no TS errors), no `<pre>{JSON.stringify(...)}</pre>` rendering blocks anywhere in the Jobs surface, no comma-separated-id text inputs anywhere in the Jobs surface. Backend lint untouched (pre-existing 324 errors in unrelated files; no new errors from this diff).

## Notes

- Created on 2026-05-05 once Profiles (`tasks/in-progress/profiles/`) and Auth (`tasks/done/auth-flow/`) shipped, and once the Verification carve-out (`tasks/product/verification/`) was confirmed as the boundary that owns the trust-tier signals this feature consumes.
- Backend surface for the entire feature is **already in production** — `backend/src/job-post/`, `backend/src/job-application/`, `backend/src/specialisation/`, `backend/src/tag/`, `prisma/schema.prisma:671–748`. The work in this feature is mostly frontend; the only backend "Should" asks are aggregate `applications_count` on `GET /job-posts/me` (BE-JOBS-1) and structured error codes on the apply path (BE-JOBS-2 / BE-JOBS-3). No schema migration in MVP.
- Sibling test feature `tests-jobs-applications/` will open the same week implementation starts, per repo `CLAUDE.md` "Tests are not optional" rule.

## Source inputs available to the implementing AI

- Backend: `backend/src/job-post/job-post.controller.ts`, `…/job-post.service.ts`, `…/dto/`; `backend/src/job-application/job-application.controller.ts`, `…/job-application.service.ts`, `…/dto/`; `backend/src/specialisation/specialisation.controller.ts`; `backend/src/tag/tag.controller.ts`.
- Schema: `backend/prisma/schema.prisma` lines 671–748 (`JobPost`, `JobApplication`, `JobPostSpecialisation`, `JobPostTag`); plus `Specialisation`, `Tag`.
- Frontend (to be replaced): `web/src/pages/JobBoardPage.tsx`, `web/src/pages/MyApplicationsPage.tsx`.
- Adjacent specs (sealed): `tasks/done/auth-flow/{spec,contract,notes,status}.md`, `tasks/in-progress/profiles/{brief,spec,notes,contract,status,followups}.md`.
- Adjacent specs (in flight): `tasks/product/verification/{brief,status}.md` for the trust-tier signals this feature renders.
- Product doc: `docs/TradeHub_UK_Technical_Specification_v2.docx` §3 (roles), §6.3 (search filters), §10 (admin).
- Research: `notes.md` (this folder) — codebase snapshot, surf MCP findings on UK-construction analogues + B2B freelancer marketplaces + multi-select UX.
