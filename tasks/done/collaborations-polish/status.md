# Status

- State: done
- Owner: Igor
- Created: 2026-05-06
- Started: 2026-05-06
- Last Updated: 2026-05-06
- Shipped: 2026-05-06

## Notes

- Shipped 2026-05-06: collaboration shell (list page polish + `/collaborations/:id` detail page + structured flag dialog + role-aware create sheet) without coupling to chat or escrow.
- Chat behaviour and Stripe-Connect escrow logic are explicit non-goals; they ship as their own feature folders **after** this one (next: `tasks/product/chat/`, then `tasks/product/escrow/`).
- The escrow card on the detail page is read-only with a `Manage payment →` link to a placeholder `/escrow/:id` route shipped in this feature. The chat card is read-only with an `Open inbox →` link to the existing `/inbox` route. Both placeholders are replaced (without changing the Collaborations surface) when the chat / escrow features ship.
- Tests counterpart: `tasks/in-progress/tests-collaborations-polish/` (sibling of this folder, still in progress) — acceptance set is COLLAB-070.
- Decisions Q1–Q4 resolved at the bottom of `spec.md` on 2026-05-06.

## Source inputs available to the implementing AI

- Backend (consumed as-is, no changes): `backend/src/collaboration/collaboration.controller.ts`, `…/collaboration.service.ts`, `…/dto/`.
- Schema (no migration): `backend/prisma/schema.prisma:487-518` (`Collaboration`), `:550-573` (`EscrowTransaction` — read-only).
- Frontend replaced: `web/src/pages/CollaborationsPage.tsx` (was the debug surface).
- New routes wired in `web/src/App.tsx`: `/collaborations/:id` (`web/src/pages/CollaborationDetailPage.tsx`), `/escrow/:id` (`web/src/pages/EscrowPlaceholderPage.tsx`).
- New components: `web/src/components/collaborations/{CollaborationStatusBadge.tsx, CounterpartyChip.tsx, FlagCollaborationDialog.tsx, NewCollaborationSheet.tsx, api.ts}`.
- Sealed contracts consumed: `tasks/done/auth-flow/contract.md`, `tasks/done/profiles/contract.md`, `tasks/done/jobs-applications/contract.md`.
