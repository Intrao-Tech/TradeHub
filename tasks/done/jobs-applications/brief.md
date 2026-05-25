# Brief

## Feature

Production-ready **Jobs & Applications** surface for TradeHub MVP — the marketplace layer that sits on top of Profiles and Verification: an employer posts a job, verified workers see and apply to it, the employer reviews applicants, and an accepted application becomes a collaboration.

## Problem

The backend already ships a complete jobs-and-applications surface (job-post CRUD, applications lifecycle, tags, specialisations, employer-side invite, worker-side withdraw, employer-side accept / reject / convert-to-collaboration). The frontend does not exercise it as a real product:

- There is **no edit UI** for `PATCH /job-posts/:id` and **no delete UI** for `DELETE /job-posts/:id` even though the backend exposes both with ownership checks (`backend/src/job-post/job-post.controller.ts:81`, `:96`).
- `GET /job-posts/me` is wired only as a debug list inside `MyApplicationsPage` (`web/src/pages/MyApplicationsPage.tsx:79`); employers have no proper "My job posts" dashboard.
- The "Post a job" sheet asks the user to type **comma-separated specialisation IDs** and **comma-separated tag IDs** into text inputs (`web/src/pages/JobBoardPage.tsx:310`, `:319`) — even though `GET /specialisations` and `GET /tags` are public list endpoints (`backend/src/specialisation/specialisation.controller.ts:31`, `backend/src/tag/tag.controller.ts:24`).
- The Apply button on the job-detail dialog (`web/src/pages/JobBoardPage.tsx:495`) is shown to every signed-in account regardless of role; backend rejects with `403 Forbidden` because `RolesGuard('WORKER')` fires (`backend/src/job-application/job-application.controller.ts:35`). Result: silent failure on the surface where the platform's primary action lives.
- `JobBoardPage` renders `<pre>{JSON.stringify(...)}</pre>` for both the per-action response (`:339`, `:519`) and the job-detail dialog body (`:478`).
- `MyApplicationsPage` renders three raw JSON dumps for the three core lists — worker applications (`:243`), employer posts (`:307`), applications-by-post (`:409`) — and exposes none of the lifecycle actions (Review / Shortlist / Accept / Reject) in a way a non-engineer can use.
- There are no status filters, no group-by-status tabs, and no empty states. A user with five posts and twenty applications cannot find anything.

The acceptance criterion stack from `tasks/done/auth-flow/spec.md` §1 ("trust-sensitive actions = posting jobs, applying to jobs, …") and Profiles' first-run flow (`tasks/done/profiles/spec.md` user flow ending on a credible profile) both terminate on this feature. Without it, a verified worker has nowhere to spend the trust they just built, and an employer has no reason to come back after their first post.

## Goal

Make Jobs & Applications a usable product end-to-end:

- A real employer dashboard at `/my-jobs` (or equivalent) listing the employer's posts with status, application counts, and inline edit / pause / close / reopen / delete actions wired to the existing backend endpoints.
- A real "Post a job" form with **searchable chip-multiselect** for specialisations and tags, sourced from `GET /specialisations` and `GET /tags`.
- A real job-detail page (not just a dialog) with a role-aware primary CTA: workers see "Apply", employers see "Edit / Close" on their own posts, anonymous viewers see "Sign in to apply".
- A real applications dashboard for workers (`/my-applications` retained, redesigned) with status tabs, filters, withdraw, and re-apply rules.
- A real per-post applicants view for employers with status tabs, applicant cards (avatar, name, verification badge, rate, cover message), and lifecycle action buttons.
- Zero `<pre>{JSON.stringify(...)}</pre>` blocks remaining anywhere in the Jobs surface.
- All actions surface structured `ApiError` codes through `parseApiError()` (Auth contract §10) — no silent 403s.

## Users

- **Employer** (primary on the post + manage side) — posts jobs, reviews applicants, accepts / rejects, converts to collaboration.
- **Worker** (primary on the discover + apply side) — browses, filters, applies, tracks own applications, withdraws.
- **Public visitor** — browses jobs without authentication; auth-gated CTA to apply.
- **Profiles feature** (`tasks/done/profiles/`) — provides the avatar / display name / verification badge / rate that this surface renders for both sides.
- **Verification feature** (`tasks/product/verification/`) — provides the `verification_state` and document-level signals that gate Apply / Post (per Auth `AccountStateGuard`).
- **Auth feature** (`tasks/done/auth-flow/`) — provides the `is_worker` / `is_employer` flags this surface uses to decide which CTAs to render.

## Expected Outcome

A new employer can sign up (Auth) → complete their profile (Profiles) → verify email (Auth) → post a job in two minutes from a real form, see the post on `/jobs`, watch applications come in on `/my-jobs/:id/applicants`, shortlist three, accept one, and convert it to a collaboration — without ever opening Swagger.

A new verified worker can sign up → finish their profile → browse `/jobs`, filter by specialisation (chip-select), open a job, hit Apply with a cover message and proposed rate, see the application on `/my-applications` with a status badge, watch it move to Shortlisted → Accepted, and withdraw if their plans change.

A public visitor can browse jobs (no auth) and is funnelled cleanly into signup with a `next` parameter that returns them to the same job after verification.

## Constraints

- **Backend already exists.** This feature is mostly frontend; new backend work should be limited to surface-level helpers (a `GET /job-posts/:id/applications/summary` aggregate, status-by-status counters) and a Pause / Reopen state transition if those decisions land in scope. Do not redesign the schema.
- **Sealed Auth contract** (`tasks/done/auth-flow/contract.md`). Use `AccountStateGuard` semantics (`PENDING_EMAIL_VERIFICATION` blocks Apply / Post but **not** browse). Use `<AuthBanner kind="EMAIL_NOT_VERIFIED">` for the unverified-on-job-detail state. Use `ApiError` / `parseApiError()` for every fetch.
- **Sealed Profiles contract** (`tasks/done/profiles/contract.md`). Render avatars / display names / verification badges through the same components Profiles ships (`<VerificationBadge>`, `<StarRating>`). Do not invent parallel ones.
- **Verification dependency** (`tasks/product/verification/`). The vocabulary on the badges Jobs renders is owned by Verification — Jobs consumes whatever ships. Do not gate Apply / Post on a specific tier (`Basic` / `Certified`) until Verification's contract is sealed; for MVP, gate on `verification_state === 'ACTIVE'` (Auth) only and surface tier as a non-blocking trust signal.
- **Greater London soft launch.** Postcode picker must reuse the London-borough preset list from Profiles (`PROF-015`); do not invent a UK-wide picker.
- **Mobile-first, design-system-only.** `web/scripts/lint-tokens.mjs` must pass; all new components live under `web/src/components/ui/` or compose them. No raw hex, no default Tailwind palette.
- **Tests are not optional.** This feature ships alongside `tests-jobs-applications/` covering Apply lifecycle, ownership checks on edit / delete, and the multi-select form path (per repo `CLAUDE.md` "Tests are not optional").

## Out of scope (for the first cut)

- **Tag CRUD admin UI** (called out in research §5 of the original backlog) — staff-side tag management is its own feature folder. Jobs consumes `GET /tags` read-only; if a tag is missing, staff seeds it via SQL or the future admin UI.
- **Saved searches / saved filters** — Pro-tier feature on every analogue we reviewed (Upwork, Indeed); defer.
- **Collaboration UI surface** (`POST /job-applications/:id/to-collaboration` returns a collaboration; rendering the collaboration is a separate feature folder).
- **Conversation / messaging UI between employer and applicant** — already scaffolded by the invite flow (`backend/src/job-application/job-application.service.ts:94`); rendering belongs to a sibling Inbox feature.
- **Reviews on completed collaborations** — separate feature.
- **Lead-buying / connects / pay-to-apply monetisation** — research found this is the worst UX pattern on UK construction analogues (see notes.md); MVP applies are free, monetisation is Phase 2.
- **Algorithmic ranking ("best match")** — Upwork's pattern is unloved on r/Upwork; MVP sorts by `created_at desc` only.
- **Job-post pause / reopen state machine** — the schema has `OPEN | CLOSED | FILLED | CANCELLED`; `PAUSED` would be a new state. Decide in spec Open Questions, default to **out of scope** unless added.

## Boundary with Profiles, Verification, and Auth

| This feature owns | Adjacent feature owns |
|---|---|
| `/jobs` board UI, filters, role-gated apply CTA | `<VerificationBadge>` / `<StarRating>` / avatar primitives (Profiles) |
| `/jobs/:id` job detail page (replaces the current dialog) | `useAccountMe()` hook (Profiles, `PROF-051`) |
| `/my-jobs` employer dashboard with edit / close / delete | `<AuthBanner>` for unverified state (Auth) |
| `/my-jobs/:id/applicants` per-post applicants view with lifecycle actions | `AccountStateGuard` semantics (Auth) |
| `/my-applications` worker dashboard with status tabs and withdraw | Trust-tier gating on Apply (Verification — TBD) |
| Searchable chip-multiselect for specialisation / tag picking | `GET /specialisations`, `GET /tags`, `GET /job-posts/*` (existing backend, untouched) |
| Empty states, status badges, loading states for the surface | Document upload that may unlock Apply (Verification + Profiles) |

## Where to start

The implementing AI should read, in order:

1. `backend/src/job-post/job-post.controller.ts` and `backend/src/job-post/job-post.service.ts` — confirm the contract.
2. `backend/src/job-application/job-application.controller.ts` and `…service.ts` — confirm the lifecycle (`PENDING → REVIEWED → SHORTLISTED → ACCEPTED | REJECTED | WITHDRAWN`) and the status-specific authorisation rules.
3. `backend/prisma/schema.prisma` lines 671–748 (`JobPost`, `JobApplication`, `JobPostSpecialisation`, `JobPostTag`).
4. `backend/src/specialisation/specialisation.controller.ts` and `backend/src/tag/tag.controller.ts` — public list endpoints.
5. `web/src/pages/JobBoardPage.tsx` and `web/src/pages/MyApplicationsPage.tsx` — the surface to be replaced.
6. `tasks/done/auth-flow/contract.md` — for `ApiError`, `<AuthBanner>`, `AccountStateGuard`, `useAccountMe()` shape.
7. `tasks/done/profiles/contract.md` and `tasks/done/profiles/spec.md` — for the role-aware page conventions, avatar / badge primitives, completeness pattern, and `MarketplaceRouter` route registration.
8. `tasks/product/verification/brief.md` — to know what trust-tier signals will (eventually) gate Apply / Post and to pin the Jobs renderer against the chosen vocabulary.
9. `docs/TradeHub_UK_Technical_Specification_v2.docx` §3 (roles), §6.3 (search filters), §10 (admin) — for the trade-vocabulary alignment.

## Open Questions for the implementing AI to resolve in `spec.md`

These are deliberately left open here. Resolve in `spec.md` Open Questions and append decisions to a Decisions Log.

1. **Edit-after-applications policy.** Industry norm is "soft freeze": edit cosmetic fields anytime, lock budget / pay-type / location once an applicant has applied (LinkedIn pattern). MVP-safe answer is to adopt the freeze; alternative is full edit with a warning banner shown to existing applicants. Pick one.
2. **Pause / Reopen state.** Add `PAUSED` to `JobPost.status` (Indeed pattern) so an employer can stop receiving applications without closing the post, or rely on the existing `CLOSED` / `OPEN` toggle? Schema change required if yes.
3. **Re-apply after withdrawal.** `JobApplication` has `@@unique([job_post_id, worker_id])`. If a worker withdraws and wants to re-apply, the unique constraint blocks it. Is the rule "withdraw is permanent" (Upwork pattern) or "withdraw deletes the row, allowing re-apply"? Recommend: permanent unless the post is reopened.
4. **Trust-tier gating on Apply.** Apply is gated today on `verification_state === 'ACTIVE'` (Auth). Should it also require Verification's `Basic` tier (ID approved)? Defer until Verification ships; for MVP, do NOT gate on tier.
5. **Trust-tier gating on Post.** Same question for employers — should Post require Verification's `Certified` tier? MVP recommendation: do not gate; surface tier as trust signal on the post card so workers can self-filter.
6. **Cover message required vs optional.** Backend DTO has it optional (`backend/src/job-application/dto/apply-job.dto.ts`). Product question: enforce on the frontend? Recommend: optional with a 100-char minimum-helpfulness warning if left blank.
7. **Detail-page URL strategy.** Use numeric `id` (matches existing endpoints) or extend slug pattern (`/jobs/:slug`)? Defer until SEO is in scope; numeric `id` for MVP.
8. **Closed-post visibility.** When a job is `CLOSED` / `FILLED` / `CANCELLED`, does it stay on `/jobs`? LinkedIn / Indeed keep them visible for portfolio reference. Recommend: hide from default `/jobs` browse (filter `status=OPEN`); keep visible on the worker's `/my-applications` row history.

## Methodology note

Follow the SDD discipline already used by `auth-flow/` and `profiles/`: `brief.md` (this file) → `spec.md` (numbered requirements with stable IDs `JOBS-NNN`, user flows, edge cases, acceptance criteria, open questions, decisions log) → `notes.md` (codebase snapshot + research with cited sources) → `contract.md` (sealed implementation contract — API shapes, error mapping, env vars). Move the folder from `tasks/product/` to `tasks/in-progress/` at the start of implementation, and from `tasks/in-progress/` to `tasks/done/` on ship — alongside a `tests-jobs-applications/` counterpart (per repo `CLAUDE.md` "Tests are not optional").
