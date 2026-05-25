# Status

- State: done
- Owner: Igor
- Created: 2026-05-06
- Started: 2026-05-07
- Last Updated: 2026-05-07
- Shipped: 2026-05-07

## Notes

- Shipped 2026-05-07: implementation pass landed in five commits on `develop` (schema migration → backend WS+REST → auto-create on confirm → frontend rebuild → BigInt-broadcast hotfix). All `CHAT-001..CHAT-092` requirements satisfied; `CHAT-100` (`tests-chat/`) remains a sibling in-progress folder.
- Verification gates: `cd backend && npm test` clean (28 suites passed, 451 tests). `npm run build` clean. `cd web && npm run lint:tokens` clean (65 files). `vite build` clean. `npm test` clean (251 tests).
- Manual smoke (worker = `mike.builder@example.com`, employer = `james@acmebuild.co.uk`): confirmed PENDING → CONFIRMED auto-creates conversation 5 with the SYSTEM welcome message; REST send returns 201; 11th send in 10s rejected with 429 RATE_LIMITED; attachment upload accepts PNG and rejects `application/zip` with `INVALID_MIME_TYPE`; an `attachment_ids[]` referencing another participant's row is rejected with `NOT_OWNER`; WS handshake disconnects bogus tokens.
- Open Question Q1 left as default per spec (auto SYSTEM message *does* count toward the counterparty's unread). Re-evaluate after dogfooding.
- Followups in `followups.md`: orphan `MessageAttachment` cron sweep (24 h) is explicit Edge-Case scope, deferred from this feature.

- Drafted 2026-05-06 as the next feature after `tasks/done/collaborations-polish/`. Sequencing per `collaborations-polish/spec.md` Decisions Log: chat → escrow → reviews-write → staff-tools.
- Build vs buy decided in spec `Decisions Log` (2026-05-06): **build, no third-party SDK**. Re-evaluate at MAU > ~50k or when voice / video are scoped.
- Backend is ~80% pre-existing: `backend/src/conversation/` (REST + WS), `chat.gateway.ts` (JWT handshake + Redis adapter), `Conversation` / `ConversationParticipant` / `Message` schema. This feature extends it; it does not rewrite it. Specifically: (1) adds `Conversation.collaboration_id`, (2) adds `MessageAttachment` table, (3) wires auto-create on collab `CONFIRMED`, (4) closes the `join_conversation` participant-check gap, (5) adds rate limit on `send_message`, (6) adds typing events, (7) adds attachment upload endpoint.
- Frontend rewrite: `web/src/pages/InboxPage.tsx` is replaced. New `/inbox/:conversationId` route. The chat summary card on `/collaborations/:id` (placeholder shipped by `collaborations-polish`) is updated to deep-link to `/inbox/:conversationId` and surface per-collab unread.
- Tests counterpart: `tasks/in-progress/tests-chat/` opens the same week implementation starts (mandatory per `tasks/GUIDE.md` Working Principles + precedent from `tests-collaborations-polish/`). Acceptance set is `CHAT-100`.

## Source inputs available to the implementing AI

- Backend (extended, not rewritten): `backend/src/conversation/conversation.controller.ts`, `…/conversation.service.ts`, `…/chat.gateway.ts`, `…/redis-io.adapter.ts`, `…/dto/`.
- Schema: `backend/prisma/schema.prisma:801-841` (existing) + new `MessageAttachment` model mirroring `…/schema.prisma:775-794` (`JobAttachment`).
- Collaboration trigger: extend the service method that backs `PATCH /collaborations/:id/status` for the `CONFIRMED` transition (`backend/src/collaboration/collaboration.service.ts`).
- Frontend: replace `web/src/pages/InboxPage.tsx`; reuse `web/src/components/ConversationListItem.tsx`, `…/VerificationBadge.tsx`, `…/EmptyState.tsx`, `…/ui/{textarea,button,badge,avatar}.tsx`. Update `web/src/components/AppShell.tsx` for the Inbox unread badge. Update `web/src/App.tsx` to register `/inbox/:conversationId`.
- Sealed contracts consumed: `tasks/done/auth-flow/contract.md`, `tasks/done/profiles/contract.md`, `tasks/done/collaborations-polish/spec.md` (`COLLAB-023`).
- Product spec: `docs/TradeHub_UK_Technical_Specification_v2.docx §8.2` defines `Message: id, thread_id, sender_id, content, attachments[], read_at` and `AWS S3 / Cloudflare R2` for storage.
