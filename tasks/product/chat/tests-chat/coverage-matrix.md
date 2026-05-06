# Coverage Matrix — Chat tests

`TEST-CHAT-250`: every `CHAT-NNN` requirement and every relevant Edge
Case from `tasks/product/chat/spec.md` maps to ≥ 1 `TEST-CHAT-NNN` test
in this feature. Each test description cites the `CHAT-NNN` it protects
so a failure points the developer at the broken clause.

Legend: **U** = backend unit (`backend/src/**/*.spec.ts`), **E2E-B** =
backend e2e (`backend/test/**/*.e2e-spec.ts`), **WS** = backend WS e2e
(`backend/test/chat.gateway.e2e-spec.ts`, drives real Socket.IO namespace),
**F** = frontend unit (`web/src/**/*.test.tsx`), **PW** = Playwright
(`web/e2e/**`).

## CHAT-NNN → TEST-CHAT-NNN

| CHAT  | Clause                                                              | Test(s)                                  | Layer        |
| ----- | ------------------------------------------------------------------- | ---------------------------------------- | ------------ |
| 001   | `Conversation.collaboration_id` + unique index                      | TEST-CHAT-040 / 086                      | U + WS       |
| 002   | `MessageAttachment` table                                           | TEST-CHAT-020 / 075                      | U + E2E-B    |
| 003   | Migration name + no backfill                                        | (locked by schema diff in `vite build` / `prisma migrate` — no test) | -      |
| 010   | Auto-create on `CONFIRMED`                                          | TEST-CHAT-040 / 086                      | U + WS       |
| 011   | System message (`message_type: 'SYSTEM'`)                           | TEST-CHAT-040 / 086 / 151                | U + WS + F   |
| 012   | In-transaction with status update; rollback on insert failure       | TEST-CHAT-041                            | U            |
| 013   | `conversation_created` WS broadcast                                 | TEST-CHAT-086                            | WS           |
| 020   | `join_conversation` participant check                               | TEST-CHAT-081                            | WS           |
| 021   | 10/10s rate limit on `send_message` + REST send                     | TEST-CHAT-030 / 073 / 083                | U + E2E-B + WS |
| 022   | Handshake validates Account.status + email_verified                 | TEST-CHAT-072 / 080                      | E2E-B + WS   |
| 023   | Server-authoritative `new_message` + `client_id` reconciliation     | TEST-CHAT-082 / 115                      | WS + F       |
| 030   | WS `send_message` event                                             | TEST-CHAT-082 / 084                      | WS           |
| 031   | `typing:start` / `typing:stop` re-broadcast                         | TEST-CHAT-085 / 116 / 117 / 222          | WS + F + PW  |
| 032   | Mark-read auto-fires on mount + per-incoming-message                | TEST-CHAT-118                            | F            |
| 033   | Mark-read throttled to 1/2s                                         | TEST-CHAT-119                            | F            |
| 040   | `POST /conversations/:id/attachments` + MIME / size validation      | TEST-CHAT-020 / 075                      | U + E2E-B    |
| 041   | Attachment ownership + `message_id IS NULL` check                   | TEST-CHAT-021 / 076                      | U + E2E-B    |
| 042   | `file_url` retrieval                                                | TEST-CHAT-077 / 230                      | E2E-B + PW   |
| 043   | Eager `attachments[]` on `GET /:id/messages`                        | TEST-CHAT-077                            | E2E-B        |
| 050   | Inbox layout + `<ConversationListItem>` reuse                       | TEST-CHAT-102                            | F            |
| 051   | Sort by `last_message_at desc` + empty state                        | TEST-CHAT-103 / 104                      | F            |
| 052   | "New conversation" form removed                                     | TEST-CHAT-101 / 201                      | F + PW       |
| 053   | Zero `<pre>{JSON.stringify}</pre>` on chat surface                  | TEST-CHAT-100 / 122 / 201                | F + PW       |
| 060   | Conversation page header (collab pill or "Direct message")          | TEST-CHAT-110                            | F            |
| 061   | Virtualization + day separators + 60s sender grouping               | TEST-CHAT-111 / 112 / 120 / 150          | F            |
| 062   | Composer auto-resize, Enter/Shift+Enter, attachments                | TEST-CHAT-113 / 114 / 140 / 141          | F            |
| 063   | Optimistic send + reconcile + retry + 3-attempt discard             | TEST-CHAT-115 / 152 / 221                | F + PW       |
| 064   | Typing indicator emit (debounce / blur / send) + receive (3s timeout) | TEST-CHAT-116 / 117 / 222              | F + PW       |
| 065   | Mark-read on visibility (visible / hidden)                          | TEST-CHAT-118                            | F            |
| 066   | "Seen" indicator                                                    | TEST-CHAT-121                            | F            |
| 067   | Failed-bubble retry + 3-attempt discard                             | TEST-CHAT-115                            | F            |
| 070   | AppShell unread badge initial + live update                         | TEST-CHAT-130 / 131 / 132 / 240          | F + PW       |
| 071   | Live-dot pulse on `new_message` while off-/inbox                    | TEST-CHAT-133                            | F            |
| 080   | All errors via `parseApiError()`; no raw `error.message`            | TEST-CHAT-115 (failed path) / 142 / 143  | F            |
| 081   | `<AuthBanner>` + send disabled on EMAIL_NOT_VERIFIED / ACCOUNT_NOT_ACTIVE | TEST-CHAT-072 / 142 / 143           | E2E-B + F    |
| 082   | `<Protected>` redirect for unauthed routes                          | (covered by `tests-auth-flow`; no duplication) | -      |
| 083   | Non-participant `/inbox/:id` → EmptyState 404                       | TEST-CHAT-071 (backend 403) + (frontend covered by route smoke in PW-200) | E2E-B + PW |
| 090   | `lint:tokens` clean                                                 | (manual + repo-level lint job; no per-feature test) | -    |
| 091   | `vite build` clean + light/dark + 375 px                            | (manual smoke per `web/CLAUDE.md`; no per-feature test) | - |
| 092   | Reuse existing primitives                                           | (locked by `lint:tokens` + design-system review; no per-feature test) | - |
| 100   | Tests counterpart exists                                            | (this file proves it)                    | -            |

## Edge Case → Test

| Edge Case                                                | Test(s)                       | Layer  |
| -------------------------------------------------------- | ----------------------------- | ------ |
| Collab rejected after thread created → read-only banner  | (covered by parent spec edge case + `TEST-CHAT-072` send rejection on bad state — frontend banner asserted by route smoke; explicit test deferred to followup if regressed) | E2E-B |
| Collab deleted → `collaboration_id` SET NULL             | TEST-CHAT-110 (Direct-message rendering) | F      |
| User loses verification mid-session                      | TEST-CHAT-080 / 142           | WS + F |
| Both parties type simultaneously                         | TEST-CHAT-085 (sender excluded from own typing) | WS |
| Network partition mid-send                               | TEST-CHAT-115 / 221           | F + PW |
| Send while disconnected                                  | TEST-CHAT-221                 | PW     |
| Attachment uploaded, message never sent                  | TEST-CHAT-020 (row exists, message_id NULL) | U |
| Counterparty suspended                                   | TEST-CHAT-072                 | E2E-B  |
| Two tabs on the same thread (mark-read throttle)         | TEST-CHAT-119                 | F      |
| Race: confirm + retry-confirm                            | TEST-CHAT-040 / 086           | U + WS |

## Cross-feature coverage updates (not new tests, but updates to existing)

- **`tests-collaborations-polish` `TEST-COLLAB-114` (chat summary card)**: updated by this feature to assert the new deep-link `/inbox/:conversationId` and the per-collab unread badge. The card-renders-unconditionally assertion stays; the new assertion lives alongside it.
- **`tests-jobs-applications` accept-flow**: `TEST-CHAT-210` exercises the Jobs accept → confirm → chat-thread-appears path end-to-end. The Jobs side does not change; the Chat side asserts the seam works.
