# Spec

## Summary

Lock the Chat feature (`tasks/product/chat/`) behind an automated test suite. Covers backend unit tests for `backend/src/conversation/` (none exist today), backend e2e tests against a real Postgres + the real Socket.IO `/chat` namespace driven via `socket.io-client` in a Testcontainer-booted Nest app, frontend unit tests for the rebuilt inbox + thread page and every new component (`<Composer>`, `<MessageList>`, `<TypingIndicator>`, `<AttachmentChip>`, `<UnreadBadge>`), and Playwright e2e tests for the cross-page flows (collab confirm → auto-created thread → deep-link from `/collaborations/:id` to `/inbox/:conversationId`, send / receive, attachment upload, unread-badge live update).

Each `CHAT-NNN` requirement and each Edge Case from the parent spec gets at least one asserting test. Backend unit + e2e tests for the existing-but-untested `backend/src/conversation/` module land at the same time, because shipping new chat behaviour on top of an unprotected gateway is a no-go (same logic that drove `tests-collaborations-polish` to backfill collaboration-module backend tests).

This is the **first feature in the repo** that drives the `/chat` Socket.IO namespace under test. A WS test harness (`backend/test/util/ws-client.ts`) is added in this feature and reused by every subsequent feature that emits or consumes WS events.

Test IDs are `TEST-CHAT-NNN` so they can be referenced from commits and PRs. Where a test maps directly to a `CHAT-NNN` requirement, the source ID is cited in the test description so a failure points at the broken spec clause.

## Problem

Chat ships ~40 requirements, 10 edge cases, and 14 acceptance scenarios on top of a backend with **zero existing test coverage** (no `conversation.service.spec.ts`, no `conversation.e2e-spec.ts`, no `chat.gateway.spec.ts`) and on top of a known security gap on the `/chat` Socket.IO gateway (`join_conversation` joins any room without a participant check). The full failure context lives in `brief.md`; the short version:

- WS authorisation is invisible to HTTP tooling. Without a real-socket harness, the `join_conversation` participant-check fix (`CHAT-020`) ships on faith.
- The `Collaboration → Conversation` auto-create seam (`CHAT-010..CHAT-013`) is the cross-module wire that makes "click Confirm → land on a real chat" work end-to-end. A regression on either side is a silent UX failure.
- The optimistic-send reconciliation (`CHAT-053` + `CHAT-063`) — `client_id` round-trip — is the highest-value invariant of any chat UI. Locking it is the suite's job.
- The `MessageAttachment` ownership rule (`CHAT-041`) is a privilege-escalation surface; without an e2e test, "cross-user attachment hijack" is undetectable.
- The 10/10s rate limit on `send_message` (`CHAT-021`) is a token-bucket; without a test, future "let's bump it" PRs ship unchallenged.
- The "no `<pre>{JSON.stringify(...)}</pre>`" guardrail (`CHAT-053`) is the same anti-debug-page protection used by `tests-collaborations-polish`.
- Mark-read on visibility (`CHAT-065`) under fake timers + visibility events is a small surface but high-regret if it breaks (silent unread-badge stuckness).

## Goals

- Run `npm test` and `npm run test:e2e` per package and exercise the entire Chat surface end-to-end.
- Make every `CHAT-NNN` requirement and every Edge Case from the parent spec fail-loud if it regresses.
- Use the existing tests-* tooling unchanged where possible. New additions limited to: a WS-client harness for the backend e2e suite, a thin socket-mock for the frontend unit suite, an in-memory storage stub for attachments if not already present.
- Mock external services (mail, storage). Real WS handshake at the backend e2e layer; mocked socket at the frontend unit layer.
- Keep the suite local-runnable; do not couple to any CI provider in this feature.

## Non-goals

- CI / CD wiring (separate task).
- Performance / load testing (no Artillery / k6 / wrk against the WS namespace; no soak test).
- Visual regression of the inbox / thread.
- Mutation testing.
- Replacing the manual `lint:tokens` / dark-mode / 375 px smoke checklists in PR reviews.
- Tests for **real** Stripe-Connect escrow, voice / video, group chat, message reactions, threads, edit / delete, presence beyond typing, push notifications, search, or public-profile cold DM. All explicit non-goals of the parent feature; covered by their own future test folders when those features ship.
- Re-testing Auth invariants (covered by `tests-auth-flow`), Profiles primitives (covered by `tests-profiles`), Jobs primitives (covered by `tests-jobs-applications`), or the Collaborations COLLAB-NNN surface (covered by `tests-collaborations-polish`). Chat tests stub or reuse them.
- The chat-summary-card-on-collab-detail-page tests already shipped in `tests-collaborations-polish` `TEST-COLLAB-114` — this feature updates them (deep-link target + per-collab unread) rather than duplicating.

## User Flow

Not applicable — the "users" are developers running `npm test` and AI agents reasoning about Chat invariants.

## Test surfaces

Reuses the layers and tooling established by prior tests-* features, plus a new WS layer:

1. **Backend unit tests** — `*.spec.ts` colocated under `backend/src/conversation/` and `backend/src/collaboration/` (for the auto-create seam). Prisma is deep-mocked with `jest-mock-extended`. No Postgres touched. The WS gateway is unit-tested with a stubbed `Server` instance for behaviour that can be asserted without a real handshake (rate-limit token-bucket, payload validation, room-name composition).
2. **Backend e2e tests** — `*.e2e-spec.ts` under `backend/test/`. Boots `AppModule` against a Postgres Testcontainer. REST is driven via Supertest (existing). **WS is driven via the new `backend/test/util/ws-client.ts` helper** — `socket.io-client` connecting to the booted Nest app on its `/chat` namespace, JWT in the handshake. Real handshake, real rooms, real adapter (in-memory mode is fine for tests; the Redis adapter is wired but not required for assertions).
3. **Frontend unit tests** — `*.test.ts(x)` colocated under `web/src/`. Vitest + jsdom + RTL + MSW v2 + `web/src/test/socket-mock.ts`. The socket mock exposes `__triggerEvent(name, payload)` so tests can simulate inbound `new_message` / `message_read` / `typing:start` events.
4. **Frontend e2e tests** — `*.spec.ts` under `web/e2e/`. Playwright drives Chromium against the real Vite dev server plus the real backend boot established by `tests-auth-flow`. The WS layer is **real** here — Playwright drives two browser contexts (Page A + Page B) so receive-flows can be asserted end-to-end without a mock.

## Requirements

Conventions: each requirement has a stable ID `TEST-CHAT-NNN`. **Must** = blocks shipping this feature. **Should** = strongly preferred. Cross-references to the parent spec use `CHAT-NNN`. Cross-references to Auth / Profiles / Jobs / Collaborations use their respective IDs.

### 1. Tooling

- **TEST-CHAT-001 (Must).** No new test runners or libraries beyond the existing tests-* baseline. Allowed additions: `socket.io-client` (already a transitive dep — verify; if not, add as devDep), nothing else.
- **TEST-CHAT-002 (Must).** New `backend/test/util/ws-client.ts`:
  - `connectChatClient(opts: { app: INestApplication, accountId: bigint, secret?: string }): Promise<Socket>` — signs a JWT for the given account using the test JWT secret, opens a `socket.io-client` connection to the app's `/chat` namespace, returns the connected client.
  - Cleanup helper `disconnectAll(clients: Socket[])` for `afterEach`.
  - **No** mock-socket / fake handshake — this drives the real gateway.
- **TEST-CHAT-003 (Must).** Extend `backend/test/util/factories.ts`:
  - `seedConversation({ collaborationId?, participantAccountIds: bigint[], lastMessageAt? })` — persists `Conversation` + N `ConversationParticipant` rows. Validates `participantAccountIds.length === 2` (group chat is out of scope).
  - `seedMessage({ conversationId, senderId, content?, messageType?, metadata?, createdAt? })`.
  - `seedMessageAttachment({ messageId?, uploadedById, fileUrl?, mimeType?, sizeBytes?, originalName? })` — `messageId?` left null lets tests exercise the "uploaded but unattached" path.
- **TEST-CHAT-004 (Must).** Extend `web/src/test/factories.ts`:
  - `mockConversation(overrides?)` — shape compatible with `GET /conversations/:id` and rows in `GET /conversations`.
  - `mockMessage(overrides?)` — defaults `message_type: 'TEXT'`, `metadata: {}`, `attachments: []`.
  - `mockMessageAttachment(overrides?)` — defaults `mime_type: 'image/png'`, `size_bytes: 12_345`, `original_name: 'test.png'`.
  - `mockInboxItem(overrides?)` — the row shape returned by `GET /conversations` (with `conversation`, `other_participant`, `last_message`, `unread_count`).
- **TEST-CHAT-005 (Must).** Add `web/src/test/handlers/conversations.ts` — MSW v2 handlers for `POST /conversations`, `GET /conversations`, `GET /conversations/unread-count`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`, `PATCH /conversations/:id/read`, `POST /conversations/:id/attachments`. Per-test override pattern matches `tests-collaborations-polish`.
- **TEST-CHAT-006 (Must).** Add `web/src/test/socket-mock.ts`:
  - Exports a `MockSocket` class with `emit` / `on` / `off` / `connected` / `disconnect` and a test-only `__triggerEvent(name, payload)`.
  - Exports `installSocketMock()` / `restoreSocketMock()` for `beforeEach` / `afterEach`.
  - The hook the inbox / thread page uses to obtain a socket (`useChatSocket()` or whatever the implementation lands on) must be swappable so tests can inject the mock — assert this seam exists when the production code lands.
- **TEST-CHAT-007 (Should).** Add `backend/test/util/storage-stub.ts` if it does not already exist (it likely does — `JobAttachment` upload tests need it). In-memory key→buffer map; `file_url` returns a `mock://attachments/<id>` URL.

### 2. Backend unit tests (mocked Prisma + stubbed Server)

#### `conversation.service.spec.ts` (new file)

- **TEST-CHAT-010 (Must).** `startConversation()` (`backend/src/conversation/conversation.service.ts:95-178`):
  - Sender + recipient are different → creates `Conversation` + 2 participants + first `Message`. Assert `last_message_at` set to the message's `created_at`.
  - Sender === recipient → `BadRequestException('Cannot start a conversation with yourself')`.
  - Recipient missing → `NotFoundException('Recipient not found')`.
  - Existing direct conversation between same two accounts → reuses the conversation, appends the new message, no new participants.
  - `metadata` is a Prisma `InputJsonValue` round-trip (object in, JsonValue out).
  - `message_type` defaults to `'TEXT'` when omitted.
- **TEST-CHAT-011 (Must).** `getInbox()`:
  - Sorts by `conversation.last_message_at desc`.
  - Computes `unread_count` per row using `last_read_at` (null → all messages count).
  - Pagination respects `page` / `limit` (defaults 1 / 20).
  - `other_participant` is the sole non-self participant.
- **TEST-CHAT-012 (Must).** `getMessages()`:
  - Asserts participant via `assertParticipant()`; non-participant → `ForbiddenException`.
  - `before` cursor filters strictly older messages.
  - Mark-read updates `last_read_at` on the participant row to `now()`.
  - Pagination respects `page` / `limit` (defaults 1 / 50; max 100).
- **TEST-CHAT-013 (Must).** `sendMessage()`:
  - Asserts participant; non-participant → `ForbiddenException`.
  - Persists message + bumps `conversation.last_message_at` in one transaction.
  - Calls `chatGateway.emitNewMessage(conversationId, msg)` exactly once.
- **TEST-CHAT-014 (Must).** `markRead()`:
  - Updates `last_read_at` to `now()`.
  - Emits `message_read` via gateway.
- **TEST-CHAT-015 (Must).** `getUnreadCount()`:
  - Sum across all participant rows.
  - `last_read_at === null` → counts every message in the conversation.

#### `conversation.service.attachments.spec.ts` (new file, scoped to attachment paths added by this feature — `CHAT-040..CHAT-043`)

- **TEST-CHAT-020 (Must).** `uploadAttachment()` (new method):
  - Valid MIME (`image/png`, `image/jpeg`, `image/webp`, `image/gif`, `application/pdf`) + valid size → persists `MessageAttachment` row with `message_id = null`.
  - Image > 10 MB → `BadRequestException('FILE_TOO_LARGE')`.
  - PDF > 25 MB → `BadRequestException('FILE_TOO_LARGE')`.
  - MIME `application/zip` → `BadRequestException('INVALID_MIME_TYPE')`.
  - MIME `text/html` → `BadRequestException('INVALID_MIME_TYPE')`.
- **TEST-CHAT-021 (Must).** `sendMessage()` extended for attachments:
  - `attachment_ids: []` → no attachment binding.
  - `attachment_ids: [valid id owned by sender, message_id = null]` → updates the row to point at the new message.
  - `attachment_ids` with an id owned by **another user** → `ForbiddenException('ATTACHMENT_FORBIDDEN')`.
  - `attachment_ids` with an id whose `message_id IS NOT NULL` → `BadRequestException('ATTACHMENT_ALREADY_USED')`.
  - `attachment_ids` with a missing id → `NotFoundException('ATTACHMENT_NOT_FOUND')`.

#### `chat.gateway.spec.ts` (new file)

- **TEST-CHAT-030 (Must).** Rate-limit token bucket (`CHAT-021`):
  - 10 messages within 10 s → all accepted.
  - 11th message within 10 s → rejected with `error: { code: 'RATE_LIMITED' }`.
  - After 10 s of no events, bucket refills.
  - Per-socket isolation: socket A's bucket does not affect socket B.
- **TEST-CHAT-031 (Should).** Room name composition (`conv:${conversationId}`) is stable — assert via the gateway's emit helper.
- **TEST-CHAT-032 (Should).** `accountToSockets` map mutates correctly on connect / disconnect; multi-tab (same account, two sockets) is supported.

#### `collaboration.service.spec.ts` extension (existing file from `tests-collaborations-polish`, extended for `CHAT-010..CHAT-013`)

- **TEST-CHAT-040 (Must).** Auto-create on confirm:
  - `PATCH /collaborations/:id/status` with `status: 'CONFIRMED'` from a `PENDING` collab → creates exactly one `Conversation` row with `collaboration_id` set + 2 `ConversationParticipant` rows. Assert via the unit-mocked `prisma.conversation.create.mock.calls`.
  - Calling the same transition a second time (e.g. from `DISPUTED → CONFIRMED` later) does **not** create a second conversation — the existing row is reused.
  - Inserts a system message with `message_type: 'SYSTEM'`, `sender_id` set to the user who triggered the confirm, content matching the parent-spec wording.
  - All operations run inside the **same** Prisma `$transaction` as the status update — assert by stubbing `prisma.$transaction` and checking the conversation creation happens inside its callback.
  - Emits `conversation_created` via the gateway to both participants.
- **TEST-CHAT-041 (Must).** Auto-create rollback:
  - If the conversation insert fails (simulate by making `prisma.conversation.create` throw), the status transition rolls back — assert via the transaction callback rejecting and the collab status remaining `PENDING`.

### 3. Backend e2e tests (Testcontainer Postgres + real `/chat` namespace)

#### `conversation.e2e-spec.ts` (new file — REST surface)

- **TEST-CHAT-070 (Must).** Happy-path direct conversation:
  - Verified worker A `POST /conversations` with verified worker B as recipient + first message → 201.
  - `GET /conversations` for A returns one row with B as `other_participant`.
  - `GET /conversations/:id/messages` returns the seeded message.
  - `PATCH /conversations/:id/read` updates `last_read_at`; subsequent `GET /conversations/unread-count` returns 0 for A.
- **TEST-CHAT-071 (Must).** Non-participant `GET /conversations/:id/messages` → 403.
- **TEST-CHAT-072 (Must).** AccountStateGuard on send paths (`CHAT-022`):
  - `PENDING_EMAIL_VERIFICATION` worker → 403 `EMAIL_NOT_VERIFIED` on `POST /conversations` and `POST /conversations/:id/messages`.
  - Suspended account → 403 `ACCOUNT_NOT_ACTIVE` on the same endpoints.
- **TEST-CHAT-073 (Must).** REST rate limit (`CHAT-021`):
  - 10 `POST /conversations/:id/messages` within 10 s → all 200.
  - 11th within 10 s → 429.
- **TEST-CHAT-074 (Must).** Pagination cursor semantics:
  - `GET /conversations/:id/messages?before=<iso>` returns only messages strictly older than the cursor.
  - Page-based fallback (`page=1&limit=50`) still works alongside cursor.
- **TEST-CHAT-075 (Must).** Attachment upload (`CHAT-040`):
  - Valid PNG ≤ 10 MB → 201 with `MessageAttachment` row, `message_id = null`.
  - PNG > 10 MB → 400 `FILE_TOO_LARGE`.
  - `application/zip` → 400 `INVALID_MIME_TYPE`.
  - PDF ≤ 25 MB → 201; PDF > 25 MB → 400.
- **TEST-CHAT-076 (Must).** Attachment binding (`CHAT-041`):
  - `POST /conversations/:id/messages` with `attachment_ids` containing an id owned by the sender → 201, attachment row's `message_id` updated.
  - Same call with an id owned by **another participant** → 403 `ATTACHMENT_FORBIDDEN`.
  - Same call with an already-used id → 400 `ATTACHMENT_ALREADY_USED`.
- **TEST-CHAT-077 (Should).** Attachment retrieval:
  - `GET /conversations/:id/messages` includes `attachments[]` with `file_url`, `mime_type`, `original_name`, `size_bytes` per attached message.

#### `chat.gateway.e2e-spec.ts` (new file — WS surface, drives the real namespace)

- **TEST-CHAT-080 (Must).** Handshake (`CHAT-022`):
  - Connecting with no `auth.token` → disconnect.
  - Connecting with an invalid token → disconnect.
  - Connecting with a token for an `Account.status !== 'ACTIVE'` account → disconnect.
  - Connecting with a token for `email_verified !== true` account → disconnect.
  - Connecting with a valid verified-active token → stays connected; auto-joins all `ConversationParticipant` rooms for the account.
- **TEST-CHAT-081 (Must).** `join_conversation` participant check (`CHAT-020`) — **closes the existing security gap**:
  - Participant emits `join_conversation { conversation_id }` → joins the room (verify via `server.sockets.adapter.rooms`).
  - **Non-participant** emits `join_conversation { conversation_id }` → no-op (verify the socket did **not** join the room and does **not** receive the next `new_message` emitted to it).
  - Verify the rejection is silent (no error event emitted) to avoid id-enumeration.
- **TEST-CHAT-082 (Must).** `send_message` happy path:
  - Two clients (A and B) joined to the same conversation room.
  - A emits `send_message { conversation_id, client_id, content }`.
  - B receives `new_message` with the persisted message + the same `client_id`.
  - A also receives `new_message` (server-authoritative; reconciliation by `client_id`).
- **TEST-CHAT-083 (Must).** `send_message` rate limit (`CHAT-021`):
  - 10 emits within 10 s → all delivered.
  - 11th emit within 10 s → A receives `error { code: 'RATE_LIMITED' }`; B does **not** receive `new_message` for it.
- **TEST-CHAT-084 (Must).** `send_message` non-participant:
  - C connects, never participates in the conversation, emits `send_message` for that conversation_id → server emits `error { code: 'FORBIDDEN' }`; A and B receive nothing.
- **TEST-CHAT-085 (Must).** `typing:start` / `typing:stop` (`CHAT-031`):
  - A emits `typing:start` → B receives `typing:start { conversation_id, account_id: A }`. A does **not** receive its own event.
  - A emits `typing:stop` → B receives `typing:stop`.
  - Non-participant C emits `typing:start` for the conversation → B receives **nothing**.
- **TEST-CHAT-086 (Must).** Auto-create seam end-to-end (`CHAT-010..CHAT-013`):
  - Both A and B are connected to the WS namespace.
  - C (employer-initiator) created a `PENDING` collab between A (worker) and B is irrelevant — re-set: A is initiator, B is responder.
  - B `PATCH /collaborations/:id/status { status: 'CONFIRMED' }` over REST.
  - Both A and B receive `conversation_created { conversation_id, collaboration_id }` over WS within 1 s.
  - `GET /conversations/:conversation_id/messages` returns the system message with `message_type: 'SYSTEM'`.
- **TEST-CHAT-087 (Should).** Sticky-session-free read:
  - With Redis-adapter mode disabled (in-memory), all assertions still pass on a single Nest instance — the suite explicitly does not require Redis to be running.
- **TEST-CHAT-088 (Should).** `message_read` broadcast:
  - A emits `PATCH /conversations/:id/read` over REST.
  - B receives `message_read { conversation_id, account_id: A, last_read_at }` over WS.

### 4. Frontend unit tests (Vitest + RTL + MSW + socket-mock)

#### `InboxPage.test.tsx` (rebuilt page — `CHAT-050..CHAT-053`)

- **TEST-CHAT-100 (Must).** Zero JSON dumps (`CHAT-053`):
  - Component renders, `screen.queryByText(/JSON/)` is null.
  - No `<pre>` element with stringified JSON anywhere in the tree.
  - No "Last action response" / "Recipient account ID" text anywhere in the tree (grep on the exact strings from the legacy debug page).
- **TEST-CHAT-101 (Must).** No "New conversation" form (`CHAT-052`):
  - `screen.queryByLabelText(/Recipient account ID/i)` is null.
  - `screen.queryByRole('button', { name: /Start.*conversation/i })` is null on the inbox page.
- **TEST-CHAT-102 (Must).** Conversation list rendering (`CHAT-050`):
  - MSW returns 3 inbox items (one collab-bound, one direct, one with unread > 0).
  - `<ConversationListItem>` rendered 3 times.
  - The collab-bound row renders a `<CollaborationStatusBadge>` (or equivalent) with the collab status pill.
  - The direct row renders no collab pill.
  - The unread row renders the unread badge with the unread count.
- **TEST-CHAT-103 (Must).** Empty state (`CHAT-051`):
  - MSW returns `[]` → `<EmptyState>` with title "No conversations yet" and the parent-spec copy.
- **TEST-CHAT-104 (Should).** Sort order:
  - Three items returned in `last_message_at desc` order render top-to-bottom in that order.

#### `ConversationPage.test.tsx` (`CHAT-060..CHAT-067`)

- **TEST-CHAT-110 (Must).** Header (`CHAT-060`):
  - Collab-bound conversation → header renders counterparty chip + collab status pill + `View collaboration ↗` link with `href="/collaborations/<id>"`.
  - Direct conversation → header renders counterparty chip + "Direct message" subtitle. No collab pill, no link.
- **TEST-CHAT-111 (Must).** Day separators (`CHAT-061`):
  - Three messages: one yesterday, two today → exactly two day separators rendered ("Yesterday" + "Today").
  - All three messages from today → exactly one separator ("Today").
  - Messages spanning a calendar week → "Mon 5 May", "Tue 6 May", etc. headers.
- **TEST-CHAT-112 (Must).** Sender grouping (`CHAT-061`):
  - Two consecutive messages from sender A within 60 s → second bubble has no avatar / timestamp on its own row (grouped).
  - Two consecutive messages from sender A 61 s apart → both bubbles render avatar / timestamp.
  - Sender alternation A → B → A → both A bubbles render full chrome (B in between resets the group).
- **TEST-CHAT-113 (Must).** Composer Enter / Shift+Enter (`CHAT-062`):
  - Type "hello", press Enter → calls send handler with content `"hello"`. Composer clears.
  - Type "line1", Shift+Enter, "line2" → composer value is `"line1\nline2"`; no send.
  - Composer is a `<Textarea>` that auto-resizes; height changes between empty and 8-line content.
- **TEST-CHAT-114 (Must).** Composer attachments (`CHAT-062`):
  - Click paperclip → opens hidden `<input type="file" multiple>`.
  - Drop a 1 MB PNG onto the composer → calls `POST /conversations/:id/attachments`; in-flight chip renders.
  - Drop a 50 MB PDF → no upload starts; inline error "PDF must be ≤ 25 MB".
  - Drop a `application/zip` → no upload starts; inline error "Only images and PDFs are supported".
- **TEST-CHAT-115 (Must).** Optimistic send + reconcile (`CHAT-063`):
  - User submits "hi" → optimistic bubble appears with `status: 'sending'` and a generated `client_id`.
  - Socket-mock fires `__triggerEvent('new_message', { ...persistedMsg, client_id: <same> })` → optimistic bubble is reconciled (no duplicate; `status` becomes `sent`).
  - MSW returns 500 on `POST /conversations/:id/messages` → optimistic bubble flips to `status: 'failed'`; `Retry` button rendered.
  - Click `Retry` → re-sends with the **same** `client_id`; on success the bubble reconciles.
  - After 3 failed attempts, `Discard` button rendered next to `Retry`; click `Discard` → bubble removed from local state.
- **TEST-CHAT-116 (Must).** Typing indicator emit (`CHAT-064`):
  - Use Vitest fake timers.
  - Type "h" → no `typing:start` emit yet (debounce).
  - Advance 300 ms → exactly one `typing:start` emit on the socket-mock.
  - Type "e" within 3 s → no additional emit (still typing).
  - Stop typing, advance 3 s → exactly one `typing:stop` emit.
  - Press Enter to send → `typing:stop` emitted before the send (no orphan typing).
  - Blur the composer → `typing:stop` emitted.
- **TEST-CHAT-117 (Must).** Typing indicator receive (`CHAT-064`):
  - Socket-mock fires `__triggerEvent('typing:start', { conversation_id, account_id: <other> })` → "Counterparty is typing…" row renders above the composer.
  - Advance 3 s without further events → row clears (auto-timeout).
  - Receive a second `typing:start` within the timeout → row stays; timer resets.
  - Receive `typing:stop` → row clears immediately.
- **TEST-CHAT-118 (Must).** Mark-read on visibility (`CHAT-065`):
  - `document.visibilityState === 'visible'` on mount → exactly one `PATCH /conversations/:id/read` call.
  - `document.visibilityState === 'hidden'` on mount → **zero** calls.
  - After mount, fire `visibilitychange` to `visible` → one call.
  - Receive `new_message` while visible → one additional call.
  - Receive `new_message` while hidden → **zero** additional calls.
- **TEST-CHAT-119 (Must).** Mark-read throttle (`CHAT-033`):
  - Use fake timers.
  - Receive 5 `new_message` events within 1 s while visible → exactly **one** `PATCH …/read` call.
  - Advance 2 s, receive another → second call fires.
- **TEST-CHAT-120 (Must).** Auto-scroll behaviour (`CHAT-061` user-flow #6):
  - Scroll position pinned to bottom → incoming `new_message` → list scrolls to bottom automatically.
  - Scroll position 500 px from bottom → incoming `new_message` → list does **not** scroll; "New messages ↓" pill renders.
  - Click the pill → scrolls to bottom.
- **TEST-CHAT-121 (Should).** "Seen" indicator (`CHAT-066`):
  - Other participant's `last_read_at` ≥ own most-recent message's `created_at` → "Seen" rendered under the message.
  - Other participant's `last_read_at` < own message's `created_at` → no "Seen".
  - Live update on `message_read` event.
- **TEST-CHAT-122 (Must).** No JSON dump (`CHAT-053`):
  - `screen.queryByText(/JSON/)` null.
  - No `<pre>` with stringified JSON anywhere on the conversation page.

#### `AppShell.unread.test.tsx` (`CHAT-070..CHAT-071`)

- **TEST-CHAT-130 (Must).** Initial load:
  - `GET /conversations/unread-count` returns `{ total: 3 }` → Inbox nav badge renders "3".
  - Returns `{ total: 0 }` → badge hidden.
- **TEST-CHAT-131 (Must).** Live update via socket-mock:
  - Initial total 0; fire `__triggerEvent('new_message', ...)` → component refetches `unread-count` → badge becomes "1".
  - Fire `__triggerEvent('message_read', ...)` → component refetches → badge updates / disappears.
- **TEST-CHAT-132 (Must).** Re-fetch on focus:
  - Window blur → no fetch.
  - Window focus → exactly one `GET /conversations/unread-count`.
- **TEST-CHAT-133 (Should).** Live dot (`CHAT-071`):
  - `new_message` while user is on a non-`/inbox` route → small dot indicator pulses (animation class added then removed).
  - Same event while user is on `/inbox` → no pulse (already in context).

#### `Composer.test.tsx` (component-level, scoped to `CHAT-062..CHAT-063`)

- **TEST-CHAT-140 (Must).** Send button disabled when composer empty AND no attachments.
- **TEST-CHAT-141 (Must).** Send button enabled with attachments only (text optional when at least one attachment).
- **TEST-CHAT-142 (Must).** `<AuthBanner kind="EMAIL_NOT_VERIFIED">` rendered + send button disabled when `useAccountMe()` returns `email_verified: false` (`CHAT-081`).
- **TEST-CHAT-143 (Must).** `<AuthBanner kind="ACCOUNT_NOT_ACTIVE">` rendered + send button disabled when `account.status !== 'ACTIVE'` (`CHAT-081`).

#### `MessageList.test.tsx` (component-level virtualization — `CHAT-061`)

- **TEST-CHAT-150 (Must).** Virtualization smoke:
  - Render with 1000 messages → DOM contains far fewer than 1000 message-bubble nodes (assert < 100 — implementation dependent on overscan; lock the order of magnitude, not the exact number).
  - Scrolling to top triggers infinite-scroll fetch via the `before` cursor.
- **TEST-CHAT-151 (Must).** System message rendering (`CHAT-051` / `CHAT-011`):
  - `message_type: 'SYSTEM'` → centred grey pill, no sender chip, no avatar, no timestamp on the bubble.
- **TEST-CHAT-152 (Must).** Failed-bubble UI (`CHAT-063`):
  - `status: 'failed'` → bubble renders with a danger-tinted border, "Failed to send" copy, `Retry` button.

### 5. Frontend e2e tests (Playwright)

#### `inbox-list.e2e.spec.ts`

- **TEST-CHAT-200 (Must).** Verified worker logs in, navigates to `/inbox`, sees three seeded conversations sorted by `last_message_at desc`, opens the most recent one, sees the seeded messages.
- **TEST-CHAT-201 (Must).** No JSON / no debug input on `/inbox`:
  - `await expect(page.locator('text=/JSON/i')).toHaveCount(0)`.
  - `await expect(page.locator('text=/Recipient account ID/i')).toHaveCount(0)`.
  - `await expect(page.locator('text=/Last action response/i')).toHaveCount(0)`.
- **TEST-CHAT-202 (Should).** No Stripe / payment buttons on `/inbox` or `/inbox/:id`:
  - `await expect(page.locator('button:has-text(/Fund/i)')).toHaveCount(0)`.
  - `await expect(page.locator('button:has-text(/Pay/i)')).toHaveCount(0)`.
  - `await expect(page.locator('button:has-text(/Stripe/i)')).toHaveCount(0)`.

#### `collab-confirm-creates-thread.e2e.spec.ts`

- **TEST-CHAT-210 (Must).** End-to-end auto-create (`CHAT-010..CHAT-013`):
  - Worker A and Employer B both logged in (two browser contexts).
  - B accepts a job application from A and converts to a `PENDING` collab via the existing Jobs flow.
  - A clicks `Confirm` on `/collaborations/:id` (worker is responder in this fixture).
  - Within 2 s, the chat summary card on `/collaborations/:id` updates to show `Open chat →` linking to `/inbox/<conversation_id>`.
  - A clicks the link → lands on `/inbox/<id>` → sees the system message "Collaboration confirmed. You can now message each other about the project.".
  - B's other browser context — open on `/inbox` already — sees the new conversation appear at the top of the list within 2 s with unread = 1.

#### `send-receive.e2e.spec.ts`

- **TEST-CHAT-220 (Must).** Real WS send / receive across two browser contexts:
  - A and B both on `/inbox/<id>` for the same conversation.
  - A types and sends "Hello B" → bubble appears in A's UI in < 100 ms (optimistic).
  - B's UI receives the bubble within 2 s.
  - A's bubble transitions from `sending` to `sent`.
  - B's unread badge decrements to 0 once A sends (B is the active viewer; mark-read fires).
- **TEST-CHAT-221 (Must).** Send while disconnected:
  - Use Playwright `page.context().setOffline(true)`.
  - A submits "I'm offline" → bubble flips to `failed` immediately.
  - Restore online → click `Retry` → bubble transitions to `sent`.
- **TEST-CHAT-222 (Should).** Typing indicator across two contexts:
  - A starts typing → B's UI shows "<A's display name> is typing…" within 1 s.
  - A stops typing for 3 s → row clears.

#### `attachments.e2e.spec.ts`

- **TEST-CHAT-230 (Must).** Upload + send a small PNG:
  - A drops a 100 KB PNG on the composer → in-flight chip renders → upload completes.
  - A submits with text "see image" → bubble renders the message text + a thumbnail of the image.
  - B's UI receives the bubble + thumbnail.
  - Click the thumbnail → opens the image (`<a target="_blank">` to `file_url`).
- **TEST-CHAT-231 (Must).** Reject oversize PNG:
  - A drops an 11 MB PNG → no upload starts; inline error "Image must be ≤ 10 MB".
- **TEST-CHAT-232 (Should).** Reject `application/zip`:
  - A drops a `.zip` → inline error "Only images and PDFs are supported".

#### `unread-badge.e2e.spec.ts`

- **TEST-CHAT-240 (Must).** Live unread badge across pages:
  - A is on `/jobs` (not `/inbox`).
  - B sends a message to A.
  - A's AppShell Inbox nav badge increments to 1 within 2 s.
  - A clicks the Inbox nav → badge clears once the conversation is opened.

### 6. Coverage matrix

- **TEST-CHAT-250 (Must).** Maintain `coverage-matrix.md` mapping every `CHAT-NNN` requirement and every Edge Case from the parent spec to ≥ 1 `TEST-CHAT-NNN`. CI / review checks the table is current; missing rows fail PR review.

### 7. Followups discipline

- **TEST-CHAT-260 (Must).** Bugs surfaced by this suite are filed as `[CHAT-NNN-MMM]` rows in `tasks/in-progress/chat/followups.md` (or `tasks/done/chat/followups.md` once parent ships). The test that surfaces the bug is **left failing** (or `it.skip` with a TODO referencing the followup ID); the suite does **not** silently fix production code. Matches the discipline established by `tests-jobs-applications` and `tests-collaborations-polish` (`COLLAB-073-001`).

## Edge Cases

- **A conversation has no messages yet.** Should be impossible after this feature — auto-create-on-confirm always inserts a system message, and direct-conversation creation requires a first message. Test asserts both paths produce a message; no assertion exercises an empty conversation rendering, but `MessageList` empty state is verified for completeness.
- **Two browser tabs on the same conversation.** Mark-read fires from whichever is visible; per-conversation throttle prevents double-fires. Backend e2e covers this by connecting two sockets for the same account.
- **A user logs out mid-conversation.** Test confirms the WS gateway disconnects the socket and the client cleans up its listeners — covered by `TEST-CHAT-080` cleanup hook + a frontend unit assertion that the socket-mock's `disconnect` is called on logout.
- **Race: two users send simultaneously.** Both bubbles arrive on each side; reconciliation is by `client_id` so each user's optimistic bubble is replaced by its own server message. Backend e2e `TEST-CHAT-082` exercises this implicitly by asserting A receives its own `new_message` with the matching `client_id`.
- **Race: confirm + retry-confirm collide.** Idempotency is the unique-constraint case — only one conversation row exists; the second confirm reuses it. `TEST-CHAT-040` (unit) + `TEST-CHAT-086` (e2e) cover.
- **Conversation with `collaboration_id` whose collab gets deleted.** `collaboration_id` becomes NULL; thread renders as "Direct message". `TEST-CHAT-110` covers the rendering; backend e2e covers the cascade (already implicit in the Prisma `onDelete: SetNull`).
- **Attachment uploaded but message never sent.** Row exists with `message_id IS NULL`. The 24 h sweep cron is out of scope (the parent spec defers it to `notes.md`); test asserts the row exists post-upload and no orphan is left if the upload fails (multer errors before insert).
- **Counterparty's account is suspended.** Counterparty's send is blocked (`AccountStateGuard`); current user can still send. `TEST-CHAT-072` covers from the suspended side.
- **Network partition mid-send.** Bubble stays `sending` until 5 s, then `Retry` button appears. Reconnection does not auto-resend (would risk duplicates). `TEST-CHAT-115` + `TEST-CHAT-221` cover.
- **Visibility flickers rapidly.** Mark-read throttle prevents > 1 fire per 2 s. `TEST-CHAT-119` covers.

## Acceptance Criteria

- All `TEST-CHAT-NNN` Musts pass on `npm test` (backend + frontend) and `npm run test:e2e` (backend + frontend).
- `coverage-matrix.md` exists and maps every `CHAT-NNN` requirement to ≥ 1 test.
- The new WS test harness `backend/test/util/ws-client.ts` is reused by ≥ 1 test in another module's e2e suite within the same PR (proof of reusability) — or a follow-up issue is filed if no other module needs it yet.
- The "no `<pre>{JSON.stringify(...)}</pre>` on chat surface" Playwright grep guard runs and passes.
- The "no `Recipient account ID` debug input on chat surface" Playwright grep guard runs and passes.
- The "no Stripe / payment / Fund button on chat surface" Playwright grep guard runs and passes.
- A failing test prints the offending `CHAT-NNN` ID in its description, so a reviewer can jump straight to the parent spec clause.
- Bugs surfaced by the suite are filed in `followups.md`; not silently fixed.
- `npm run lint:tokens` clean; `vite build` clean; backend `tsc` clean.

## Open Questions

- **Q1.** The Redis-adapter mode is wired on the gateway today (`backend/src/conversation/redis-io.adapter.ts`) and falls back to in-memory when Redis isn't reachable. Should the WS e2e suite also run with Redis enabled (`docker compose up redis` before the suite) to assert cross-instance broadcast? Default: **no for this feature** — single-instance assertions are enough; cross-instance is an infra-confidence test that belongs in a separate `tests-ws-redis-adapter/` track when we add a second backend instance. Track the question in `notes.md`.
- **Q2.** Should the optimistic-send `client_id` be a UUID or a monotonic counter scoped to the socket session? Default: **UUID v4** (`crypto.randomUUID()`) — collision-resistant across tabs and reloads. Lock in the test fixture (`mockMessage` factory's `client_id` field); future implementation must honour the choice.
- **Q3.** Test for the `MessageAttachment` orphan-sweep cron? The parent spec defers the sweep to `notes.md` ("acceptable for MVP"). Default: **no test in this feature** — when the cron lands, it ships with its own test. The followups list flags the missing sweep.
- **Q4.** Test for the WS handshake reload behaviour (a token rotates server-side; an existing socket connected with the old token keeps working until disconnect)? Default: **no** — token rotation is an Auth concern; this feature locks "handshake at time T accepts / rejects based on Account state at time T".
- **Q5.** Test for the case where a participant is removed from a `Conversation` mid-session (e.g. staff-tools eject)? Default: **no** — the parent spec doesn't add a remove-participant flow; group chat is out of scope, and 1:1 conversations have no remove path. If staff-tools adds one later, that feature owns the test.

## Decisions Log

- **2026-05-06 — WS e2e drives the real Socket.IO namespace, not a mock-socket fake.** The whole point of WS coverage in this feature is the `join_conversation` participant-check fix, the rate-limit token-bucket, and the handshake state-guard. A mock-socket fake would let regressions on any of those slip through. Cost: each WS test boots a Nest app (slow). Mitigation: share a single app instance across the WS e2e file via `beforeAll` / `afterAll`, only reset DB rows between tests via the existing truncate-between-tests helper.
- **2026-05-06 — Frontend unit suite uses a thin socket-mock, not a real socket.** Real WS in jsdom is slow and flaky; the frontend unit layer asserts the **contract** (`new_message`, `message_read`, `typing:*`, `conversation_created`), not the transport. Real-socket coverage at the Playwright layer (`TEST-CHAT-220 / 222 / 240`) is the safety net.
- **2026-05-06 — `tests-chat/` lives nested inside the parent feature folder** (`tasks/product/chat/tests-chat/` while in product, then moves with the parent through `in-progress/` → `done/`). Matches the precedent set by `tasks/done/collaborations-polish/tests-collaborations-polish/` and `tasks/done/jobs-applications/tests-jobs-applications/`.
- **2026-05-06 — Backend coverage of `backend/src/conversation/` is net-new in this feature.** The conversation module shipped without tests; this feature backfills unit + e2e for the existing surface (`TEST-CHAT-010..015`, `TEST-CHAT-070..074`) at the same time it covers the new auto-create / attachments / typing / rate-limit work. Same discipline as `tests-collaborations-polish` backfilling `backend/src/collaboration/`.
- **2026-05-06 — The WS test harness (`backend/test/util/ws-client.ts`) is the first of its kind in the repo.** Reused by escrow status push, push-notifications, and any future WS-emitting feature. Acceptance criterion is that it's reused by ≥ 1 other module within the same PR, or a follow-up issue is filed if no other module needs it yet — measured to prevent the harness becoming chat-specific.
- **2026-05-06 — Followups discipline mirrors `tests-collaborations-polish`.** Bugs found by the suite are filed in `followups.md` and the surfacing test stays failing (or `it.skip` with a TODO referencing the followup ID). Tests do not silently fix production code.
