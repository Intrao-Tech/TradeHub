# Brief

## Feature

Production-ready **Chat** for TradeHub MVP — the in-app messaging surface that backs every collaboration between a worker and an employer, plus pre-collaboration direct messages from a public profile or job application. Replaces the engineer-only debug `InboxPage`, wires conversations to the just-shipped Collaborations surface, and adds attachments + typing + a real composer. Backend stays on the existing NestJS conversation module + Socket.IO + Redis adapter that already ship today; this feature extends it, it does not rewrite it.

**No third-party chat SDK.** See the build-vs-buy analysis in `tasks/product/chat/spec.md` §Decisions Log — the existing backend is ~80% built, marketplace-specific rules (KYC-gated send, auto-create on collab `CONFIRMED`, staff moderation read-through) fight generic chat SaaS, and per-MAU pricing on Stream/Sendbird/Ably is the wrong cost curve for a verification-gated B2B platform. Build cost on top of what we already have is ~2–3 weeks; vendor cost is $0 today and ≥$15k/month at scale.

## Problem

Chat is the missing third leg of the marketplace flow (alongside Jobs and Collaborations, both shipped). Today:

- **Backend exists, but is plumbing-only.** `backend/src/conversation/` ships REST (`/conversations`, `/conversations/:id/messages`, `/:id/read`, `/unread-count`), a JWT-authenticated `/chat` Socket.IO gateway, and a Redis adapter for multi-instance. It does not link conversations to collaborations, does not auto-create a thread when a collab is confirmed, has no attachments table, no typing indicator events, and a known security gap: `join_conversation` joins any room the client asks for without a participant check (`backend/src/conversation/chat.gateway.ts:86-92`).
- **Frontend is debug-only.** `web/src/pages/InboxPage.tsx` exposes a "New conversation" form with a raw **"Recipient account ID"** numeric input (`:299-306`), renders a `<pre>{JSON.stringify(lastActionJson, null, 2)}</pre>` block on every action (`:507-510`), has a "Mark read" button users have to press themselves (`:409-413`), no typing indicator, no attachments, no day separators, no virtualization, no optimistic send, no retry on failure, no auto-resize composer, and no link back to the originating collaboration. There is no way for a user who lands on it from `/collaborations/:id` to know which thread is "this collab's chat".
- **Collaboration → chat is unwired.** `tasks/done/collaborations-polish/spec.md` §3 ships a chat summary card on `/collaborations/:id` that just links to `/inbox` — there's no auto-created thread to deep-link to, and no way to surface unread state per collaboration. `backend/src/collaboration/collaboration.service.ts` does not touch conversations on the `CONFIRMED` transition.
- **AppShell has no unread badge.** The `/inbox` nav item is plain text — users get no signal that they have unread messages without opening the page.
- **No attachments.** The product spec (`docs/TradeHub_UK_Technical_Specification_v2.docx §8.2`) explicitly lists `Message: id, thread_id, sender_id, content, attachments[], read_at` and `AWS S3 / Cloudflare R2` as the file storage. We have a working `JobAttachment` pattern in `backend/prisma/schema.prisma:775-794` ready to mirror for messages, but nothing is wired.

The job is to make the surface real: tie conversations to collaborations, auto-create on confirm, build a production composer + message list, ship attachments using the existing storage backend, and close the WS authorization gap.

## Goal

Ship the **chat shell** that backs collaborations end-to-end:

- A `Conversation.collaboration_id` link (nullable — direct DM still works) so every confirmed collaboration has exactly one auto-created thread, and `/collaborations/:id` deep-links to it.
- A real `/inbox` (and `/inbox/:conversationId`) with virtualized message list, day separators, optimistic send, auto-resize composer, attachments, and a header that surfaces the linked collaboration (status pill + back-link).
- Typing indicator (debounced WS event), unread badge in `AppShell` nav, and mark-read on visibility (not on a button click).
- Close the `join_conversation` participant-check gap, add `AccountStateGuard` / `RequiresVerifiedEmail` to send paths, add per-socket rate limit on `sendMessage`.
- Attachments via a new `MessageAttachment` table mirroring `JobAttachment`, using the same storage backend.
- Zero `<pre>{JSON.stringify(...)}</pre>` blocks on the chat surface. Every error surfaces through `parseApiError()`.

## Users

- **Worker** with a verified email and `verification_state === 'ACTIVE'` chatting with an employer about an in-progress collaboration; sometimes also receiving cold inbound from an employer who saw their public profile.
- **Employer** with a verified email and `verification_state === 'ACTIVE'` chatting with a worker about an in-progress collaboration; sometimes also initiating a conversation from a worker's public profile or a job application.
- **Staff** (moderator/admin) reading flagged collaborations' message history for moderation. Staff cannot send messages in this feature (sending is reserved for participants); staff read-through is via the `staff-tools` surface, not the inbox.
- **Anonymous visitor** — never has access; `/inbox` and `/inbox/:id` are private routes redirecting to `/login?next=`.

## Expected Outcome

- A user who confirms a collaboration sees an auto-created thread and can land on it from the collab's chat summary card.
- The chat list shows the linked collaboration's status pill and the counterparty's verification badge / star rating, not just an account ID.
- Sending a message that fails (network, validation, KYC) shows an inline retry, not a silent failure.
- Sending a message at the same time as a typing indicator does not flood the WS — typing is debounced to 300ms and auto-stops after 3s.
- Mark-read happens automatically when the user opens a conversation and the tab is visible. Closing and reopening the tab updates `last_read_at` correctly.
- A user can attach an image (≤ 10 MB) or a PDF (≤ 25 MB) to a message; the attachment renders inline with a thumbnail and a download link.
- The inbox nav badge shows the total unread count and disappears when everything is read.
- `npm run lint:tokens` is clean. `vite build` is clean. Light + dark mode parity. 375 px viewport works.

## Constraints

- **No third-party chat SDK** (Stream, Sendbird, Ably, CometChat). Decision recorded in spec Decisions Log; revisit at MAU > ~50k or when voice/video are in scope.
- **No new chat backend module from scratch.** Extend `backend/src/conversation/`. The existing REST + WS surface stays — new endpoints are additive.
- **No schema rewrite.** Add columns and one new table (`MessageAttachment`); do not rename or restructure `Conversation` / `Message`.
- **Two-party only.** Group chat (>2 participants) is out of scope. The `Conversation`/`ConversationParticipant` schema technically supports N participants, but the product surface enforces exactly two.
- **No E2E encryption, no voice/video, no message reactions, no message edit/delete, no threads, no presence beyond typing, no push notifications, no search.** Each is its own future feature; see `Non-goals` in `spec.md`.
- **Mobile-first design-system compliance** per `web/CLAUDE.md`: semantic tokens only, shadcn primitives, light + dark, 48 px tap targets, `lint:tokens` enforced.
- **GDPR.** Message bodies stay on TradeHub-managed Postgres; attachments stay on the same S3 / R2 bucket used by `JobAttachment`. Staff read access is logged via `ModerationAction` (already shipped).
- **Auth contract sealed.** Reuse `AccountStateGuard`, `RequiresVerifiedEmail`, `parseApiError()`. Don't invent parallel rules.
- **Tests are mandatory.** A `tests-chat/` folder opens the same week implementation starts (`tasks/GUIDE.md` Working Principles).
