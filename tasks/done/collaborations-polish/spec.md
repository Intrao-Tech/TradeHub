# Spec

## Summary

Production-ready frontend surface for **Collaborations** in TradeHub MVP. Replace the engineer-only debug page (`web/src/pages/CollaborationsPage.tsx`) with a real list page, a real `/collaborations/:id` detail page, role-aware lifecycle actions, a structured flag dialog, and read-only summary cards for escrow + chat that deep-link to placeholders. The collaboration backend (`backend/src/collaboration/`) is consumed as-is; no new endpoints, no schema migration.

**Chat behaviour and Stripe-Connect escrow logic are explicitly out of scope** — both are tracked in their own feature folders that ship after this one. This feature ships the *collaboration shell*, leaves stub cards where chat and escrow will land, and is reviewable end-to-end on its own.

Requirements use stable IDs (`COLLAB-NNN`) so commits, tests, and reviews can reference them.

## Problem

The Jobs feature ships an `Accept → Convert to collaboration` action (`tasks/done/jobs-applications/spec.md`, requirement `JOBS-040+`); when that fires, the user lands on `/collaborations`. What they see today (`web/src/pages/CollaborationsPage.tsx`) is unusable as a product:

- The escrow record is rendered as `<pre>{JSON.stringify(escrow, null, 2)}</pre>` (`:319`). Three other JSON dumps exist on the same page (`:440`, `:519`, plus the implicit dumps inside the escrow card).
- The escrow control surface (`:280-332`) creates real Stripe checkout sessions from numeric inputs labelled `job_amount` / `platform_fee` with no validation, no helper text, no role gating beyond the backend's 403, and no recovery from a failed Stripe call. Five-figure GBP transactions flow through this surface today.
- The "Flag" dialog (`:386-417`) takes one free-form text field — no preset reasons, no category, no audit-friendly structure for staff who later read the flag history.
- The create-collaboration form (`:454-512`) labels its inputs with the raw field names (`worker_id (employer)`, `agreed_amount`) and gives no hint about which fields the current user should fill (a worker should only see `employer_id`; an employer should only see `worker_id`).
- There is **no detail UI**. `GET /collaborations/:id` (`backend/src/collaboration/collaboration.controller.ts:98`) returns the full collaboration with parties, reviews, escrow, and referral — but the frontend renders only the list. A user cannot link to one collaboration, read its full record, or surface its review state.
- All errors render as `error.message`. `parseApiError()` (Auth contract §10) is not used.

The backend is complete (`backend/src/collaboration/{collaboration.service.ts,collaboration.controller.ts,dto/}`, `prisma/schema.prisma:487-518`); this spec is a frontend feature.

## Goals

- Replace every `<pre>{JSON.stringify(...)}</pre>` block on the Collaborations surface with real components.
- Ship a real `/collaborations/:id` detail page (URL-shareable, route-registered) with a role-aware action bar.
- Redesign the list page (`/collaborations`) with status filters, role filter, and per-row primary action.
- Redesign the create-collaboration flow with role-aware fields, validation, helper text, and inline error mapping.
- Redesign the flag dialog with a preset reason category list + optional free-text detail.
- Replace the inline escrow control block with a **read-only escrow summary card** that links to `/escrow/:id` (placeholder route shipped in this feature, real surface in the escrow feature).
- Add a **read-only chat summary card** on the detail page that links to `/inbox` (placeholder until the chat feature wires deep-linking by collaboration).
- Surface every API error through `parseApiError()` — never a silent 403.
- Mobile-first, design-system-only, light + dark, `lint:tokens` clean.

## Non-goals

- **Chat behaviour.** No auto-creation of a conversation when a collaboration is `CONFIRMED`, no rendering of messages on the detail page, no attachments. The chat summary card on `/collaborations/:id` is read-only and links to `/inbox`. Auto-conversation-on-confirm is the **chat** feature folder, which is the next spec after this one.
- **Real Stripe-Connect escrow.** No Connect onboarding for workers, no real `transfers.create` / `refunds.create`, no real dispute creation, no staff confirm-deposit / release / refund actions, no worker-wallet page, no employer-side fund-via-Stripe button. The escrow summary card on `/collaborations/:id` is read-only (status badge + amounts + timestamps) and links to a placeholder `/escrow/:id` page. Real escrow ships in the **escrow** feature folder.
- **Reviews write flow.** Reading the published reviews count and the per-side `is_published` state on the detail page is in scope; opening a "Write a review" form is out of scope and lives in its own feature.
- **Staff actions on collaborations beyond flag.** Staff sees the same surface as parties (with party-name labels swapped for both names), can flag, can read, but cannot force-status-change. Staff force-actions are part of `staff-tools`.
- **Schema changes / new collaboration endpoints / new collaboration fields.** Backend is consumed as-is.
- **Real-time updates.** Page-level refetch on focus and after a mutation is acceptable; WebSocket push for collaboration updates is not in scope (chat will add its own WS surface).
- **Bulk actions.** No multi-select, no bulk-flag, no bulk-status.
- **Pagination beyond `page=1&limit=20`.** Same default the page already uses; cursor pagination / infinite scroll is deferred.
- **Search by free-text.** Status and role filters only.

## User Flow

### Worker (initiator path)

1. Verified worker (`is_worker: true`, `verification_state === 'ACTIVE'`) navigates to `/collaborations` from the private nav (item label: "Work").
2. Sees a list of their collaborations as cards / rows. Each row: counterparty chip (employer display name, avatar, verification badge, star rating from Reviews), status pill, agreed-amount, project type, started-at, and a per-row primary action.
3. Filters: status tabs (`All` · `Pending` · `Confirmed` · `In progress` · `Completed` · `Disputed` · `Rejected`) with counts; role tab (default: `As worker`; toggle: `As employer` only visible when the account has both client roles, e.g. tradesperson posting their own jobs).
4. Worker clicks a row → routes to `/collaborations/:id`.
5. On detail page: header (counterparty chip, status pill, agreed-amount, project type, postcode, dates), action bar (role-aware buttons), escrow summary card (read-only, links to `/escrow/:id`), chat summary card (read-only, links to `/inbox`), reviews summary, flag history strip, audit timeline (created → confirmed → started → ended).
6. Worker who is the **responder** on a `PENDING` collaboration sees `Confirm` and `Reject` buttons. Worker who is the **initiator** on a `PENDING` collaboration sees only `Withdraw flag` / no transition controls (responder must act).
7. On `CONFIRMED` → either party sees `Start work`. On `IN_PROGRESS` → either party sees `Complete`. On any state for either party → `Flag dispute`.
8. Worker clicks `Flag dispute` → opens dialog with **reason category select** (preset list) + optional free-text detail. Submit calls `POST /collaborations/:id/flag` with the category code as the prefix and detail as the suffix (e.g. `PAYMENT_LATE: client says cheque is in the post but it's been 3 weeks`).
9. Each transition calls `PATCH /collaborations/:id/status`; the surface optimistically updates and reverts on error. Errors surface via `parseApiError()` as inline alerts on the action bar.
10. From `/collaborations`, the page header shows a **"New collaboration"** button (only when the account has at least one client role). Clicking opens a sheet with role-aware fields (worker fills `employer_id`, employer fills `worker_id`), validation, helper text, and a single submit. On success, the sheet closes and routes to `/collaborations/:id`.

### Employer (responder path)

1. Same `/collaborations` surface; the role tab defaults to `As employer` if the only client role is employer.
2. Employer who is the **responder** on a `PENDING` row sees `Confirm` and `Reject`.
3. On `/collaborations/:id` the escrow summary card is **read-only in this feature** — it shows the current state (`No escrow yet` / `Awaiting deposit` / `Held` / `Released` / `Refunded` / `Disputed`) with amounts (when present) and timestamps. The card is wrapped in a `<Card>` with a footer `Manage payment →` link to `/escrow/:id` (placeholder route in this feature). The footer link is also visible to the worker (the placeholder explains escrow is coming and links back).
4. Employer initiating manually (without an existing job application) clicks **"New collaboration"** → sheet shows `worker_id` only (with helper text "Worker's client profile ID — find it on the worker's profile page"), `project_type`, `site_postcode`, `agreed_amount`, optional `referral_id`. Validation: `worker_id > 0`, `agreed_amount` is a positive decimal with ≤ 2 dp, `site_postcode` matches the existing UK-postcode regex (Profiles `PROF-015`).

### Public / unauthenticated visitor

- `/collaborations` and `/collaborations/:id` are private routes. Anonymous visitors hitting either are redirected to `/login?next=` (existing `<Protected>` wrapper from `App.tsx:78`).

### Staff

- Staff viewing `/collaborations/:id` sees both party chips (no "you / them" framing), can flag, but lifecycle action buttons are disabled with a tooltip ("Staff cannot transition status — use the staff-tools surface"). Read of escrow / reviews / timeline works the same way.

## Requirements

Conventions: each requirement has a stable ID. **Must** = MVP-blocking. **Should** = strongly preferred. **Defer** = explicitly out of MVP. Referenced as `@COLLAB-NNN` from commits, tests, and PR descriptions.

### Sealed Auth dependencies (consumed, not duplicated)

`tasks/done/auth-flow/contract.md` (sealed 2026-04-26).

- `Account.status === 'ACTIVE'` and `verification_state === 'ACTIVE'` are required for create-collaboration / status-transition / flag actions; the backend already enforces this via `AccountStateGuard` and `RequiresVerifiedEmail` (see `collaboration.controller.ts:38`). The frontend reads these via `useAccountMe()` (Profiles `PROF-051`) and renders disabled-with-tooltip states; it does not invent a parallel flag-disable rule.
- All API errors are surfaced through the `ApiError` class + `parseApiError()` helper. Every Collaborations fetch uses these.
- `<AuthBanner kind="EMAIL_NOT_VERIFIED">` is reused for the unverified-on-detail-page state.

### Sealed Profiles dependencies (consumed, not duplicated)

`tasks/done/profiles/contract.md`.

- `<VerificationBadge>`, `<StarRating>`, the avatar primitive, and `verificationFromLevel()` are reused for the counterparty chips on list rows and detail header. Collaborations does not invent parallel components.
- The status-pill colour mapping established by Jobs (`bg-success-subtle` / `bg-warning-subtle` / `bg-info-subtle` / `bg-danger-subtle`) is reused for collaboration status (`PROF-030` mapping rule).
- Postcode validation reuses the `PROF-015` UK-postcode regex on the create-collaboration form's `site_postcode` field.

### Sealed Jobs & Applications dependencies (consumed, not duplicated)

`tasks/done/jobs-applications/contract.md`.

- The Accept → Convert-to-collaboration flow's terminus is `/collaborations/:id` (a successful `POST /job-applications/:id/to-collaboration` returns a collaboration; the Jobs surface routes the employer to its detail page on this surface).
- The same `parseApiError()` mapping conventions and `<Toast>` patterns Jobs established are reused; this feature does not invent a parallel error-surfacing convention.

### 1. Page hygiene & route registration

- **COLLAB-001 (Must).** Delete every `<pre>{JSON.stringify(...)}</pre>` block on the Collaborations surface. Specifically: the inline escrow JSON (`CollaborationsPage.tsx:319`), "Raw list JSON" (`:434-443`), and "Last action response" (`:515-522`).
- **COLLAB-002 (Must).** Register `/collaborations/:id` in `web/src/App.tsx` under the marketplace router, gated by `<Protected loggedIn>`. Add the lazy import alongside `CollaborationsPage`.
- **COLLAB-003 (Must).** Register a placeholder `/escrow/:id` route in `web/src/App.tsx`, gated by `<Protected loggedIn>`. The page renders an `EmptyState` (`<EmptyState icon={Banknote} title="Escrow is coming soon" description="...">`) with a back-link to `/collaborations/:id` and a single line stating that the real surface ships in the escrow feature. Existence of this route is what lets the detail page's `Manage payment →` footer link be a real link, not a `disabled` button.
- **COLLAB-004 (Must).** Update private-nav label from "Work" to "Work" stays — but route stays `/collaborations`. (No nav rename required; explicitly noted to prevent drive-by changes.)

### 2. List page (`/collaborations`)

- **COLLAB-010 (Must).** Replace `CollaborationsPage` with a list rendered as a grid of `<Card>` rows on ≥ md and stacked rows on mobile. Each row shows: counterparty chip (avatar + display name + verification badge + star rating), status pill, agreed-amount, project-type, dates (started → ended or started → "in progress"), per-row primary action (Confirm / Start / Complete / View — whichever is the next legal transition for the current user, falling back to "View" when no transition is available to this user).
- **COLLAB-011 (Must).** Status tabs: `All` · `Pending` · `Confirmed` · `In progress` · `Completed` · `Disputed` · `Rejected`. Tab counts come from a single fetch of `GET /collaborations/me?limit=100` (no per-tab refetch); if the user has > 100 collaborations, pagination kicks in below the tabs and counts read "100+". (Cap is 100 because `CollaborationQueryDto.limit` validates `@Max(100)`; see Decisions Log 2026-05-06.)
- **COLLAB-012 (Must).** Role tab: `As worker` / `As employer`, only rendered when the account has both `client_profile.is_worker` and `client_profile.is_employer` (or analogous) signals; otherwise hidden. The role tab filters list rows in the client by comparing `clientProfileId` to `worker_id` / `employer_id`. The tab is **client-side only**; backend filter is not required (no new endpoint).
- **COLLAB-013 (Must).** "New collaboration" button in the page header opens the create sheet (`COLLAB-030`). Visible whenever the account has at least one client role.
- **COLLAB-014 (Should).** Empty state: when the list is empty, render `<EmptyState icon={Handshake} title="No collaborations yet" description="Accept a job application to start one, or invite someone manually.">` with a CTA back to `/jobs` and a secondary CTA opening the create sheet.
- **COLLAB-015 (Should).** Optimistic refresh: after any successful mutation (`POST /collaborations`, `PATCH /collaborations/:id/status`, `POST /collaborations/:id/flag`), refetch the list and show a `<Toast>` ("Collaboration created" / "Status updated" / "Flagged for review").

### 3. Detail page (`/collaborations/:id`)

- **COLLAB-020 (Must).** Implement `web/src/pages/CollaborationDetailPage.tsx` rendering `GET /collaborations/:id`. Header: page title `Collaboration #:id`, status pill, agreed-amount, project type, postcode, started/ended dates, initiator chip + responder chip (with role labels: "Worker" / "Employer", verification badge, star rating).
- **COLLAB-021 (Must).** Lifecycle action bar:
  - `PENDING` (responder only): `Confirm` · `Reject`.
  - `CONFIRMED` (either party): `Start work`.
  - `IN_PROGRESS` (either party): `Mark complete`.
  - `COMPLETED` / `REJECTED`: no transition buttons.
  - Any non-terminal state for any party: `Flag dispute` (always available alongside other buttons).
  Each button calls `PATCH /collaborations/:id/status`. Errors surface as a sticky alert above the action bar via `parseApiError()`.
- **COLLAB-022 (Must).** Escrow summary card. Renders one of: `No escrow yet` (when `escrow_transaction === null`); `<status pill> · <amounts table>` showing `job_amount` / `platform_fee` / `referral_commission` / `worker_payout` as labelled rows in a `<dl>`, plus the relevant timestamp (`deposit_confirmed_at` / `released_at` / `refunded_at` / `disputed_at`). Footer: `Manage payment →` linking to `/escrow/:id`. The card is **purely read-only in this feature**; no Create-escrow / Fund-via-Stripe / Confirm-deposit / Release / Refund buttons.
- **COLLAB-023 (Must).** Chat summary card. Renders an icon + label `Conversation` and a footer link `Open inbox →` linking to `/inbox`. The card is purely read-only and unconditional in this feature; the chat feature will replace its content with the real conversation deep-link and unread count.
- **COLLAB-024 (Must).** Reviews summary card. Renders one of: `No reviews yet`; `Worker review: <published / draft>` and `Employer review: <published / draft>`, deriving the state from the `reviews[]` array on the collaboration payload. No "Write review" CTA in this feature (deferred to reviews feature).
- **COLLAB-025 (Must).** Flag history. If `flagged === true`, render an inline strip with the `flag_reason` value, a `flagged` icon, and a tooltip explaining staff will review. If `flagged === false`, hide the strip.
- **COLLAB-026 (Should).** Audit timeline. Render `created_at`, `confirmed_at`, `started_at`, `ended_at` as a vertical timeline using existing primitives. Skip null timestamps.

### 4. Create-collaboration sheet

- **COLLAB-030 (Must).** Implement `<NewCollaborationSheet>` opened from the list page header. Role-aware fields:
  - When the user is acting as a worker (role tab `As worker` or worker-only account): show `employer_id` (helper text: "Employer's client profile ID — find it on their public profile"), `project_type`, `site_postcode`, `agreed_amount`, optional `referral_id`. Hide `worker_id`.
  - When the user is acting as an employer (analogous): show `worker_id`, hide `employer_id`.
- **COLLAB-031 (Must).** Validation: `worker_id` / `employer_id` is a positive integer; `agreed_amount` is a non-negative decimal with ≤ 2 dp; `site_postcode` matches the UK-postcode regex from `PROF-015`; `project_type` is ≤ 100 chars. Submit is disabled until all required fields validate.
- **COLLAB-032 (Must).** Submit calls `POST /collaborations`. On success: close the sheet, refetch the list, route to `/collaborations/:id` (the new id is returned in the response), `<Toast>` "Collaboration created". On error: surface via `parseApiError()` inside the sheet; do not close.
- **COLLAB-033 (Should).** A "Counterparty unknown? Browse profiles" link inside the sheet routes to `/workers` or `/employers` depending on which side the user is on. Closing that page returns to `/collaborations` (no automatic re-open of the sheet — this is acceptable for MVP).

### 5. Flag dialog

- **COLLAB-040 (Must).** Replace the free-text flag dialog with a **structured** one: a `<Select>` of preset reason categories + an optional free-text detail field. The submitted `reason` is `<CATEGORY>: <detail>` (or just `<CATEGORY>` if detail is empty). Categories (frontend-only enum, no backend change):
  - `PAYMENT_LATE` — Payment is overdue
  - `PAYMENT_REFUSED` — The other party refuses to pay
  - `WORK_QUALITY` — Work quality is unacceptable
  - `WORK_NOT_DONE` — Work was not completed as agreed
  - `SAFETY_CONCERN` — Site safety / health concern
  - `MISREPRESENTATION` — The other party misrepresented themselves
  - `ABUSIVE_BEHAVIOUR` — Abusive / threatening behaviour
  - `OTHER` — Something else (detail required)
- **COLLAB-041 (Must).** When category is `OTHER`, the detail field becomes required (≥ 10 chars).
- **COLLAB-042 (Must).** Submit calls `POST /collaborations/:id/flag`. On success: close, refetch the detail (or the list if invoked from the list-row inline flag), `<Toast>` "Flag submitted — staff will review". Error surface via `parseApiError()` inside the dialog.
- **COLLAB-043 (Should).** Show the flag dialog from both list rows (per-row "Flag" action in a row dropdown menu, only visible to participants and staff) and the detail page action bar. Both call the same shared component.

### 6. Error surfacing & access control

- **COLLAB-050 (Must).** Every fetch and mutation on the surface surfaces errors through `parseApiError()` and renders human-language messages. No raw `error.message`. No silent 403.
- **COLLAB-051 (Must).** Staff hitting `/collaborations/:id` sees the same detail page; lifecycle action buttons render disabled with a tooltip ("Staff cannot transition status — use the staff-tools surface"); the flag button works as for parties.
- **COLLAB-052 (Should).** Unauthenticated user hitting `/collaborations` or `/collaborations/:id` is redirected to `/login?next=` (already enforced by `<Protected>` in `App.tsx`).

### 7. Design-system compliance

- **COLLAB-060 (Must).** Zero raw hex / Tailwind default scale / inline-style-color usage. `npm run lint:tokens` is clean.
- **COLLAB-061 (Must).** `vite build` is clean. Light + dark mode toggle works. 375px viewport works (mobile-first).
- **COLLAB-062 (Must).** Reuse: `<VerificationBadge>`, `<StarRating>`, `<EmptyState>`, `<Card>`, `<Dialog>`, `<Sheet>`, `<Select>`, `<Tabs>`, `<Toast>`, `<Badge>` from `web/src/components/ui/` and `web/src/components/`. No new domain primitives unless explicitly required by a requirement here.

### 8. Tests counterpart

- **COLLAB-070 (Must).** A `tests-collaborations-polish/` folder opens the same week implementation starts and lives in `tasks/in-progress/` until the implementation feature ships. It covers:
  - List page: status filter switching, role tab visibility logic, empty-state copy, per-row primary-action selection.
  - Detail page: action-bar legality matrix (`PENDING` responder vs initiator vs participant; `CONFIRMED` either party; `IN_PROGRESS` either party; terminal states); escrow summary read-only states (none / awaiting / held / released / refunded / disputed); chat summary card existence and href; flag-history strip visibility.
  - Create sheet: role-aware field set; `agreed_amount` and `site_postcode` validation; success path routes to detail; error path surfaces via `parseApiError()`.
  - Flag dialog: category preset list; `OTHER` requires detail; submitted `reason` format.
  - Staff guard: staff sees disabled lifecycle buttons with tooltip; can flag.
  - Token lint clean: a smoke test that `lint:tokens` passes on the changed files.

## Edge Cases

- **A user without a `client_profile`.** Backend rejects create / list with `400 No client profile` (`collaboration.controller.ts:47`); frontend surfaces this via `parseApiError()` as a banner directing the user to complete their profile (link to `/profile`). No silent 400.
- **Both party chips identical.** Backend rejects (`collaboration.service.ts:64`); the create form rejects client-side first (the role-aware fields make this physically impossible from the form, but the guard remains).
- **Status conflict (e.g. two tabs open, both press `Confirm`).** Backend returns `400 Status is already CONFIRMED`; the frontend surfaces this as an inline alert and refetches the detail.
- **Escrow exists but collaboration is `PENDING` / `REJECTED`.** Should not happen by backend invariants (escrow can only be created from `CONFIRMED` / `IN_PROGRESS`, see `escrow.service.ts:38`), but if encountered, the escrow summary card renders the data as-is without crashing.
- **`flagged` toggles but `flag_reason` is null.** Old rows from before the structured-reason convention. Render the flag strip with copy "Flagged — no reason recorded".
- **Reviews payload includes a row with `is_published: false`.** Render as `Draft` not `Published`.
- **Staff impersonation / view of a collaboration whose participants the staff member is not.** Staff sees both chips; both lifecycle buttons disabled.
- **`GET /collaborations/:id` returns 404.** Detail page renders an `EmptyState` ("Collaboration not found or you don't have access") with a back-link to `/collaborations`.
- **Network failure on first list load.** Page renders an inline alert with a `Retry` button; no skeleton-stuck state.
- **`agreed_amount` over-precise (e.g. `100.123`).** Form rejects client-side ("Use up to 2 decimal places").
- **`site_postcode` lower-case / spaces.** Form normalises to upper-case and trims whitespace before submission (matches `PROF-015` semantics).

## Acceptance Criteria

- `web/src/pages/CollaborationsPage.tsx` contains zero `<pre>{JSON.stringify(...)}</pre>` blocks. (Grep returns nothing on `JSON.stringify` in `web/src/pages/CollaborationsPage.tsx` and `web/src/pages/CollaborationDetailPage.tsx`.)
- `/collaborations/:id` is a registered route in `web/src/App.tsx`, gated by `<Protected>`. Hitting it logged-out redirects to `/login?next=/collaborations/:id`.
- `/escrow/:id` is a registered placeholder route gated by `<Protected>` rendering `EmptyState` "Escrow is coming soon" with a back-link.
- Status tabs on `/collaborations` filter rows correctly; counts match the unfiltered list payload.
- `New collaboration` sheet shows role-aware fields (worker sees `employer_id`, employer sees `worker_id`); validation blocks submit until all required fields are valid; success routes to `/collaborations/:id`; error surfaces via `parseApiError()`.
- `Flag dispute` dialog uses the preset reason `<Select>`; `OTHER` requires ≥ 10 chars of detail; submitted reason has the `<CATEGORY>: <detail>` shape.
- On the detail page, the action bar renders only the legal next transitions for the current user role (initiator vs responder vs staff vs neither). Disabled buttons show tooltips explaining why.
- The escrow summary card on the detail page is **read-only** (no Create / Fund / Confirm / Release / Refund buttons exist anywhere on the Collaborations surface). It renders the correct status copy + amount table + timestamps based on the payload, and the `Manage payment →` footer link routes to `/escrow/:id`.
- The chat summary card on the detail page renders unconditionally with a footer `Open inbox →` link to `/inbox`.
- `npm run lint:tokens` is clean. `./node_modules/.bin/vite build` is clean. Light + dark mode parity verified. 375px viewport verified.
- `tests-collaborations-polish/` has a `spec.md` covering the COLLAB-070 test set.

## Open Questions

- **Q1.** Should the role tab on `/collaborations` (`COLLAB-012`) read both `is_worker` and `is_employer` from `client_profile` directly, or should it derive role from the rows the user actually appears in (e.g. show "As employer" only if the user is the employer in ≥ 1 row)? Defaulting to the latter (derive from rows) avoids showing an empty tab; revisit if feedback says otherwise.
- **Q2.** Do we want the `New collaboration` sheet at all in MVP, or should we route users exclusively through the Jobs accept-flow? Recommendation: keep it because employers can sometimes finalise an arrangement off-platform and want to bring it onto TradeHub for escrow / reviews; mark as **defer** if scope creeps.
- **Q3.** Where does the `Manage payment →` footer link route the user **after** the escrow feature ships — to `/escrow/:id` (per-escrow page) or to `/collaborations/:id?tab=escrow` (a tab on the detail page)? Both are valid; pick at the start of the escrow feature, not now. This feature ships `/escrow/:id` as the placeholder; the escrow feature decides whether to keep that URL or replace.
- **Q4.** Should staff get a "Force-status-change" override on this surface, or strictly route them to the staff-tools surface? Default: strictly staff-tools. Confirm with whoever owns staff-tools.

## Decisions Log

- **2026-05-06 — Q1 resolved.** Role tab on `/collaborations` (`COLLAB-012`) is rendered only when the **rows** the user actually appears in span both `WORKER` and `EMPLOYER` sides. This avoids surfacing an empty tab when the account technically has both client roles but only one side has activity. Reconsider if user feedback indicates the empty-tab affordance is wanted as a discovery hint.
- **2026-05-06 — Q2 resolved.** The `New collaboration` sheet ships in MVP. Employers and workers can finalise arrangements off-platform and need a way to bring them onto TradeHub for escrow / reviews without going through Jobs.
- **2026-05-06 — Q3 deferred.** This feature ships `/escrow/:id` as a placeholder route. The choice between `/escrow/:id` vs. `/collaborations/:id?tab=escrow` for the post-MVP escrow surface is deferred to the start of `tasks/product/escrow/`. The `Manage payment →` footer link points at `/escrow/:id` for now.
- **2026-05-06 — Q4 resolved.** Staff are routed strictly to `staff-tools` for force-status-change. On `/collaborations/:id`, staff who are not also a participant see a single disabled `Lifecycle actions disabled` button with a tooltip pointing to the staff-tools surface. The Flag dispute control remains live for staff per `COLLAB-051`.
- **2026-05-06 — COLLAB-011 cap reconciled.** The original spec said `?limit=200` but `CollaborationQueryDto.limit` validates `@Max(100)`; the page hit a 400 `limit must not be greater than 100` surfaced through `parseApiError()`. Frontend now uses `?limit=100`; the "100+" copy applies above that threshold. Bumping the backend `@Max` to 200 was considered but rejected — pagination already works for accounts above the cap, and aligning with the existing backend contract avoids cross-package drift.
