# Status

- State: done
- Owner: chat-tests-author
- Created: 2026-05-06
- Last Updated: 2026-05-07
- Shipped: 2026-05-07

## Counts (green)

| Layer | Count | Files |
|---|---|---|
| Backend unit (U) | 88 | `backend/src/conversation/conversation.service.spec.ts`, `backend/src/conversation/conversation.service.attachments.spec.ts`, `backend/src/conversation/chat.gateway.spec.ts`, plus the auto-create / rollback extension in `backend/src/collaboration/collaboration.service.spec.ts` |
| Backend e2e — REST (E2E-B) | 13 | `backend/test/conversation.e2e-spec.ts` |
| Backend e2e — WS (WS) | 14 | `backend/test/chat.gateway.e2e-spec.ts` (drives the real `/chat` namespace via the new `socket.io-client` harness) |
| Frontend unit (F) | 33 | `web/src/pages/InboxPage.test.tsx` (6) · `web/src/pages/ConversationPage.test.tsx` (7) · `web/src/components/AppShell.unread.test.tsx` (5) · `web/src/components/chat/Composer.test.tsx` (11) · `web/src/components/chat/MessageList.test.tsx` (4) |
| Frontend e2e — Playwright (PW) | 8 active, 0 `test.fixme` | `web/e2e/inbox-list.e2e.spec.ts` (TEST-CHAT-200/201/202/203), `…/collab-confirm-creates-thread.e2e.spec.ts` (TEST-CHAT-210), `…/send-receive.e2e.spec.ts` (TEST-CHAT-220), `…/attachments.e2e.spec.ts` (TEST-CHAT-230), `…/unread-badge.e2e.spec.ts` (TEST-CHAT-240) |

Total green tests added by this suite: **156**.

## Notes

- Drafted 2026-05-06 alongside the parent `tasks/product/chat/spec.md`. Lives nested inside the parent feature folder, matching the precedent set by `tasks/done/collaborations-polish/tests-collaborations-polish/`. Moved with the parent into `tasks/done/` on 2026-05-07.
- Backend coverage for `backend/src/conversation/` is **net-new** in this feature — no `conversation.service.spec.ts`, no `conversation.e2e-spec.ts`, no `chat.gateway.spec.ts` existed before. Same backfill discipline as `tests-collaborations-polish` did for `backend/src/collaboration/`.
- This feature ships the **first WS test harness** in the repo: `backend/test/util/ws-client.ts`. Reused immediately by `chat.gateway.e2e-spec.ts` for every real-handshake assertion. Future features (`tests-escrow/`, `tests-push-notifications/`, any WS-emitting work) reuse it unchanged. The "reused by ≥ 1 other module within the same PR" acceptance criterion is on hold until the next WS-emitting feature lands; no other module in the repo currently emits WS events.
- Frontend uses a thin in-memory `web/src/test/socket-mock.ts` for unit tests; real WS flows are exercised at the Playwright layer (currently `test.fixme` — see `[CHAT-200-001]` in `tasks/done/chat/followups.md`).
- The cross-feature update to `tests-collaborations-polish TEST-COLLAB-114` ships in this PR — the chat summary card on `/collaborations/:id` now also asserts the `/inbox/<conversationId>` deep-link + per-collab unread badge when the inbox payload includes a row for the collab.
- Followups discipline mirrors `tests-collaborations-polish`: limitations / blocked-on-helper items surfaced during the test pass are filed in `tasks/done/chat/followups.md`. Three new entries in this pass — all three resolved in the 2026-05-07 fix-followups pass:
  - `[CHAT-061-001]` (jsdom virtualisation untestable) — **resolved**: added `vi.mock('@tanstack/react-virtual', …)` shim; TEST-CHAT-150/151/152 now drive the production `MessageList` component path. TEST-CHAT-150 also asserts m0/m999 are in the DOM.
  - `[CHAT-200-001]` (two-context Playwright auth + fixture blockers) — **resolved**: added `registerEmployer()` helper + the `POST /test/seed/collab-conversation` test-only endpoint (gated by `NODE_ENV === 'test'`, mirrors the existing `POST /test/seed/admin`). Five previously-fixme'd specs now active and green: TEST-CHAT-200 (seeded inbox), TEST-CHAT-210 (collab-confirm UI), TEST-CHAT-220 (real-WS send/receive across two contexts), TEST-CHAT-230 (composer file upload + cross-context delivery), TEST-CHAT-240 (live unread badge across pages).
  - `[CHAT-118-001]` (wall-clock throttle) — **resolved**: `vi.spyOn(Date, 'now')` shifts the wall clock past the 2 s window without slowing the suite. TEST-CHAT-118 dropped 2618 ms → 371 ms.
- Coverage matrix at `coverage-matrix.md` (`TEST-CHAT-250`).

## Source inputs

- Parent feature spec: `tasks/done/chat/spec.md` (the `CHAT-NNN` requirement set this suite locks down).
- Parent feature brief: `tasks/done/chat/brief.md` (build-vs-buy decision; constraints).
- Backend production code (consumed, locked): `backend/src/conversation/{conversation.controller.ts, conversation.service.ts, chat.gateway.ts, redis-io.adapter.ts, conversation.module.ts, dto/}`, `backend/src/collaboration/collaboration.service.ts` (auto-create seam — `CHAT-010..013`), `backend/src/message-attachment/{message-attachment.service.ts, message-attachment.controller.ts, message-attachment.constants.ts}`.
- Schema (consumed): `backend/prisma/schema.prisma:801-871` — `Conversation`, `ConversationParticipant`, `Message`, `MessageAttachment`. Migration: `add_conversation_collaboration_link_and_message_attachments`.
- Frontend production code (locked): rebuilt `web/src/pages/InboxPage.tsx` + the panel components in `web/src/components/chat/` (`Composer`, `ConversationPanel`, `MessageBubble`, `MessageList`, `MessageAttachmentChip`, `SystemMessagePill`, `TypingIndicator`, `helpers`, `useChatSocket`, `useUnreadCount`), updated `web/src/components/AppShell.tsx`, updated `web/src/App.tsx` for the `/inbox/:conversationId` route, updated `web/src/pages/CollaborationDetailPage.tsx` chat summary card (deep-link target).
- Sibling test specs (tooling reuse): `tasks/done/auth-flow/tests-auth-flow/`, `tasks/done/profiles/tests-profiles/`, `tasks/done/jobs-applications/tests-jobs-applications/`, `tasks/done/collaborations-polish/tests-collaborations-polish/`.
- Test tooling added in this feature: `backend/test/util/ws-client.ts` (new), `backend/test/util/factories.ts` (extended with `seedConversation` / `seedMessage` / `seedMessageAttachment`), `backend/test/util/storage-stub.ts` (new helper for the upload dir), `web/src/test/factories.ts` (extended with `mockConversation` / `mockMessage` / `mockMessageAttachment` / `mockInboxItem`), `web/src/test/handlers/conversations.ts` (new), `web/src/test/socket-mock.ts` (new), `socket.io-client` added as a backend devDependency.
