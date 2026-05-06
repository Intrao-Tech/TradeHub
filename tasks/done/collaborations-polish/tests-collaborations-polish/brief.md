# Brief

## Feature

Test coverage for the Collaborations Polish feature (`tasks/product/collaborations-polish/`).

## Problem

Collaborations Polish replaces an engineer-only debug page with a real product surface — list, detail, create sheet, structured flag dialog, read-only escrow / chat summary cards. The spec encodes ~30 `COLLAB-NNN` requirements across 8 sections plus a 12-row Edge Cases list. None of it is regression-protected today: there are **no backend unit tests** for the collaboration service (`backend/src/collaboration/` has no `*.spec.ts` file) and **no backend e2e tests** (`backend/test/` has no `collaboration.e2e-spec.ts`), and the frontend page is a single-screen JSON dump that nothing can fail against.

The surface is uniquely fragile because:

- The collaboration backend is **already shipped** but unprotected. Status-transition authorisation (responder-only Confirm / Reject; either-party Start / Complete; flag from any state) is a state-machine. A regression that lets a worker confirm a collaboration on the employer's behalf, or lets a non-party flag, is a privilege-escalation bug.
- Status invariants (`PENDING → CONFIRMED → IN_PROGRESS → COMPLETED`, plus `REJECTED` from `PENDING`, plus `DISPUTED` from anywhere) only exist as a chain of `if/else` in `collaboration.service.ts:124-178`. Nothing locks these transitions down.
- The flag dialog moves from free-form text to a structured 8-category enum with an `OTHER` rule (`COLLAB-040 / COLLAB-041`); without unit coverage of the category set, a future "let's add a 9th category" PR can silently drop one of the existing eight.
- The role-aware action bar on `/collaborations/:id` (`COLLAB-021`) has eight branches (responder vs initiator on `PENDING`; either party on `CONFIRMED` / `IN_PROGRESS`; staff; viewer with no relation; terminal states). Each is a hiding place for regressions.
- The escrow summary card on the detail page is **read-only by deliberate scope decision** (`COLLAB-022`); a future "while we're here, let's wire the Fund button back up" PR re-opens the inline-Stripe-checkout flow this feature explicitly retired. The grep guardrail must catch that.
- The chat summary card on the detail page (`COLLAB-023`) is a placeholder until the chat feature lands. Tests must assert the card exists and links to `/inbox` so a future "remove the placeholder card" PR doesn't accidentally delete the only entry point.
- The placeholder `/escrow/:id` route (`COLLAB-003`) exists only so the detail page's footer link is real; if someone deletes the route while the escrow feature is mid-build, every `/collaborations/:id` page silently 404s on the link.

## Goal

Lock the Collaborations Polish surface behind an automated test suite — backend unit + backend e2e + frontend unit + Playwright e2e — so that every `COLLAB-NNN` requirement and every Edge Case from the parent spec has at least one test that fails if the behaviour regresses. Cover the **existing-but-untested** collaboration backend at the same time, since the feature has no excuse to ship a polished frontend on top of an unprotected backend.

The `tests-auth-flow`, `tests-profiles`, and `tests-jobs-applications` specs handle their respective surfaces. This spec is their sibling for `collaborations-polish` and assumes their tooling — Vitest + RTL + MSW v2 (frontend), Jest + `jest-mock-extended` (backend unit), Testcontainers Postgres + Supertest + the `test-app.ts` harness (backend e2e), Playwright (frontend e2e), the `seedWorker*` / `seedEmployer*` factories, the `renderWithProfile()` helper, the `TestMailService`, the `parseApiError()` helper — is already in place.

## Users

- TradeHub developers and AI agents working on Collaborations Polish, Chat (next), Escrow (after Chat), Reviews, and any track that consumes the Collaborations contract.
- Reviewers of PRs touching `backend/src/collaboration/`, `web/src/pages/CollaborationsPage.tsx`, the new `web/src/pages/CollaborationDetailPage.tsx`, the new `<NewCollaborationSheet>` / `<FlagCollaborationDialog>` components, or the placeholder `/escrow/:id` route.

## Expected Outcome

- **Backend**: every collaboration endpoint (`POST /collaborations`, `GET /collaborations/me`, `GET /collaborations/:id`, `PATCH /collaborations/:id/status`, `POST /collaborations/:id/flag`) has unit + e2e coverage. Status-transition authorisation is exhaustively asserted (responder-only Confirm / Reject; either-party Start / Complete; flag from any state by participant or staff). The role-resolution branch in `create()` (worker-initiator vs employer-initiator) is exhaustively asserted.
- **Frontend**: every Collaborations page renders, validates, and routes correctly under MSW-mocked API responses. The action-bar legality matrix on `/collaborations/:id` is exhaustively asserted. The flag dialog asserts its 8-category preset list and the `OTHER`-requires-detail rule. The create sheet asserts role-aware field visibility and validation.
- **Guardrails**: the read-only-ness of the escrow summary card is enforced by a grep-style Playwright assertion that **no Create-escrow / Fund-via-Stripe / Confirm-deposit / Release / Refund button text exists** on the Collaborations surface. The "no `<pre>{JSON.stringify(...)}</pre>`" rule is enforced the same way `tests-jobs-applications` enforces it.
- A failing test points the developer at the offending `COLLAB-NNN` ID and the spec clause it broke.
- Bugs surfaced by the suite are filed in `tasks/in-progress/collaborations-polish/followups.md` (created on first finding); the suite **does not silently fix** any bug it reveals, matching the discipline established by `tests-jobs-applications`.

## Constraints

- Do **not** add CI / CD configuration. Local-execution only.
- Do not change Collaborations Polish behaviour. Tests must not silently fix bugs they reveal — file follow-ups instead.
- Reuse the `tests-auth-flow` + `tests-profiles` + `tests-jobs-applications` tooling unchanged. No new test stack.
- Do not write tests for chat behaviour or real Stripe-Connect escrow logic — both are explicit non-goals of the parent feature and have their own forthcoming `tests-chat/` and `tests-escrow/` siblings.
- The tests for the placeholder `/escrow/:id` route assert only that the route is mounted, gated by `<Protected>`, and renders the `EmptyState` — the real Escrow feature replaces the route content and brings its own tests.
- No real Stripe traffic, no real object store, no real mail. Mail is stubbed identically to the `tests-auth-flow` approach.
