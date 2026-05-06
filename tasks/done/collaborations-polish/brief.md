# Brief

## Feature

Production-ready **Collaborations** surface for TradeHub MVP — the post-acceptance workspace where a worker and an employer track an agreed-upon job through its lifecycle (`PENDING → CONFIRMED → IN_PROGRESS → COMPLETED`, with `REJECTED` / `DISPUTED` side-paths). This feature only covers the **collaboration shell**: list, detail, lifecycle actions, flag, and a read-only summary of the related escrow + chat. Chat behaviour and Stripe-Connect escrow logic are explicitly **out of scope** and are tracked in their own feature folders that ship after this one.

## Problem

The backend already ships the full Collaborations surface (`backend/src/collaboration/`, `prisma/schema.prisma:487-518`). The frontend exposes it as an engineer-only debug page:

- `web/src/pages/CollaborationsPage.tsx:319` renders the escrow record as `<pre>{JSON.stringify(escrow, null, 2)}</pre>` inside every collaboration card.
- `:434-443` exposes a "Raw list JSON" `<details>` block with the entire `GET /collaborations/me` response dumped as JSON.
- `:515-522` renders a "Last action response" `<pre>` JSON dump after every mutation.
- `:280-332` is a free-form **escrow control surface** (create / view / fund) that creates real Stripe checkout sessions from numeric inputs labelled `job_amount` / `platform_fee` with no validation, no helper text, and no role gating beyond the backend's 403.
- The "Flag" dialog (`:386-417`) takes free-form text with a single placeholder (`"e.g. payment dispute"`) — no preset reason categories, so flag rows are unstructured strings.
- The create-collaboration form (`:454-512`) uses the field name as the input label (`worker_id (employer)`, `employer_id (worker)`, `agreed_amount`) with zero validation, no helper text, and no role-based field hiding.
- There is **no detail UI** for `GET /collaborations/:id` (`backend/src/collaboration/collaboration.controller.ts:98`) — only the list view exists. A user cannot link to a single collaboration, see its full timeline, or surface its review state, escrow state, or chat link in one place.
- All API errors render as the raw `error.message`; nothing is mapped through `parseApiError()` (Auth contract §10).

The goal of this feature is to turn this into a usable, design-system-compliant product surface **without** building chat or escrow logic — both of those are larger features owned by their own spec folders. The escrow and chat sections on this surface become **read-only summary cards with deep links to placeholders**, so we can ship the collaboration shell on its own and then layer in the real chat and real escrow without touching this surface again.

## Goal

Make the Collaborations surface a real product surface for the lifecycle:

- A real `/collaborations` list page with filters (status, role) and per-row primary action.
- A real `/collaborations/:id` detail page (URL-shareable, route-registered) with timeline, parties, agreed terms, status pill, lifecycle action bar, escrow summary card (read-only, links to escrow placeholder), chat summary card (read-only, links to inbox placeholder), reviews summary, and flag history.
- A redesigned create-collaboration flow with role-aware fields, validation, helper text, and proper error surfacing.
- A redesigned flag dialog with a fixed list of reason categories + optional free-text detail.
- All `<pre>{JSON.stringify(...)}</pre>` blocks deleted from the surface.
- All API errors surface through `parseApiError()` — no silent 403s.
- Mobile-first, design-system-only, light + dark, `lint:tokens` clean.

## Users

- **Worker** — initiates / responds-to a collaboration with an employer; advances status; flags disputes; reads (eventually writes) reviews; reads escrow status.
- **Employer** — initiates / responds-to a collaboration with a worker; advances status; flags disputes; reads (eventually writes) reviews; (eventually) creates and funds escrow.
- **Staff** — views any collaboration; flags on behalf of either party; reads escrow status. Full staff actions (force-status-change, refund, release) are part of `escrow` and `staff-tools` features, not this one.
- **Profiles feature** (`tasks/done/profiles/`) — supplies the avatar / display name / verification badge / star rating rendered on the parties chips.
- **Auth feature** (`tasks/done/auth-flow/`) — supplies the role flags (`is_worker` / `is_employer` / `is_staff`) and the `verification_state === 'ACTIVE'` gate.
- **Jobs & Applications feature** (`tasks/done/jobs-applications/`) — emits collaborations via `POST /job-applications/:id/to-collaboration`. This surface is where that hand-off lands.
- **Reviews feature** — read-only summary on this page; the write-a-review flow lives in its own folder.
- **Chat feature** (next, after this one) — supplies the conversation that this surface deep-links to.
- **Escrow feature** (after chat) — supplies the Stripe-Connect-real escrow that this surface deep-links to.

## Expected Outcome

- A worker who lands on `/collaborations` after their application is accepted sees a real list with proper status badges and per-row actions, can click into `/collaborations/:id`, advance the status (Confirm / Start / Complete), flag the row with a structured reason, and see read-only summary cards for escrow + chat that link to "Coming soon" placeholders.
- An employer sees the same surface from their side, with the role-aware create form (when initiating manually rather than from a job application).
- Zero `<pre>{JSON.stringify(...)}</pre>` rendering blocks remain on the Collaborations surface.
- Every action surfaces a structured error code through `parseApiError()`.
- The `tests-collaborations-polish/` counterpart opens the same week (per repo `CLAUDE.md` "Tests are not optional" rule) covering the page-level acceptance criteria.

## Constraints

- **No chat behaviour ships in this feature.** Auto-creating a conversation when a collaboration is `CONFIRMED`, rendering messages on the detail page, attachments, etc. — all deferred to the **chat** feature folder which is the next spec after this one.
- **No real Stripe-Connect escrow logic ships in this feature.** Stripe Connect onboarding, real `transfers.create` / `refunds.create` / dispute creation, staff confirm-deposit / release / refund actions, the worker-wallet page, employer-side fund-via-Stripe button — all deferred to the **escrow** feature folder. The existing escrow control block on `CollaborationsPage.tsx:280-332` is removed; this feature replaces it with a read-only summary card linking to a placeholder route.
- The Stripe checkout-session deposit endpoint (`POST /escrow/:id/deposit`) and the per-collaboration escrow read (`GET /escrow/collaboration/:id`) are **untouched** by this feature; they continue to work for whoever already has an escrow row, but this feature does not surface them as actionable buttons. They become actionable in the escrow feature.
- The collaboration backend (`backend/src/collaboration/`) is **not touched** by this feature beyond reading what already exists — no new endpoints, no new fields, no schema migration. The frontend is the entire product change.
- Design-system rules from `web/CLAUDE.md` apply: semantic tokens only, shadcn primitives, light + dark, mobile-first, `lint:tokens` clean.
- Sealed contracts to consume, not redefine: `tasks/done/auth-flow/contract.md`, `tasks/done/profiles/contract.md`, `tasks/done/jobs-applications/contract.md`.
