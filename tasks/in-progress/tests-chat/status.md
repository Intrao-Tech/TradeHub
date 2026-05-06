# Status

- State: product
- Owner:
- Created: 2026-05-06
- Last Updated: 2026-05-06
- Shipped:

## Notes

- Drafted 2026-05-06 alongside the parent `tasks/product/chat/spec.md`. Sits nested inside the parent feature folder, matching the precedent set by `tasks/done/collaborations-polish/tests-collaborations-polish/` and `tasks/done/jobs-applications/tests-jobs-applications/`. Moves with the parent through `product/` → `in-progress/` → `done/`.
- Backend coverage in this feature is **net-new** for the `backend/src/conversation/` module — no `conversation.service.spec.ts`, no `conversation.e2e-spec.ts`, no `chat.gateway.spec.ts` exists today. Same backfill discipline as `tests-collaborations-polish` did for `backend/src/collaboration/`.
- This feature ships the **first WS test harness** in the repo: `backend/test/util/ws-client.ts`. Acceptance criterion is that it's reused by ≥ 1 other module's e2e suite within the same PR (proof of reusability), or a follow-up issue is filed if no other module needs it yet. Future features (`tests-escrow/`, `tests-push-notifications/`, any WS-emitting work) reuse it unchanged.
- Frontend uses a thin in-memory `socket-mock.ts` for unit tests; real WS flows are exercised at the Playwright layer with two browser contexts (`TEST-CHAT-220 / 222 / 240`).
- Followups discipline mirrors `tests-collaborations-polish`: bugs surfaced are filed in `tasks/in-progress/chat/followups.md` (created on first finding); the surfacing test stays failing or `it.skip` with a TODO referencing the followup ID. The suite does not silently fix production code.
- Coverage matrix at `coverage-matrix.md` (`TEST-CHAT-250`).

## Source inputs available to the implementing AI

- Parent feature spec: `tasks/product/chat/spec.md` (the `CHAT-NNN` requirement set this suite locks down).
- Parent feature brief: `tasks/product/chat/brief.md` (build-vs-buy decision; constraints).
- Backend production code (consumed, **extended** by parent feature, locked here): `backend/src/conversation/{conversation.controller.ts, conversation.service.ts, chat.gateway.ts, redis-io.adapter.ts, conversation.module.ts, dto/}`, `backend/src/collaboration/collaboration.service.ts` (auto-create seam — `CHAT-010..013`).
- Schema (consumed): `backend/prisma/schema.prisma:801-841` (existing `Conversation` / `ConversationParticipant` / `Message`); the new `Conversation.collaboration_id` column + `MessageAttachment` table land via parent feature migration `add_conversation_collaboration_link_and_message_attachments`.
- Frontend production code (locked, not modified): the rebuilt `web/src/pages/InboxPage.tsx` + new `web/src/pages/ConversationPage.tsx` + new components (`<Composer>`, `<MessageList>`, `<TypingIndicator>`, `<AttachmentChip>`, `<UnreadBadge>` — exact names per parent-feature implementation), updated `web/src/components/AppShell.tsx`, updated `web/src/App.tsx` for the `/inbox/:conversationId` route. The chat summary card on `/collaborations/:id` is **updated** by the parent feature to deep-link to `/inbox/:conversationId`; this test feature updates `tests-collaborations-polish` `TEST-COLLAB-114` to match.
- Sibling test specs (tooling reuse): `tasks/done/auth-flow/tests-auth-flow/`, `tasks/done/profiles/tests-profiles/`, `tasks/done/jobs-applications/tests-jobs-applications/`, `tasks/done/collaborations-polish/tests-collaborations-polish/`.
- Sealed contracts: `tasks/done/auth-flow/contract.md`, `tasks/done/profiles/contract.md`, `tasks/done/jobs-applications/contract.md`. The Collaborations contract is `tasks/done/collaborations-polish/spec.md` itself (no separate `contract.md`).
- Test tooling additions in this feature: `backend/test/util/ws-client.ts` (new), `backend/test/util/factories.ts` (extended with `seedConversation` / `seedMessage` / `seedMessageAttachment`), `web/src/test/factories.ts` (extended with `mockConversation` / `mockMessage` / `mockMessageAttachment` / `mockInboxItem`), `web/src/test/handlers/conversations.ts` (new), `web/src/test/socket-mock.ts` (new), optional `backend/test/util/storage-stub.ts` if not already present.
