# Spec

## Summary

Production-ready **Chat** for TradeHub MVP. Replaces the engineer-only debug `web/src/pages/InboxPage.tsx` with a real inbox + thread page, links every `Conversation` to a `Collaboration` via a new nullable `Conversation.collaboration_id`, auto-creates a thread when a collaboration transitions to `CONFIRMED`, ships first-class attachments via a new `MessageAttachment` table, and closes a known authorization gap on the existing `/chat` Socket.IO gateway. The backend stays on the already-shipped `backend/src/conversation/` module; this feature extends it, it does not rewrite it. Stream / Sendbird / Ably / CometChat are explicitly **rejected** — see `Decisions Log` for the build-vs-buy rationale.

Voice / video, group chat, E2E encryption, reactions, edit / delete, threads, presence (beyond typing), push notifications, and search are all explicit non-goals. Each lands as its own follow-on feature folder if and when needed.

Requirements use stable IDs (`CHAT-NNN`) so commits, tests, and reviews can reference them.

## Problem

The Jobs and Collaborations features ship a flow that ends at "the parties need to talk to each other": the Accept → Convert-to-collaboration action lands the user on `/collaborations/:id`, where the chat summary card (`tasks/done/collaborations-polish/spec.md` `COLLAB-023`) currently links to `/inbox` as a placeholder. There is no thread auto-created when the collab confirms, no per-collab unread state, no deep-link from the collab card to a specific conversation, and the inbox itself is unusable as a product:

- **Backend gaps.** `backend/src/conversation/` has the plumbing (REST + WS + Redis) but is not wired to the collaboration lifecycle. `backend/src/conversation/chat.gateway.ts:86-92` (`@SubscribeMessage('join_conversation')`) joins any room the client asks for without a participant check — a logged-in account can listen to any conversation by guessing the integer ID. The send paths (`POST /conversations/:id/messages`) have no per-socket rate limit. The schema has no `Conversation.collaboration_id` column, and no `MessageAttachment` table.
- **Frontend gaps.** `web/src/pages/InboxPage.tsx`:
  - `:299-306` — a "Recipient account ID" numeric input is the only way to start a conversation. Real users do not know account IDs.
  - `:507-510` — `<pre>{JSON.stringify(lastActionJson, null, 2)}</pre>` after every action.
  - `:409-413` — manual "Mark read" button (read state should track visibility, not a click).
  - No typing indicator, no online presence, no attachments, no day separators, no virtualization, no optimistic send, no retry-on-fail, no auto-resize composer, no Enter-to-send / Shift+Enter-newline, no chat header showing which collab the thread belongs to.
  - Nav has no unread badge.
- **Documentation alignment.** The product spec doc (`docs/TradeHub_UK_Technical_Specification_v2.docx §8.2`) explicitly defines `Message: id, thread_id, sender_id, content, attachments[], read_at` and lists `AWS S3 / Cloudflare R2` for file storage. The current `Message` row supports `attachments[]` only via a freeform `metadata` JSON blob, with no validation, no MIME enforcement, no size limit, no per-file row, no reuse of the working `JobAttachment` pattern (`backend/prisma/schema.prisma:775-794`).

This feature closes those gaps without rewriting the backend module that already ships.

## Goals

- Auto-create a `Conversation` (`collaboration_id` set) the first time a collaboration transitions to `CONFIRMED`. Idempotent.
- Add a nullable `Conversation.collaboration_id` foreign key + a unique index so a collab has at most one chat thread.
- Replace the chat summary card on `/collaborations/:id` (placeholder shipped by `collaborations-polish`) with a real deep-link to `/inbox/:conversationId` showing per-conversation unread count.
- Replace the debug `InboxPage` with a real inbox + thread layout. Every `<pre>{JSON.stringify(...)}</pre>` block deleted.
- Real composer: auto-resize textarea, Enter to send, Shift+Enter for newline, optimistic send + retry on fail, attachments (image ≤ 10 MB, PDF ≤ 25 MB).
- Real message list: virtualized, day separators, "yesterday / today / `Mon 5 May`" relative date headers, optimistic message bubbles with status (sending / sent / failed), grouped consecutive messages from the same sender.
- Typing indicator: WS event, debounced to 300 ms client-side, server re-emits to the room, auto-stops after 3 s of no input.
- Mark-read on visibility: when the conversation is open and the tab is visible, mark-read fires once on initial load and again on subsequent `new_message` events. No manual button.
- New `MessageAttachment` table mirroring the `JobAttachment` shape, stored on the same backend used today by jobs.
- Unread badge in `AppShell` nav (header + sidebar). Polls `GET /conversations/unread-count` on focus + listens to `new_message` / `message_read` WS events.
- Close the `join_conversation` participant-check gap. Add `AccountStateGuard` + `@RequiresVerifiedEmail()` on `POST /conversations` and `POST /conversations/:id/messages`. Per-socket rate limit on `send_message` events.
- Errors surface via `parseApiError()`. No raw `error.message`, no silent 403.
- Mobile-first, design-system-only, light + dark, `lint:tokens` clean.

## Non-goals

- **No third-party chat SDK** (Stream, Sendbird, Ably, CometChat). Build cost and lock-in / data-residency cost rejected — see `Decisions Log`.
- **No group chat.** `ConversationParticipant` is N-to-many in the schema, but the product enforces exactly two participants. No "add participant" UI, no group create flow.
- **No E2E encryption.** Staff moderation requires plaintext access. Add encryption at rest via Postgres / S3 SSE; nothing per-message.
- **No voice / video calls.** WebRTC is its own product feature.
- **No message reactions, no replies / threads, no edit, no delete.** Edit / delete in particular is risky in a marketplace where messages are evidence in a flagged dispute. Defer.
- **No online presence beyond typing.** No "last seen", no green dot, no "X is online". Typing-while-someone-is-typing is enough for MVP.
- **No push notifications.** Email + the in-app unread badge are the only notification surfaces in MVP.
- **No message search.** Full-text search is its own feature; the inbox is sorted by `last_message_at desc`.
- **No staff send.** Staff read-through for moderation is via `staff-tools`, not via the inbox surface. The inbox composer is hidden for staff who are not participants in the conversation.
- **No real-time read receipts at message granularity.** `last_read_at` per participant (already shipped) is enough — we render "Seen" when the other side's `last_read_at` ≥ the message's `created_at`.
- **No bulk actions.** No multi-select, no bulk-delete-thread, no archive.
- **No public-profile cold DM in this feature.** The "Start chat from worker / employer profile" entry point is deferred to `tasks/product/profile-message-cta/`. In this feature, conversations are created either (a) automatically on collab confirm, or (b) by an existing thread continuing.

## User Flow

### Worker (collab participant)

1. Worker on `/collaborations/:id` sees the chat summary card (shipped by `collaborations-polish` `COLLAB-023`). For a `CONFIRMED` / `IN_PROGRESS` / `COMPLETED` collab, the card shows `Conversation` + the unread count for the linked thread + footer link `Open chat →` deep-linking to `/inbox/:conversationId`.
2. Worker clicks → routes to `/inbox/:conversationId`. The thread page renders the conversation header (counterparty chip with verification badge + star rating, **collab status pill** + `View collaboration ↗` back-link), the message list, and the composer.
3. Worker types a message. The composer auto-resizes; Enter sends, Shift+Enter inserts a newline. The bubble appears immediately with `sending…` status. On server ack, status becomes `sent`. On error, status becomes `failed` with a `Retry` button.
4. Worker drags a PDF onto the composer (or clicks the paperclip). The file is validated client-side (≤ 25 MB, MIME `application/pdf` or image MIME) and uploaded; on success, the attachment is added to the in-flight message draft. Submitting sends the message with the attachment id.
5. While typing, a `typing:start` WS event is debounced to 300 ms. The other participant's UI shows a `Counterparty is typing…` row above the composer; the row clears on `typing:stop` or after 3 s.
6. New messages from the counterparty arrive via the existing `new_message` WS event. The list scrolls to bottom **only** if the user was already pinned to the bottom (within 100 px); otherwise a "New messages ↓" pill floats at the bottom and the list does not jump.
7. When the tab is visible and the conversation is open, mark-read fires automatically on initial load and again on every received message. The unread badge in the AppShell nav decrements live via the `message_read` event.

### Employer (collab participant)

1. Same flow. The employer is rendered with role label "Employer" in the conversation header.

### Staff

1. Staff opening `/inbox` sees only conversations they are a participant of (zero, in practice). For moderation, staff use the `staff-tools` surface (not in this feature) which reads `GET /staff/conversations/:id/messages` (also not in this feature). The inbox in this feature is **participant-only**.

### Public / unauthenticated visitor

- `/inbox` and `/inbox/:conversationId` are private routes, redirected to `/login?next=` by the existing `<Protected>` wrapper.

### Pre-existing direct conversations

- Conversations created today via `POST /conversations` with no `collaboration_id` (e.g., the seed data, or a thread started from a profile in a future feature) keep working. The thread page shows the counterparty chip but no collab status pill — the chat header collapses to "Direct message".

## Requirements

Conventions: each requirement has a stable ID. **Must** = MVP-blocking. **Should** = strongly preferred. **Defer** = explicitly out of MVP. Referenced as `@CHAT-NNN` from commits, tests, and PR descriptions.

### Sealed Auth dependencies (consumed, not duplicated)

`tasks/done/auth-flow/contract.md` (sealed 2026-04-26).

- `Account.status === 'ACTIVE'` and `verification_state === 'ACTIVE'` are required for sending. `AccountStateGuard` + `@RequiresVerifiedEmail()` already wrap the existing `POST /conversations` and `POST /conversations/:id/messages` (`backend/src/conversation/conversation.controller.ts:34-43, 73-83`). The WS gateway must enforce equivalent state on the `send_message` socket event (see `CHAT-040`).
- All API errors surface via `parseApiError()`; no raw `error.message`.

### Sealed Profiles dependencies (consumed, not duplicated)

`tasks/done/profiles/contract.md`.

- `<VerificationBadge>`, `<StarRating>`, the avatar primitive, and `verificationFromLevel()` are reused for the counterparty chip on the inbox row + thread header.

### Sealed Collaborations dependencies (consumed, not duplicated)

`tasks/done/collaborations-polish/spec.md`.

- The chat summary card on `/collaborations/:id` (`COLLAB-023`) replaces its current `/inbox` placeholder link with a deep-link to `/inbox/:conversationId` and a real unread badge. The collaboration spec already commits to "the chat feature will replace its content with the real conversation deep-link and unread count" — this is that replacement.
- Lifecycle action `Confirm` on `/collaborations/:id` (`COLLAB-021`, `PATCH /collaborations/:id/status`) is the trigger for auto-create-on-confirm (`CHAT-010`).

### 1. Schema migration

- **CHAT-001 (Must).** Add `Conversation.collaboration_id BigInt?` with a foreign key to `Collaboration(id)` (`onDelete: SetNull` — if the collab is deleted, leave the conversation orphaned with `collaboration_id = NULL` rather than cascading message deletion). Add `@@unique([collaboration_id])` so a collab has at most one chat thread.
- **CHAT-002 (Must).** Add `MessageAttachment` table mirroring `JobAttachment` (`backend/prisma/schema.prisma:775-794`):
  ```prisma
  model MessageAttachment {
    id             BigInt   @id @default(autoincrement())
    message_id     BigInt
    uploaded_by_id BigInt   // ClientProfile.id (matches JobAttachment.uploaded_by_id)
    file_url       String   @db.VarChar(500)
    original_name  String   @db.VarChar(255)
    mime_type      String   @db.VarChar(100)
    size_bytes     Int
    created_at     DateTime @default(now()) @db.Timestamptz()

    message  Message       @relation(fields: [message_id], references: [id], onDelete: Cascade)
    uploader ClientProfile @relation(fields: [uploaded_by_id], references: [id], onDelete: Cascade)

    @@index([message_id])
    @@index([uploaded_by_id])
    @@index([created_at])
    @@map("message_attachment")
  }
  ```
  No change to `Message.metadata` (it stays as the freeform JSON blob for non-attachment metadata like `job_post_id`).
- **CHAT-003 (Must).** Migration name: `add_conversation_collaboration_link_and_message_attachments`. No data backfill (no existing chats are tied to collabs today; existing rows keep `collaboration_id = NULL`). Migration runs in dev via `npx prisma migrate dev`; in prod via `prisma migrate deploy`.

### 2. Auto-create on collab confirm

- **CHAT-010 (Must).** When `CollaborationService.transitionStatus` (or whatever method `PATCH /collaborations/:id/status` calls — the existing collab service is the one to extend) transitions a collaboration to `CONFIRMED`, atomically create a `Conversation` with `collaboration_id` set + two `ConversationParticipant` rows (worker account + employer account) **iff** no conversation with that `collaboration_id` exists yet. Idempotent: a re-confirm or a manual retry never creates a second thread.
- **CHAT-011 (Must).** The first message in the auto-created thread is a system message (`message_type: 'SYSTEM'`, `sender_id` set to the user who triggered the confirm) with content `Collaboration confirmed. You can now message each other about the project.` Backend renders `message_type === 'SYSTEM'` as a centred grey pill on the frontend (`CHAT-051`), not a sender bubble. The system message uses the existing `Message` table; no schema change.
- **CHAT-012 (Must).** The auto-create runs inside the same Prisma `$transaction` as the status transition. If conversation creation fails, the status transition rolls back. Surface via `parseApiError()` if it fails (it shouldn't; the only realistic failure is a unique-constraint race, which is the idempotency case).
- **CHAT-013 (Should).** Emit a WS `conversation_created` event to both participants' sockets (using the existing per-account socket map in `chat.gateway.ts`) so the frontend's open inbox refetches without a manual reload.

### 3. WS authorization & rate limiting (security)

- **CHAT-020 (Must).** `@SubscribeMessage('join_conversation')` (`backend/src/conversation/chat.gateway.ts:86-92`) must verify that the connecting account is a `ConversationParticipant` of the requested conversation before calling `client.join(...)`. If not, do nothing (no error emit — silent ignore avoids account-id enumeration).
- **CHAT-021 (Must).** Add a per-socket token-bucket rate limit on `send_message` events: 10 messages per 10 seconds per socket. Bucket lives in-memory on the gateway (acceptable given sticky sessions); over-limit emits `error` with `code: 'RATE_LIMITED'` and the message is rejected. Same limit applied to the REST `POST /conversations/:id/messages` (already authed; add a NestJS `@Throttle` guard).
- **CHAT-022 (Must).** WS handshake already verifies JWT (`chat.gateway.ts:34-50`). Extend it to also load the `Account` row and reject if `account.status !== 'ACTIVE'` or `email_verified !== true`. The same rules `AccountStateGuard` + `RequiresVerifiedEmail` enforce on REST.
- **CHAT-023 (Should).** Server emits a server-authoritative `new_message` (already exists) — frontend never trusts client-generated IDs for persisted messages. Optimistic IDs are client-only and reconciled when the server's `new_message` arrives by matching on `(client_id, sender_id)` (see `CHAT-053`).

### 4. Send + typing + read

- **CHAT-030 (Must).** New WS event `send_message` (server side) accepts `{ conversation_id, client_id, content, attachment_ids[] }`. The server validates participant + state guards, persists, and broadcasts `new_message`. The HTTP `POST /conversations/:id/messages` stays for clients that prefer REST (no removal); both paths share the service method.
- **CHAT-031 (Must).** New WS events `typing:start` and `typing:stop`. Server re-broadcasts to the room excluding the sender. No persistence. Payload: `{ conversation_id, account_id }`. Client emits `typing:start` debounced to 300 ms after each keypress; emits `typing:stop` 3 s after the last keypress, on send, on blur, or on disconnect.
- **CHAT-032 (Must).** Mark-read fires automatically on the frontend when (a) the thread page mounts and the tab is visible, or (b) a `new_message` arrives while the thread is open and visible. Calls `PATCH /conversations/:id/read` (already exists). The existing `message_read` WS event already broadcasts the new `last_read_at`; the inbox row uses it to clear the unread badge live.
- **CHAT-033 (Should).** Mark-read is throttled to one call per 2 s per conversation client-side, to avoid hammering the endpoint when a user receives a burst of messages.

### 5. Attachments

- **CHAT-040 (Must).** New endpoint `POST /conversations/:id/attachments` accepting `multipart/form-data` with field `file`. Reuses the same multer pipeline + storage adapter as `JobAttachment` (currently writes to local disk + S3 / R2 depending on env; see existing job-attachment upload code). Returns the persisted `MessageAttachment` row (without `message_id` — that's set when the message is created). Validates: MIME ∈ `image/{png,jpeg,webp,gif}` (max 10 MB) or `application/pdf` (max 25 MB). Anything else → 400 `INVALID_MIME_TYPE`.
- **CHAT-041 (Must).** Send-message endpoints (REST + WS) accept an optional `attachment_ids: number[]` field. The service validates that every id (a) exists, (b) is owned by the sender (`uploaded_by_id` matches sender's client profile), (c) has `message_id IS NULL` (not already attached). On send, the service updates the rows' `message_id`. Concurrent send-with-same-attachment-id rejects on the constraint.
- **CHAT-042 (Must).** Attachment retrieval is via the existing `file_url` column. For the MVP, `file_url` is a direct CDN URL (matching `JobAttachment` behaviour). If the project's existing storage uses pre-signed URLs, the conversation attachment endpoint produces the same kind of URL. **No new auth model invented for chat — the same one used by jobs is reused.**
- **CHAT-043 (Should).** Attachments are eagerly included in the `GET /conversations/:id/messages` payload via `include: { attachments: true }`. The list endpoint payload size cap is 50 attachments per response (limit page size to 50 if avg attachments > 1).

### 6. List page (`/inbox`)

- **CHAT-050 (Must).** Replace `web/src/pages/InboxPage.tsx`. The new layout: left rail = conversation list (sticky on desktop, full-width drawer on mobile), right pane = thread (when one is selected) or empty-state. Use the existing `<ConversationListItem>` primitive (`web/src/components/ConversationListItem.tsx`) — no rewrite. Each row shows: counterparty chip (avatar + display name + verification badge), **collab status pill (if `collaboration_id` is set)**, last-message preview, relative time, unread count.
- **CHAT-051 (Must).** Conversations are sorted by `last_message_at desc` (already implemented server-side). Empty state: `<EmptyState icon={MessageSquare} title="No conversations yet" description="Once you confirm a collaboration, the chat with your counterparty appears here.">`.
- **CHAT-052 (Must).** Delete the "New conversation" form on `InboxPage` (`:288-320`). Conversations in this feature are created **only** by the auto-create-on-confirm flow. The "start a thread from a profile" entry point is deferred to a future feature (`tasks/product/profile-message-cta/`); the raw `recipient_id` numeric input is removed unconditionally.
- **CHAT-053 (Must).** Delete every `<pre>{JSON.stringify(...)}</pre>` block on the chat surface — specifically `:507-510`. Grep returns nothing on `JSON.stringify` in `web/src/pages/InboxPage.tsx` and the new `web/src/pages/ConversationPage.tsx`.

### 7. Thread page (`/inbox/:conversationId`)

- **CHAT-060 (Must).** Implement `web/src/pages/ConversationPage.tsx` (or render the right pane within `InboxPage` against `useParams()` — implementer's choice). Header: counterparty chip + collab status pill (if linked) + `View collaboration ↗` back-link to `/collaborations/:collaboration_id`. For unlinked direct conversations, header collapses to just the counterparty chip + "Direct message" subtitle.
- **CHAT-061 (Must).** Message list. Virtualized (use `@tanstack/react-virtual` — already in the project's likely-installed list; if not, add it). Day separators rendered between messages whose `created_at` falls on different calendar days. "Today" / "Yesterday" / `Mon 5 May` / `5 May 2026` formatting (existing `web/src/components/ConversationListItem.tsx:formatTime` style). Consecutive messages from the same sender within 60 seconds are grouped (no avatar + timestamp on every bubble).
- **CHAT-062 (Must).** Composer. Auto-resize `<Textarea>` capped at 8 lines; scrolls past that. Enter sends; Shift+Enter inserts a newline. Send button is icon-only on mobile (`<Send>`), label-bearing on `≥ md`. Composer has a paperclip button opening a hidden `<input type="file" multiple>` for attachments; drag-and-drop onto the composer also accepts files. Active uploads render as in-flight chips above the composer with a progress indicator + cancel button. Attaching is allowed before the first character is typed.
- **CHAT-063 (Must).** Optimistic send. On submit, the message bubble is added to the list with `status: 'sending'` and a generated `client_id`. The server's `new_message` event reconciles by matching on `(client_id, conversation_id)`. On REST 4xx / 5xx or WS `error`, status becomes `failed` with a `Retry` button that re-sends. On success, status becomes `sent` (no checkmark — the green-tick UI is deferred).
- **CHAT-064 (Must).** Typing indicator. When the other participant's `typing:start` arrives, render a row above the composer: counterparty avatar + "is typing…" with three pulsing dots. Cleared on `typing:stop` or after 3 s of no further `typing:start` (auto-timeout). Multiple `typing:start` events extend the timeout; multiple `typing:stop` events are no-ops.
- **CHAT-065 (Must).** Mark-read on visibility. Use `document.visibilityState` + a `useEffect` that fires `PATCH /conversations/:id/read` once on mount (when visible) and once per received `new_message` (when visible). Throttled to 1 call / 2 s.
- **CHAT-066 (Should).** "Seen" indicator. Render `Seen` (small grey text under the most recent **own** message) when the other participant's `last_read_at` ≥ that message's `created_at`. Updates live on `message_read` WS events.
- **CHAT-067 (Should).** Failed send retry. The `Retry` button on a `failed` bubble re-sends with the same `client_id`. After 3 failed attempts, the bubble offers a `Discard` button that removes it from the local state.

### 8. AppShell unread badge

- **CHAT-070 (Must).** The `Inbox` nav item in `AppShell` (`web/src/components/AppShell.tsx`) shows a `<Badge>` with the total unread count (from `GET /conversations/unread-count`). The badge re-fetches on (a) initial mount, (b) window focus, (c) every `new_message` / `message_read` WS event. Hidden when count is 0.
- **CHAT-071 (Should).** A small "live dot" indicator next to the Inbox label flashes briefly when a `new_message` arrives while the user is on a different page (200 ms animation).

### 9. Error surfacing & access control

- **CHAT-080 (Must).** Every fetch and mutation surfaces errors through `parseApiError()`. No raw `error.message`. WS errors surface as a `<Toast>` (using the existing `sonner` setup).
- **CHAT-081 (Must).** Unverified-email user hitting `POST /conversations/:id/messages` gets a `403 EMAIL_NOT_VERIFIED`; the frontend renders `<AuthBanner kind="EMAIL_NOT_VERIFIED">` above the composer + disables the send button. Same for `Account.status !== 'ACTIVE'` → `<AuthBanner kind="ACCOUNT_NOT_ACTIVE">`.
- **CHAT-082 (Must).** Unauthenticated user hitting `/inbox` or `/inbox/:id` is redirected to `/login?next=…` (existing `<Protected>` wrapper).
- **CHAT-083 (Should).** Non-participant hitting `/inbox/:id` directly (e.g., shared URL) sees an `EmptyState` ("Conversation not found or you don't have access") with a back-link.

### 10. Design-system compliance

- **CHAT-090 (Must).** Zero raw hex / Tailwind default scale / inline-style colours. `npm run lint:tokens` clean.
- **CHAT-091 (Must).** `vite build` clean. Light + dark parity. 375 px viewport works.
- **CHAT-092 (Must).** Reuse: `<ConversationListItem>`, `<VerificationBadge>`, `<StarRating>`, `<EmptyState>`, `<Avatar>`, `<Card>`, `<Badge>`, `<Toast>` (sonner), `<Button>`, `<Textarea>`, `<Tabs>`. No new domain primitives unless explicitly required by a requirement here. If a new primitive is required (e.g., a system-message pill), add to `web/src/components/` not `web/src/components/ui/`.

### 11. Tests counterpart

- **CHAT-100 (Must).** A `tests-chat/` folder opens the same week implementation starts and lives in `tasks/in-progress/` until the implementation feature ships. It covers:
  - Auto-create on confirm: confirming a `PENDING` collab as the responder creates a conversation; reconfirming an idempotent retry doesn't create a second.
  - WS `join_conversation` rejects a non-participant silently (existing client doesn't see the room's events).
  - WS `send_message` rate limit: the 11th message in 10 s is rejected with `RATE_LIMITED`.
  - WS handshake rejects `email_verified !== true` accounts.
  - Attachment upload accepts PNG ≤ 10 MB; rejects PNG > 10 MB; rejects MIME `application/zip`. Send-message rejects an attachment owned by another user.
  - Inbox row renders the collab status pill when `collaboration_id` is set.
  - Thread page: virtualization renders only visible bubbles; day separators appear at calendar boundaries; consecutive same-sender messages within 60 s are grouped.
  - Composer: Enter sends, Shift+Enter newlines, optimistic bubble appears with `sending`, transitions to `sent` on server ack, transitions to `failed` on server error and a Retry restores `sending`.
  - Typing indicator: emits `typing:start` after 300 ms debounce; emits `typing:stop` after 3 s of inactivity, on send, and on blur.
  - Mark-read: fires on mount when visible; does not fire when `document.visibilityState === 'hidden'`; is throttled to 1 call / 2 s.
  - Unread badge: increments on `new_message`, decrements on `message_read`, hidden at 0.
  - Token lint clean: smoke test that `lint:tokens` passes on the changed files.

## Edge Cases

- **A collab is rejected after the chat thread is created.** The thread persists. The conversation header renders the collab status pill as `Rejected`; the composer shows a banner `This collaboration was rejected. Messages here are read-only.` and the send button is disabled. Backend enforces by checking `Collaboration.status` on the send path; frontend mirrors.
- **A collab is deleted (admin / staff action).** `Conversation.collaboration_id` is set to `NULL` (`onDelete: SetNull`). The thread becomes a "Direct message" — header collapses to just the counterparty chip. Messages are preserved.
- **A user loses verification (`email_verified` flipped to false by an admin or token expiry).** Existing sockets are not force-disconnected, but the next `send_message` is rejected by the gateway state guard (`CHAT-022`). The frontend handles the WS `error` event and disables the composer with `<AuthBanner>`.
- **Both participants type at the same time.** Two `typing:start` events to the same room. The composer renders a single "is typing…" row scoped to the **other** participant only (sender excludes self via `socket.to(room)` not `io.to(room)`).
- **Network partition mid-send.** The optimistic bubble stays in `sending` until the WS reconnects. On reconnect, the message is **not** auto-resent (would risk duplicates). The `Retry` button is rendered after 5 s of being stuck in `sending`. The `client_id` is the dedupe key — if the original send actually succeeded, the server's eventual `new_message` will reconcile and clear the optimistic bubble.
- **Send while disconnected.** Composer remains enabled; on submit, the optimistic bubble flips to `failed` immediately if `socket.connected === false`. A `Retry` button re-sends after reconnect.
- **Attachment uploaded but message never sent.** `MessageAttachment` row exists with `message_id IS NULL`. A nightly cron (out of scope of this feature; track in `notes.md`) sweeps rows older than 24 h. Acceptable for MVP.
- **Counterparty's account is suspended.** The thread is read-only on both sides until reinstated. Send path returns `403 ACCOUNT_NOT_ACTIVE` for the counterparty; their send is blocked. The current user can still send messages to a suspended counterparty (the counterparty just won't see them until reinstated).
- **Two tabs open on the same thread.** Both receive `new_message` via the WS room. Mark-read fires from whichever tab is visible — the per-conversation throttle (`CHAT-033`) prevents duplicate calls within 2 s.
- **Race between auto-create and a manual `POST /conversations`.** Theoretical only — the manual entry-point is removed by `CHAT-052`. If a future feature re-introduces it, the unique constraint `Conversation.collaboration_id` + idempotent service guards prevent duplicates.
- **Uploading a file while offline.** The upload returns a network error; the in-flight chip flips to a failed state with a `Retry` button. No partial / orphaned `MessageAttachment` row is created (multer fails before the DB insert).

## Acceptance Criteria

- `web/src/pages/InboxPage.tsx` (or its replacement) contains zero `<pre>{JSON.stringify(...)}</pre>` blocks. Grep returns nothing.
- The `/inbox/:conversationId` route is registered in `web/src/App.tsx`, gated by `<Protected>`. Logged-out hits redirect to `/login?next=`.
- Confirming a `PENDING` collab via `PATCH /collaborations/:id/status` creates exactly one `Conversation` row with `collaboration_id` set. Calling it again does not create a second.
- The chat summary card on `/collaborations/:id` deep-links to `/inbox/:conversationId` for that collab and shows the per-collab unread count.
- The Inbox row for a collab-bound conversation renders the collab status pill.
- Sending a message via the composer renders an optimistic bubble within 16 ms, transitions to `sent` on server ack, and transitions to `failed` on server error with a Retry button.
- Typing in the composer for ≥ 300 ms emits one `typing:start` event; pausing for ≥ 3 s emits one `typing:stop`. The other side's UI shows / clears the typing row accordingly.
- Mark-read fires once on mount + once per received `new_message` while the tab is visible. Does not fire while `document.visibilityState === 'hidden'`.
- The AppShell Inbox nav badge shows a non-zero count when there is unread, hides at 0, and updates live.
- Uploading a 9 MB PNG to the composer succeeds; an 11 MB PNG fails with an inline error; a `application/zip` upload fails with `INVALID_MIME_TYPE`.
- WS `join_conversation` for a conversation the user is not a participant of has no observable effect on that user's socket (no `new_message` events received).
- Sending the 11th message in 10 s on the same socket is rejected with `RATE_LIMITED`.
- WS handshake fails for an unverified-email account.
- `npm run lint:tokens`, `vite build`, and the unit + e2e test suites are clean.
- `tests-chat/` has a `spec.md` covering the `CHAT-100` test set.

## Open Questions

- **Q1.** When the auto-created system message (`CHAT-011`) is rendered, should it count toward the unread count for the counterparty? Default: **yes**, because we want the unread badge to flash and pull them into the new chat. Reconsider if dogfooding shows it's annoying noise.
- **Q2.** Should we persist a "conversation paused" flag when the linked collab moves to `REJECTED`, or rely on a frontend lookup of the collab's status? Default: **frontend lookup** (no extra column) — the collab's status is already on the thread header, and the send-path guard reads it server-side.
- **Q3.** Is the 60-second consecutive-message grouping window (`CHAT-061`) right? Slack uses 5 minutes, iMessage uses 1 minute, WhatsApp uses 0 (always groups). Default to 60 s; revisit after dogfooding.
- **Q4.** Pagination: existing `GET /conversations/:id/messages` does offset pagination by `page` + an ISO `before` cursor. The thread page should use cursor-based infinite scroll-up (load older messages when the user scrolls within 200 px of the top), not page-based. **Confirmed.** No further question — implementer uses `before` cursor.
- **Q5.** Should the `MessageAttachment.uploaded_by_id` reference `ClientProfile.id` (matches `JobAttachment`) or `Account.id`? Matching `JobAttachment` is consistent; the relation goes through the account's client profile. **Default: `ClientProfile.id`** to match. Reconsider if a future surface needs to attach files without a client profile (unlikely — every active user has one by `auth-flow` contract).

## Decisions Log

- **2026-05-06 — Build vs buy: BUILD.** Stream / Sendbird / Ably / CometChat all rejected. Reasoning: (1) the existing `backend/src/conversation/` module is ~80% built — Conversation / Message tables, REST + WS, JWT auth, Redis adapter, mark-read. Replacing it with a SaaS chat means throwing away working code. (2) Marketplace-specific rules (auto-create on collab `CONFIRMED`, KYC-gated send via `AccountStateGuard` + `RequiresVerifiedEmail`, staff moderation read-through, per-collab status banner on the thread header) fight a generic chat SDK's channel-as-opaque model. (3) Cost: Stream's "Free for Makers" caps at 5 employees + < $10k MRR — TradeHub will outgrow it the moment we monetise; above that, ~$0.50–$2 / MAU (~$15k/month at 1M MAU per public pricing). Custom on existing Postgres + Redis + the `JobAttachment` S3 / R2 backend is effectively zero incremental cost. (4) GDPR / data residency: UK platform, staff has to read flagged messages, putting bodies on a US vendor's infra is unnecessary DPA / SCC overhead. (5) No exotic features needed: no E2E, no voice / video, no group chat (1:1 only), no reactions / threads / edit / delete in MVP. The Stream selling point is the rich UI library — we already have shadcn + tokens that match our brand. **Re-evaluate** when MAU > ~50k AND we want voice / video + reactions + threads + push without owning any of it.
- **2026-05-06 — `/inbox/:conversationId` is the deep-link target, not `/collaborations/:id?tab=chat`.** The inbox is the canonical chat surface. The collab detail page renders a summary card pointing into the inbox; it does not embed the thread inline. Reasoning: keeps the chat UI decoupled from the collab UI (e.g., direct messages from a profile in a future feature land in the same inbox without needing a collab row). The collab card's `Open chat →` link carries the collab context via the thread header, so the user never feels "I lost the collab context".
- **2026-05-06 — `Conversation.collaboration_id` is nullable.** Direct conversations (today's existing use case + future profile-CTA feature) keep `collaboration_id = NULL` and render as "Direct message". This keeps the schema usable for both the collab-bound use case and the profile-message-CTA feature without a forced collab.
- **2026-05-06 — Unique constraint on `Conversation.collaboration_id`.** A collab has at most one chat thread. Confirmed-then-disputed-then-reconfirmed lifecycle still uses the same thread.
- **2026-05-06 — Auto-created system message author = the user who triggered the confirm.** Alternative was a synthetic "TradeHub" sender; rejected because we don't have a system account row, and creating one for one message is overengineering. The system bubble UI hides the sender chip anyway (`CHAT-051`).
- **2026-05-06 — Public-profile cold DM is deferred.** The "message worker / employer from their public profile" entry point is a separate feature folder (`tasks/product/profile-message-cta/`). Removing the raw `recipient_id` numeric input from `InboxPage` is unconditional — it's a debug input that should never have shipped.
- **2026-05-06 — Tests are mandatory and a sibling folder opens the same week.** `tasks/GUIDE.md` Working Principles + the precedent set by `tests-collaborations-polish/`. Implementer opens `tasks/in-progress/tests-chat/` immediately on starting.
