# Status

- State: product (brief + spec + notes drafted; contract.md to be sealed at the start of implementation)
- Owner: TBD (likely Igor, continuing from Profiles)
- Created: 2026-05-05
- Last Updated: 2026-05-05
- Shipped:

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
