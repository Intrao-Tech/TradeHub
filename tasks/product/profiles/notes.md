# Notes

## Methodology

This spec follows Spec-Driven Development (SDD) discipline as defined by GitHub Spec Kit and adjacent literature: the spec is the durable artifact, code is regenerable. Phases of the methodology used to produce this folder:

1. **Specify** — `brief.md` and `spec.md` describe *what* and *why*. No tech stack decisions inside requirement bodies.
2. **Clarify** — Open Questions section is the explicit gate before planning. Resolve with product before plan/tasks phases.
3. **Plan and Tasks** — owned by the implementation track once Open Questions are closed. Will live alongside this folder when generated.

Stable requirement IDs (`PROF-001` … `PROF-050`) provide traceability across commits, tests, and PR descriptions, in line with Rezvov's "four pillars of SDD" (Traceability / DRY / Deterministic Enforcement / Parsimony).

SDD source links:

- GitHub Spec Kit canonical methodology — https://github.com/github/spec-kit/blob/main/spec-driven.md
- GitHub Spec Kit docs (phases, commands) — https://github.github.io/spec-kit
- Four Pillars of Specification-Driven Development — https://blog.rezvov.com/specification-driven-development-four-pillars

## Current Codebase Snapshot

### Backend

Authoritative profile-related surface, by module (`backend/src/`).

**Client profiles (`client-profile/`)**

- `GET /client-profiles` — public, paginated, filters: `postcode_area?`, `verification_level?`, `search?`. Default sort: `display_name asc`.
- `GET /client-profiles/:slug` — public lookup by slug.
- `PATCH /client-profiles/me` — JWT only. Fields: `display_name?`, `bio?`, `city?`, `postcode_area?`, `avatar_url?`.

**Worker profiles (`worker-profile/`)**

- `GET /worker-profiles` — public, paginated, filters: `specialisation_id?`, `min_rating?`, `is_available?`, `postcode_area?`, `day_rate_min?`, `day_rate_max?`. Returns workers with `specialisations[]` and `portfolio_items[]`.
- `GET /worker-profiles/:id` — public lookup by `BIGINT` id.
- `PATCH /worker-profiles/me` — JWT + `Roles('WORKER')`. Fields: `years_experience?`, `day_rate_min?`, `day_rate_max?`, `available_from?`, `is_available?`.

**Employer profiles (`employer-profile/`)**

- `GET /employer-profiles` — public, paginated, filters: `search?`, `company_number?`. Sort: rating desc.
- `GET /employer-profiles/:id` — public.
- `PATCH /employer-profiles/me` — JWT + `Roles('EMPLOYER')`. Fields: `company_name?`, `company_number?`, `team_size?`.

**Portfolio (`portfolio/`)**

- `GET /portfolio/worker/:workerId` — public, returns all items sorted by `sort_order`.
- `GET /portfolio/:id` — public.
- `POST /portfolio/{experience|project|certification}` — JWT + `Roles('WORKER')`.
- `PATCH /portfolio/:id` (common fields), `PATCH /portfolio/:id/{experience|project|certification}` (sub-type fields).
- `DELETE /portfolio/:id`.
- `POST /portfolio/:id/media` — JWT + worker. Accepts pre-hosted `media_url`. There is no current file-upload variant; this spec adds one (`PROF-024`).
- `DELETE /portfolio/media/:mediaId`.
- `POST /portfolio/:id/documents/:documentId` and `DELETE /portfolio/:id/documents/:documentId` — link/unlink an approved document to a portfolio item. Server-side check: document must belong to the same worker (`portfolio.service.ts:272`).

**Documents (`document/`)**

- `POST /documents/upload` — JWT, multipart. Multer writes file to `./uploads/{uuid}.{ext}` (`document.controller.ts:76`); `file_url` stored as `/uploads/{uuid}.{ext}`. No explicit MIME or size validation in the controller; multer defaults apply.
- `GET /documents/me` — JWT.
- `GET /documents/:id` — JWT, owner or staff.
- `PATCH /documents/:id/status` — JWT + `Roles('STAFF')`. Statuses: `IN_REVIEW`, `APPROVED`, `REJECTED`.
- `DELETE /documents/:id` — owner can delete only `PENDING` documents.

`doc_type` enum: `ID_PHOTO`, `SELFIE`, `INSURANCE`, `CSCS_CARD`, `GAS_SAFE_CERT`, `NICEIC_CERT`, `COMPANY_LETTERHEAD`, `PROJECT_PHOTO`, `OTHER`.

**Account (`account/`)** — profile-touching fields only.

- `GET /account/me` — includes `client_profile + worker_profile + employer_profile + staff_member`.
- `PATCH /account/me` — fields: `phone?`, `phone_verified?` (the latter is a temporary direct-write that the Auth spec calls out as not a long-term verification model).
- `DELETE /account/me` — soft-delete: `status = 'DEACTIVATED'`.

**Schema highlights** (`backend/prisma/schema.prisma`)

- Shared-PK inheritance: `Account ──▶ ClientProfile ──▶ WorkerProfile | EmployerProfile`, `Account ──▶ StaffMember`. ID is shared; "Has a worker profile" = role.
- `client_profile.slug` `VARCHAR(150)` `@unique`, system-set, no public mutation endpoint.
- `client_profile.verification_level` `VARCHAR(30)` default `'UNVERIFIED'`. Denormalised — promotion logic is in the Verification module.
- `client_profile.stripe_connect_account_id`, `client_profile.stripe_onboarding_complete`.
- `worker_profile.rating_avg` (`Decimal(3,2)`) and `rating_count` denormalised from Reviews.
- `portfolio_item.verified` boolean, staff-controlled.
- `portfolio_media.media_url` is a string column — there is no upload pipeline for media yet.

**Backend gaps relevant to this spec**

- No `is_published` / `is_searchable` flag on profiles. All extant profiles are implicitly public. The MVP product position (LinkedIn-style) tolerates this; revisit when `DEACTIVATED` accounts need a "hidden" middle state.
- No avatar-upload endpoint. Spec adds `POST /client-profiles/me/avatar` (`PROF-017`).
- No portfolio-media file-upload endpoint. Spec adds `POST /portfolio/:id/media/upload` (`PROF-024`).
- Slug uniqueness scope is global with no documented generator; see Open Question.
- Verification ladder vocabulary divergence between code (`UNVERIFIED / KYC / REVIEWED / HMRC` per `VerificationBadge.tsx`) and product spec (`Unverified / Basic / Certified / Premium`).

### Web

`web/src/`.

**`pages/ProfilePage.tsx` (1089 lines, three Tabs)**

- Mount: `GET /account/me` (`:141`).
- Profile tab: Account JSON dump (`:469`), client-profile editor (`PATCH /client-profiles/me` `:197`), worker editor conditional (`:533`), employer editor conditional (`:588`), `VerificationSection` (`:1010`).
- Portfolio tab (workers only): "Load portfolio" button (`:643`) calls `GET /portfolio/worker/:workerId`. Add forms for experience / project / certification post to corresponding endpoints.
- Documents tab: "Load documents" button. Upload form (`:961`) posts FormData to `POST /documents/upload`. Response rendered as JSON.
- Avatar: text input for `avatar_url` (`:517`) — no file upload.

**`pages/WorkerSearchPage.tsx` / `EmployerSearchPage.tsx`**

- Filters in left sidebar (desktop) / sheet (mobile). Results render as `<WorkerCard>` / `<EmployerCard>` grids.
- `WorkerCard.onSelect?` exists in the prop type but is unused. There is no detail-page route to navigate to.
- Both pages render `<pre>{JSON.stringify(...)}</pre>` debug blocks (`WorkerSearchPage:266, 297`; `EmployerSearchPage:170`).

**`pages/AdminPage.tsx`**

- Documents tab is a numeric input + status select + JSON response dump (`:624–:661`). No queue view, no document preview.
- No section for portfolio review or verification-level promotion.

**Auth state**

- No `useAuth` hook. `getToken()` reads `localStorage.access_token` (`web/src/api.ts:6`). `App.tsx:68` derives `loggedIn` boolean from token presence.
- Account shape consumers see: `{ client_profile: { id, display_name, bio, city, postcode_area, avatar_url, worker_profile?, employer_profile? } }`. Role detection is structural: `Boolean(cp?.worker_profile)` (`ProfilePage.tsx:135`).

**Routing (`App.tsx:100-136`)**

- Public: `/jobs`, `/workers`, `/employers`, `/reviews`.
- Private: `/dashboard`, `/profile`, `/my-applications`, `/collaborations`, `/referrals`, `/notifications`, `/inbox`, `/internal/admin`.
- Auth: `/login`, `/register`, `/oauth/callback`, `/internal`.
- **Missing for this feature**: `/workers/:id`, `/employers/:id`, `/clients`, `/clients/:slug`.

**Design system (`web/CLAUDE.md`)**

- Semantic tokens only (`bg-primary`, `bg-success-subtle`, `text-fg-muted`). No raw hex / default Tailwind in `components/**` or `pages/**` (enforced by `web/scripts/lint-tokens.mjs`).
- Brand: Amber (Option A). Status: success / warning / danger / info subtle variants.
- Primitives in `src/components/ui/`: button, input, textarea, label, card, badge, avatar, dialog, sheet, toast, select, dropdown-menu, tabs, table, skeleton, form.
- Domain components: `AppShell`, `WorkerCard`, `EmployerCard`, `VerificationBadge`, `StarRating`, `EmptyState`.
- Mobile-first 375 px baseline, tap targets ≥ 48×48 px.

## Product Doc Alignment

`docs/TradeHub_UK_Technical_Specification_v2.docx` is the authoritative product positioning document. Key points that shaped this spec:

- §1.1 — TradeHub is a **B2B professional reputation network** for UK construction trades. The primary analogy is **LinkedIn**, not Checkatrade / MyBuilder / Bark. Half of the publicly-facing trades-marketplace literature does not apply directly.
- §1.3 — explicitly NOT a B2C platform, NOT a bidding tool, NOT a job board.
- §2 BUILD ORDER — reputation must exist before referral exchange before labour database. Profiles is the foundation of all three modules.
- §3.1 — canonical Profile Fields list with "Verified By" column. Spec requirements track this list.
- §3.2 — canonical Verification Levels: Unverified (Grey) → Basic (Blue) → Certified (Gold) → Premium (Purple). Vocabulary used in `PROF-032`.
- §6.3 — canonical search filter set for the Labour Database. Anchors `WorkerSearchPage` filter scope.
- §7 Sprint 3-4 calls out "Profile pages (public + edit), specialisation tags, verification upload flow, admin verification queue" as MVP. This is exactly the scope of this feature.
- §7 Sprint 5-6 introduces collaboration + reviews. Reviews on profile pages are a placeholder section here (`PROF-008`) — full implementation is a separate spec.
- §8.2 — `Profile.specialisations[]` + `region[]` + `portfolio[]` schema is consistent with the Prisma model.
- §10.2 — moderation queues include Verification Queue (documents). `PROF-031` and the Documents staff section are the visible expression of that queue.
- §11 — UK GDPR considerations: ID documents and certifications are personal data. Public profiles must not leak `phone` / `email`; spec aligns (Open Question on visibility).

## Research Notes (decision-grounding)

### Spec-driven development

- GitHub Spec Kit canonical workflow and "executable specifications" — https://github.com/github/spec-kit/blob/main/spec-driven.md
- Phases and slash-commands (`/specify`, `/clarify`, `/plan`, `/tasks`, `/implement`) — https://github.github.io/spec-kit
- Four Pillars (Traceability / DRY / Deterministic Enforcement / Parsimony) — https://blog.rezvov.com/specification-driven-development-four-pillars

### Marketplace / professional-network profile patterns

- Upwork freelancer profile shape (custom slug for paying members, numeric default) — https://support.upwork.com/hc/en-us/articles/360016252373
- Upwork profile-completeness model (50% required + 50% optional) — https://support.upwork.com/hc/en-us/articles/211063188
- LinkedIn profile-level meter (Beginner / Intermediate / All-star, 7 sections) — https://linkedin.com/help/linkedin/answer/a594698
- LinkedIn completeness redesign — increased completion >100% by tying meter to actionable cards (Samantha Freedman case study) — https://samanthafreedman.com/profile-completion

### Avatar / image upload UX

- UX Patterns image-upload reference (picker / dropzone, preview, validation, replace) — https://github.com/thedaviddias/ux-patterns-for-developers
- Atlassian Atlaskit Avatar Picker (10 MiB cap, JPEG/PNG/GIF, pan/zoom, keyboard accessible) — https://atlaskit.atlassian.com/packages/media/media-avatar-picker
- shadcn-compatible image uploader with crop / aspect ratio (used as the model for `PROF-016`) — https://next.jqueryscript.net/shadcn-ui/drag-drop-image-uploader
- Filestack file-upload UX checklist (progress, retry, specific errors) — https://blog.filestack.com/file-upload-api-guide

### Slug strategy

- Spatie sluggable conventions (counter suffix on collision, `useSuffixOnFirstOccurrence`) — https://spatie.be/docs/laravel-sluggable/v4/advanced-usage/uniqueness
- Slugify best practices: lowercase, hyphens, slug lock once published, suffix on collision — https://sluggenius.com/blog/slugify-best-practices
- Privacy concern with name-based slugs in URLs — https://stackoverflow.com/questions/72002100/wordpress-user-nicename-and-profile-url-seem-to-conflict
- Idempotent unique-slug generator pattern (devflow OAuth issue thread) — https://github.com/adrianhajdin/jsmasterypro_devflow/issues/3

### Multi-role / two-sided marketplace accounts

- "Use a single user model with role-based permissions" — Notix marketplace primer — https://notixit.com/blog/marketplace-platform-development-guide
- UX Stack Exchange consensus: combined registration, separate dashboards if needed — https://ux.stackexchange.com/questions/8399 and https://ux.stackexchange.com/questions/39565
- Sharetribe role-toggle UX (provider / customer / both) — https://aykansoft.com/blogs?p=27641
- Stripe two-sided marketplace primer (network effects, supply seeding) — https://stripe.com/resources/more/two-sided-marketplace-strategy

### Trades-platform comparators (for context, not direct UX precedent)

The product is *not* Checkatrade / MyBuilder / Bark (those are B2C). Comparators referenced for awareness only:

- Checkatrade vs MyBuilder vs Bark vs Rated People — https://localsearchnorth.uk/blog/checkatrade-vs-bark-vs-mybuilder
- 2026 platform comparison — https://nearbytraders.co.uk/blog/checkatrade-vs-mybuilder-vs-nearbytraders

## Surf-validated product alignment (2026-05-03)

After the auth-contract reconciliation, I re-ran surf research against the **actual** product analogue stack to make sure the spec shapes the product the way the product doc describes it, not the way the (different) UK B2C marketplaces shape themselves. Headline findings and how they landed in the spec:

### LinkedIn-for-trades is the right shape, not Upwork

`docs/TradeHub_UK_Technical_Specification_v2.docx` §1.1 names LinkedIn as the analogue and §1.3 explicitly excludes B2C / bidding / job-board patterns. Surf surfaced two confirming voices:

- TRS Resourcing on tradies on LinkedIn — endorsements from peers, photos/videos showcasing work, certifications first-class, mobile-optimised because tradespeople rarely use desktops.
- UTRADIE ("digital passport for tradespeople") — qualifications, licences, job experience, mentors, shareable link. This is a tighter analogue for what TradeHub Phase 1 needs to be.

→ Spec retains LinkedIn shape: profile is a credentials portfolio with marketplace add-ons (rates, availability) layered on top, not a transactional storefront. Endorsements are out of scope for MVP (deferred until Reviews ships).

### UK B2B comparators (SubbieUK / Subcontractee) confirm role model

SubbieUK ("verified contractors can create and register their company profile" → "only verified contractors can post jobs") and Subcontractee ("Verify Your Account & Upload Documents" → distinct Skilled Worker / Labourer / Multi Trade Engineer roles) match the product spec's three-role model (Company / Self-Employed Tradesperson / Labourer). Both are mobile-first apps; we are web-first MVP, but `web/CLAUDE.md` already mandates 375 px baseline + ≥ 48 px tap targets.

→ Spec acceptance scenarios E2E-1 through E2E-7 require manual smoke at 375 px in addition to desktop.

### UK Right to Work is a load-bearing legal field I had missed

Product spec §3.1 lists "Right to work" as required and admin-verified. UK gov.uk defines two paths:

- **Non-British/Irish citizens**: 9-character share code starting with `W`, validated by employer at `https://www.gov.uk/view-right-to-work` with the candidate's date of birth.
- **British / Irish citizens**: original document check (passport / passport card / passport-plus-NI-letter), or via an Identity Service Provider (IDSP) using IDVT.
- The check is now legally required for self-employed contractors too (recent regulatory change), which is exactly TradeHub's worker population.

→ Added `PROF-052` (UI for both paths), `PROF-053` (backend `doc_type` extension + `Document.metadata` for share-code/dob), `PROF-054` (staff verification flow links out to gov.uk). RTW added to `PROF-036` worker-required completeness checklist.

CIS verification (HMRC subcontractor verify by UTR + NI) is a separate financial check — relevant later when the referral commission flow goes on-platform, not part of MVP profiles.

### Verification ladder UX patterns: Stripe / Onfido / Persona

Stripe Identity uses a session lifecycle (`requires_input → processing → verified | requires_input` failure path). Onfido emphasises "explain both why and how at the right moments", "real-time feedback in the moment", and explicit "unhappy path" design. Persona advises tiered KYC and UX-first compliance.

→ Tightened `PROF-033` to require: state per requirement (`Done` / `Pending review` / `Not started`), single primary CTA per card, time-to-complete microcopy ("Usually takes 90 seconds"), and an explicit document-rejection state with the staff-provided reason + "Re-upload" CTA. `PROF-034` quotes the product-spec ladder verbatim with no invented levels, capping visible state at Certified until Reviews ships.

### CSCS Smart Check / Gas Safe Register / NICEIC

The CSCS Smart Check API exists (registration number + surname → verified), Gas Safe Register has its own card lookup, NICEIC has an online certification system. None are in MVP scope, but the data model needs to accommodate future integration:

- `CertificationDetail.cert_number` already exists.
- Document `doc_type` enum needs the missing UK certification types (FIRAS, SMSTS, SSSTS, IPAF, PASMA, UKATA, First Aid, DBS) per product spec Appendix B — added to `BE-PROF-4`.
- Specialisation taxonomy (Appendix A — 30 specialisations) needs a seed audit — `BE-PROF-5`.

### Net effect on the spec

Five new requirements (`PROF-052` … `PROF-055` plus the consolidated `BE-PROF-1` … `BE-PROF-8` backend prerequisites section), eight rewritten / tightened acceptance scenarios (E2E-1 … E2E-8), `PROF-033` rewritten to mirror Stripe / Onfido patterns, `PROF-034` quoting the product spec verbatim. Total spec growth ~15%. No redundant scope.

## Auth contract handoff (2026-05-03)

The Auth track (Artem) sealed `tasks/in-progress/auth-flow/contract.md` on 2026-04-26 and has now landed it on `develop` (`71c88e9 Auth BE + FE. Spec updated`). Key facts that this Profiles spec consumes verbatim:

- **Account state:** `Account.status` defaults to `PENDING_EMAIL_VERIFICATION`; new column `email_verified_at`. New tables `email_verification_token` and `password_reset_token`. Backfill: existing rows promoted to `ACTIVE` with `email_verified_at = created_at`.
- **JWT payload extension:** `vs` (verification_state) added; `JwtStrategy` exposes `req.user.verification_state`. Frontend `account` summary shape: `{ id, email, is_worker, is_employer, is_staff, verification_state }`.
- **Account-state guard exemptions:** `AccountController.getMe`, `ClientProfileController.updateMe`, `WorkerProfileController.updateMe`, `EmployerProfileController.updateMe`, `PortfolioController.*`, `DocumentController.upload`. → Profile editing is **not** gated on email verification, by design.
- **Registration creates profile rows:** `/auth/register` atomically creates `account + client_profile + worker_profile|employer_profile`; backend builds `client_profile.display_name` from `first_name + surname` (worker) or `company_name` (employer). Single-role only.
- **App routing split:** `web/src/App.tsx` is now `MarketplaceRouter` + `StaffRouter` based on `IS_STAFF_HOST` (`web/src/lib/host.ts`). New profile routes register on the marketplace side.
- **Reusable components/helpers shipped by Auth (consume, don't duplicate):**
  - `web/src/lib/auth-routing.ts` — `postAuthRedirect`, `isSafeNext`
  - `web/src/lib/host.ts` — `IS_STAFF_HOST`, `STAFF_BASE_URL`
  - `web/src/lib/password-policy.ts` — not consumed by Profiles
  - `web/src/components/AuthBanner.tsx` — `EMAIL_NOT_VERIFIED`, `ACCOUNT_DEACTIVATED`, etc.
  - `web/src/components/PasswordRules.tsx` / `PhoneInput.tsx` / `StaffManagementCard.tsx` — not consumed
  - Updated `web/src/api.ts` — `ApiError` class + `parseApiError(err)` for structured error handling
- **Pages owned by Auth (do not modify in this feature):** `LoginPage`, `RegisterPage`, `OAuthCallbackPage`, `InternalLoginPage`, `VerifyEmailPage`, `VerifyEmailConfirmPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `SettingsSecurityPage`. Members tab in `AdminPage` is also Auth-owned.
- **Pages co-touched (be careful):** `App.tsx` (router structure), `api.ts` (error helpers), `AdminPage.tsx` (Members tab is Auth's, Documents queue stays Profiles).
- **Profile-side delta from contract:** `/profile` is the active-user post-login landing target (`postAuthRedirect` returns `/profile` for ACTIVE worker/employer). Profiles owns what renders there.

The dependency direction is Profiles → Auth. Profiles does not block on additional Auth work; everything in the contract has shipped.

## Step-back fact-check (2026-05-02)

After drafting the spec end-to-end, every load-bearing claim about the backend was re-verified against the code. Findings:

- `client_profile.slug VARCHAR(150) @unique` — confirmed at `backend/prisma/schema.prisma:59`. Spec accurate.
- `client_profile.verification_level` default `'UNVERIFIED'` — confirmed at `:64`.
- `client_profile.stripe_connect_account_id` and `stripe_onboarding_complete` — confirmed at `:65–66`.
- Multer pipeline uses `diskStorage` (`backend/src/document/document.controller.ts:26`); no explicit `fileSize` / MIME limits are wired into the `MulterModule` config. The `PROF-018` server-side validation requirement is therefore *new behaviour to add*, not a contract to consume.
- `VerificationBadge` ladder is **four states** (`unverified | kyc | reviewed | hmrc`) at `web/src/components/VerificationBadge.tsx:5`. Vocabulary mismatch with product spec (`Unverified / Basic / Certified / Premium`) is real. `PROF-032` rename + `verificationFromLevel` mapper update is the right scope.
- Worker-specialisation linkage: read paths exist (`backend/src/worker-profile/worker-profile.service.ts:15, 39, 75, 90`), **write paths do not**. Specialisation controller exposes admin CRUD on the catalog only. `PROF-036`'s "≥ 1 specialisation" worker-required field is blocked at the backend; flagged as Open Question with a concrete endpoint recommendation.
- Stripe Connect onboarding entry: `backend/src/stripe/` contains only `stripe.module.ts` (module wiring, no controller). `PROF-041` / `PROF-042` demoted to Should and gated on a backend endpoint; flagged as Open Question.
- Multi-role accounts: schema permits a single `client_profile_id` to be the PK of both a `worker_profile` and an `employer_profile` row (shared-PK IS-A inheritance). `PROF-038` (multi-role UI) is implementable today.
- Removed the implicit framing-assumption that TradeHub is a B2C marketplace comparable to Checkatrade / MyBuilder / Bark. Per `docs/TradeHub_UK_Technical_Specification_v2.docx` §1, TradeHub is a B2B professional reputation network (LinkedIn analogue). Trades-marketplace UX research is retained as context only; LinkedIn / Upwork patterns are the load-bearing references.

## Authoritative TradeHub references

- Product spec — `docs/TradeHub_UK_Technical_Specification_v2.docx`
- Frontend design rules — `web/CLAUDE.md`
- Backend data model — `backend/prisma/schema.prisma`
- Adjacent feature (parallel track) — `tasks/product/auth-flow/`
- Inventory of in-progress / non-prod-ready surfaces — `tasks/in-progress/research.md` §2 (Profiles)
