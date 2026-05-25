# Brief

## Feature

Test coverage for the Chat feature (`tasks/product/chat/`).

## Problem

Chat replaces the engineer-only debug `web/src/pages/InboxPage.tsx`, links every `Conversation` to a `Collaboration` via a new nullable `Conversation.collaboration_id`, auto-creates a thread when a collaboration confirms, ships first-class attachments via a new `MessageAttachment` table, and closes a known authorisation gap on the existing `/chat` Socket.IO gateway. The parent spec encodes ~40 `CHAT-NNN` requirements across 11 sections plus a 10-row Edge Cases list. None of this is regression-protected today:

- **No backend unit tests** for `backend/src/conversation/` — `conversation.service.ts`, `chat.gateway.ts`, and the controller all have zero `*.spec.ts` files.
- **No backend e2e tests** — `backend/test/` has no `conversation.e2e-spec.ts`. The existing `/chat` namespace WebSocket gateway has never been driven by an automated test, including the **`join_conversation` participant-check gap** (`backend/src/conversation/chat.gateway.ts:86-92`) that this feature closes.
- **No frontend tests** for `InboxPage` or any conversation component beyond what `tests-collaborations-polish` asserts (which is only "the chat summary card on the collab detail page renders and links to `/inbox`" — the inbox itself is not exercised).

The surface is uniquely fragile because:

- **WS authorisation is invisible to HTTP test tooling.** The `/chat` namespace runs on Socket.IO; nothing in the existing Supertest harness reaches it. A regression here is silent — a non-participant joining a conversation room and receiving every `new_message` event is a privacy bug that no current test would catch.
- **Auto-create-on-confirm is a cross-module seam.** `CollaborationService.transitionStatus` (or whatever the implementer extends) writes into the `conversation` module's tables. Without a test that asserts a confirm produces exactly one `Conversation` row with `collaboration_id` set, idempotently, a future PR refactoring either side can silently break the chat-creation flow.
- **The optimistic-send / reconcile dance** (`CHAT-053` + `CHAT-063`) is the most regression-prone part of any chat UI. The `client_id` round-trip — frontend generates an ID, persists an optimistic bubble, the server emits `new_message` with the same `client_id`, the frontend reconciles by replacing the optimistic bubble with the persisted one — is the one part where a refactor that "just renames a prop" produces ghost-bubble or duplicate-bubble bugs that only show up under network jitter. Locking the contract is the test suite's job.
- **Mark-read on visibility** (`CHAT-065`) is a `document.visibilityState` + `useEffect` hook with a 1-call-per-2-seconds throttle (`CHAT-033`). Without a test that asserts no fire while hidden and exactly-once on mount + per-incoming-message, a future "let's just simplify this" PR turns it back into a button-click model and silently breaks the unread-badge UX.
- **Attachment authorisation** (`CHAT-041`) — only the uploader can attach a `MessageAttachment` row to a message, and only if `message_id IS NULL`. Without a test that asserts a malicious sender can't reference another user's attachment id, the "I copied an attachment id from a leaked URL" attack is open.
- **Rate limiting** (`CHAT-021`) on the `send_message` socket event is a token-bucket. Without a test that asserts the 11th message in 10 s is rejected with `RATE_LIMITED`, a future "let's bump the limit" PR can silently raise it from 10 to 1000 with no PR-review signal.
- **The grep guardrail.** The parent spec's `CHAT-053` deletes every `<pre>{JSON.stringify(...)}</pre>` block on the chat surface. The same pattern that protects `tests-jobs-applications` and `tests-collaborations-polish` against drive-by JSON dumps must protect chat too — the debug-page DNA is exactly what this feature is removing.
- **Typing-indicator debounce** (`CHAT-031` + `CHAT-064`) — 300 ms debounce client-side, 3 s auto-stop. A regression that drops the debounce floods the WS room with `typing:start` events on every keystroke; nothing in the production code surfaces it.
- **The unique constraint on `Conversation.collaboration_id`** (`CHAT-001`) is what makes idempotency work. A test must drive the constraint by attempting to create a second conversation for the same collab and asserting Postgres rejects it.

## Goal

Lock the Chat surface behind an automated test suite — backend unit + backend e2e + frontend unit + Playwright e2e — so that every `CHAT-NNN` requirement and every Edge Case from the parent spec has at least one test that fails if the behaviour regresses. Cover the **existing-but-untested** `backend/src/conversation/` module at the same time, because shipping new chat features on top of an unprotected gateway is a no-go (same logic that drove `tests-collaborations-polish` to backfill the collaboration-module backend tests).

This is the first feature in the repo that exercises the WS gateway under test. A WS test harness is added in this feature and reused by every future feature that emits or consumes WS events (escrow status push, push-notifications, etc.). Keep it minimal — `socket.io-client` against the booted Nest app on a Testcontainer Postgres, no Mock-Socket fakes — so we get real handshake / room / authorisation behaviour.

The `tests-auth-flow`, `tests-profiles`, `tests-jobs-applications`, and `tests-collaborations-polish` specs handle their respective surfaces. This spec is their sibling for `chat` and assumes their tooling — Vitest + RTL + MSW v2 (frontend), Jest + `jest-mock-extended` (backend unit), Testcontainers Postgres + Supertest + the `test-app.ts` harness (backend e2e), Playwright (frontend e2e), the `seedWorker*` / `seedEmployer*` factories, the `seedCollaboration` factory introduced by `tests-collaborations-polish`, the `renderWithProfile()` helper, the `TestMailService`, the `parseApiError()` helper — is already in place.

## Users

- TradeHub developers and AI agents working on Chat, Escrow (next), Reviews-write, Staff-tools, Push-notifications, and any future surface that reads or writes to `Conversation` / `Message` / `MessageAttachment` or consumes the `/chat` WS namespace.
- Reviewers of PRs touching `backend/src/conversation/`, the `Collaboration → Conversation` auto-create seam in `backend/src/collaboration/`, the new `web/src/pages/InboxPage.tsx` (rebuilt) and `…/ConversationPage.tsx`, the new `<Composer>` / `<MessageList>` / `<TypingIndicator>` components, the `AppShell` unread badge, and the new `MessageAttachment` upload endpoint.

## Expected Outcome

- **Backend**: every conversation endpoint (`POST /conversations`, `GET /conversations`, `GET /conversations/unread-count`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`, `PATCH /conversations/:id/read`, the new `POST /conversations/:id/attachments`) has unit + e2e coverage. The `/chat` WS namespace has driven, real-handshake e2e coverage for connect / authorise / `join_conversation` participant check / `send_message` / `typing:start` / `typing:stop` / rate limit / state-guard rejection on unverified email. The `Collaboration → Conversation` auto-create seam is asserted from both sides (backend unit on the collab service + backend e2e via `PATCH /collaborations/:id/status`).
- **Frontend**: the rebuilt inbox + thread page renders, validates, and routes correctly under MSW-mocked API responses + a fake socket. The optimistic-send reconciliation contract (client_id round-trip) is asserted. The mark-read-on-visibility hook is asserted under both `visible` and `hidden` `document.visibilityState`. The composer's Enter / Shift+Enter / auto-resize behaviour is asserted. The typing-indicator debounce + 3 s timeout is asserted with fake timers. The AppShell unread-badge live-update is asserted across both `new_message` and `message_read` events.
- **Guardrails**:
  - The "no `<pre>{JSON.stringify(...)}</pre>` on the chat surface" rule is enforced by a grep-style Playwright assertion identical to `tests-collaborations-polish` `TEST-COLLAB-203`.
  - The "no raw `Recipient account ID` numeric input on the chat surface" rule is enforced by a grep-style Playwright assertion (the legacy debug input is what the parent spec `CHAT-052` removes; preventing its return is the test's job).
  - The "no Stripe / payment buttons on the chat surface" rule is enforced (out of scope by parent spec; assert non-existence to catch a "while we're here" PR).
- A failing test points the developer at the offending `CHAT-NNN` ID and the spec clause it broke.
- Bugs surfaced by the suite are filed in `tasks/in-progress/chat/followups.md` (created on first finding); the suite **does not silently fix** any bug it reveals, matching the discipline established by `tests-jobs-applications` and `tests-collaborations-polish`.

## Constraints

- Do **not** add CI / CD configuration. Local-execution only.
- Do **not** change Chat behaviour. Tests must not silently fix bugs they reveal — file follow-ups instead.
- Reuse the existing tests-* tooling unchanged where possible. New additions allowed:
  - `backend/test/util/ws-client.ts` — thin `socket.io-client` helper that connects to the booted Nest app on its `/chat` namespace with a JWT in the handshake. Reused by every future feature that drives the WS gateway under test.
  - `backend/test/util/factories.ts` — extend with `seedConversation({ collaborationId?, participantAccountIds, lastMessageAt? })`, `seedMessage({ conversationId, senderId, content?, messageType?, createdAt? })`, `seedMessageAttachment({ messageId?, uploadedById, mimeType?, sizeBytes?, originalName? })`. The `messageId?` form is used to test the "uploaded but unattached" sweep path.
  - `web/src/test/handlers/conversations.ts` — MSW v2 handlers for the seven REST endpoints listed above. Per-test override pattern matches `tests-collaborations-polish`.
  - `web/src/test/socket-mock.ts` — a minimal in-memory socket mock exposing `emit` / `on` / `off` and a `__triggerEvent(name, payload)` test-only hook. **Not** a full `socket.io-mock` — the suite asserts the contract surface (`new_message`, `message_read`, `typing:start`, `typing:stop`, `conversation_created`), not the transport.
- Do not write tests for real Stripe-Connect escrow logic, voice / video, group chat, message reactions, threads, edit / delete, presence beyond typing, push notifications, or search. All of those are explicit non-goals of the parent feature and have their own future test folders.
- The tests for the chat summary card on `/collaborations/:id` already shipped in `tests-collaborations-polish` (`TEST-COLLAB-114`); this feature **updates** those tests to cover the new deep-link to `/inbox/:conversationId` + per-collab unread count, but does not duplicate the existing card-renders-unconditionally assertion.
- No real S3 / R2 traffic. The attachment endpoint test uses the same in-memory storage stub used by `JobAttachment` tests; if no such stub exists yet, this feature adds one in `backend/test/util/storage-stub.ts` rather than hitting a network bucket.
- No real WebSocket traffic from the frontend unit tests — those use `socket-mock.ts`. **Backend e2e** uses the real Socket.IO gateway against the Testcontainer-booted Nest app.
