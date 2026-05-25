# Status

- State: shipped
- Owner: Artem (carved out from Profiles on 2026-05-03)
- Created: 2026-05-03
- Last Updated: 2026-05-05
- Shipped: 2026-05-05

## Notes

- Created as a sibling feature folder when the manual staff document approval flow was carved out of Profiles. See `tasks/done/profiles/spec.md` Decisions Log entry "Verification carved out as a sibling feature" for the boundary rationale.
- **2026-05-03**: Profiles owner-side surface shipped (`tasks/done/profiles/`). Profiles' user-side `DocumentsTab` consumes `Document.status` today and renders `Document.rejection_reason` against an optional passthrough field; Verification publishes that column so rejection text appears. Trust-ladder panel (PROF-032 / 033 / 034) and Right-to-Work submission (PROF-052) were held until Verification's contract sealed — see `tasks/done/profiles/followups.md` §1 and §2 for what Profiles consumed.
- Profiles (`tasks/done/profiles/`) consumes this feature's contract — see Profiles `spec.md` "Sealed Verification dependencies" subsection at the top of Requirements for the consumed surface. Coordinate any contract changes with the Profiles owner before changing field names that landed in production.
- **2026-05-05** — Folder moved `product/` → `in-progress/`. All 8 Open Questions from `brief.md` resolved; spec / notes / contract drafted (see Decisions Log in `spec.md`). Headline architectural decisions: (a) Stripe Identity is the **only** path to the Basic rung (automatic on webhook); (b) manual document review by staff drives Certified; (c) Premium ladder rung renders but is not computable until Reviews ships; (d) Right-to-Work shipped IN with `RIGHT_TO_WORK_SHARE_CODE` + `RIGHT_TO_WORK_DOCUMENT` doc-types and structured share-code metadata; (e) HMRC CIS shipped IN as a structured-only credential (UTR + NI in metadata, no file); (f) `verification_level` enum REPLACED (`IDENTITY_VERIFIED` → `BASIC`); (g) `PATCH /documents/:id/status` REMOVED in favour of `POST /verification/documents/:id/review` as the single canonical staff decision endpoint.
- **2026-05-05** — Folder moved `in-progress/` → `done/`. Implementation pushed on branch `feature/identity-and-doc-verif`. Shipped surface includes:
  - Backend: trust-ladder model + promotion engine, Stripe Identity integration with verified/failed email notifications, Companies House public-API employer check, manual document review queue with workload-balanced auto-assignment + on-duty toggle, public `/verification/levels/:id` exposing milestone flags + review aggregates, `OTHER` doc-type with required `metadata.title` (3–100 chars), audit events for every state transition.
  - Frontend: `<VerificationBadge>` (new `unverified | basic | certified | premium` vocab), `<MilestonesStrip>` rendering per-milestone chips on every public profile + own profile + conversation rows, AdminPage Verification queue tab with claim / approve / reject / admin-override controls, Identity verification card with retry flow.
  - Data: 2 schema migrations (`add_verification_review_assignment`, `rename_verification_level_vocab`), seed updated to new vocab + on-duty admin.
- **Followups (not blockers)**: (1) extract duplicate `PublicLevelResponse` type literal from `ProfileHeader.tsx` + `ProfilePage.tsx` into a shared `web/src/types/verification.ts`. (2) `<VerificationBadge state="premium" />` should render a "Coming soon" tooltip until Reviews ships (VER-091, currently no tooltip). (3) Premium tier gating — promotion engine has the predicate slot returning `false` always; flip to real predicate once Reviews ships and the `≥5 verified reviews` count is queryable.
- **Test counterpart required**: per `tasks/GUIDE.md` working principles, every shipped feature must have a `tests-<feature>/` companion in `tasks/done/`. Open `tests-verification` brief same week — coverage targets in priority order: (a) promotion-engine truth tables (every level transition path), (b) document-review state machine + assignee gating, (c) workload-balanced assignment algorithm + race-free claim, (d) Stripe Identity webhook idempotency, (e) Companies House mismatch / not-found / upstream-error paths, (f) public `/verification/levels/:id` flag projection.

## Source inputs used during drafting

- Product doc: `docs/TradeHub_UK_Technical_Specification_v2.docx` (§3.1, §3.2, §10, Appendix B)
- Existing backend code: `backend/src/document/`, `backend/src/verification/`, `backend/prisma/schema.prisma` (ClientProfile, Document, VerificationMilestone)
- Existing frontend: `web/src/pages/AdminPage.tsx` (staff side, Documents tab around `:624`), `web/src/components/VerificationBadge.tsx` (legacy vocabulary)
- Adjacent specs (both shipped): `tasks/done/auth-flow/{spec,contract,notes,status}.md`, `tasks/done/profiles/{brief,spec,notes,contract,status,followups}.md`
- Backlog inventory: `tasks/in-progress/research.md` §11 (Documents), §12 (Staff/Admin)
