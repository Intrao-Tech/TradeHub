# Followups

Out-of-scope items surfaced during the chat implementation pass (2026-05-07). Not bugs in shipped behaviour — explicit deferrals captured here so they have a home.

## Orphan MessageAttachment cron sweep

The `MessageAttachment` row is created with `message_id = NULL` on upload, then bound to the message at send time. The Edge Cases section of `spec.md` calls out a nightly cron that sweeps orphan rows older than 24 h as out of scope; the constants and per-uploader ceiling are in place, but the cron job itself is not yet wired.

- **Where to add it.** Mirror `backend/src/job-attachment/job-attachment.cleanup.job.ts`. Constants already live at `backend/src/message-attachment/message-attachment.constants.ts` (`MESSAGE_ATTACHMENT_ORPHAN_TTL_HOURS = 24`, `_SWEEP_BATCH = 500`). The service has a `tryUnlinkUpload` helper but no `runSweep` yet — add it alongside.
- **Acceptance.** A new `tests-chat` spec asserts that an orphan older than 24 h is removed from disk + DB on the next sweep tick.

## Email-not-verified WS error toast vs. inline banner

The thread page renders an inline `<AuthBanner>` when `EMAIL_NOT_VERIFIED` is detected on a REST send or via the WS `error` payload. We currently *also* surface the WS error via a `toast.error()` so the user sees a transient pop-up. Decide which is canonical (likely banner-only) and trim the toast — small UX nit, not a blocker.

## Stick-to-bottom on first paint

When the thread mounts, `MessageList` scrolls to the bottom on the first effect tick. With `@tanstack/react-virtual` the very first paint can briefly show the top of the list before the layout effect snaps to bottom. Acceptable per spec; revisit if dogfooding reports the flash. A `scrollToIndex` from inside `useLayoutEffect` was tried and the timing was identical (virtualizer measures after first paint).

## Public-profile cold DM entry point

Out of scope per `spec.md` §Non-goals. Deferred to `tasks/product/profile-message-cta/`. The `POST /conversations` REST entry point is still available (used by `startConversation`) so when that feature ships it can call into the existing service without touching the gateway.

## [CHAT-061-001] MessageList virtualisation untestable in jsdom — RESOLVED 2026-05-07

- **Where.** `web/src/components/chat/MessageList.test.tsx` (TEST-CHAT-150 / 151 / 152).
- **Was.** `@tanstack/react-virtual` reads `clientHeight` / `scrollHeight` on the scroll element to compute the visible row range. jsdom returns `0` for both, so `getVirtualItems()` was empty even with shimmed dimensions. TEST-CHAT-150 asserted the upper bound only (count < 1000) instead of the spec's "< 100"; TEST-CHAT-151 / 152 rendered `SystemMessagePill` / `MessageBubble` directly to dodge the virtualiser.
- **Fix.** Added a `vi.mock('@tanstack/react-virtual', …)` shim that returns a deterministic `useVirtualizer` materialising every row. All three tests now drive the production `MessageList` component path end-to-end. TEST-CHAT-150 additionally asserts that the first (`m0`) and last (`m999`) messages are present in the DOM, locking the day-separator interleaving.

## [CHAT-200-001] Two-context Playwright specs blocked on registerEmployer() — RESOLVED 2026-05-07

- **Where.** `web/e2e/util.ts`, `web/e2e/inbox-list.e2e.spec.ts`, `web/e2e/{collab-confirm-creates-thread,send-receive,attachments,unread-badge}.e2e.spec.ts`, `backend/src/test-only/test-seed.controller.ts`.
- **Was.** Each spec needed an employer browser context to drive the Jobs accept-flow → collab confirm seam. The harness only shipped `registerWorker()`. Same blocker held back `tests-jobs-applications` TEST-JOBS-202..204 and `tests-collaborations-polish` TEST-COLLAB-203 (authed half).
- **Fix (auth side).** Added `registerEmployer(page, opts)` to `web/e2e/util.ts` mirroring `registerWorker()`. TEST-CHAT-203 exercises both helpers in a two-context flow (worker + employer both reach `/inbox` empty-state, no `<pre>` JSON dumps).
- **Fix (fixture side).** Added `POST /test/seed/collab-conversation` to the existing `backend/src/test-only/test-seed.controller.ts` (gated by `NODE_ENV === 'test'`, mirrors the existing `POST /test/seed/admin` pattern — not user-facing production code). Plants a `Collaboration` between two registered worker / employer accounts; when status is `CONFIRMED` (default) also creates the linked `Conversation` + 2 participants + `SYSTEM` welcome message that mirrors what `ConversationService.ensureCollaborationConversation` produces on the live auto-create-on-confirm seam. Wrapped on the test side as `seedCollabConversationViaApi()` in `web/e2e/util.ts`.
- **Result.** All five `test.fixme` specs are now active and green:
  - **TEST-CHAT-200** — seeded conversation appears on `/inbox` with the SYSTEM welcome message visible in the thread.
  - **TEST-CHAT-210** — worker confirms PENDING collab via the UI; chat summary card flips from `Open inbox → /inbox` to `Open chat → /inbox/<conversationId>`; thread shows the SYSTEM welcome.
  - **TEST-CHAT-220** — two-context send/receive: A sends "hello employer …", optimistic bubble in A within 2 s, persisted bubble in B within 8 s via real WS round trip.
  - **TEST-CHAT-230** — composer file upload: 1×1 PNG via the hidden file input → in-flight chip → send button enables → submit → B's UI receives the bubble + `<img alt>`.
  - **TEST-CHAT-240** — B sends a message; A's AppShell Inbox nav badge ticks up while A is on `/jobs`; opens `/inbox/<id>` and badge clears after mark-read.
- **Side benefit (now realised 2026-05-07).** The same seed seam was extended with a sibling `POST /test/seed/job-post` endpoint, which unblocked five Playwright specs in `tests-collaborations-polish` (TEST-COLLAB-200, 202, 203 authed half, 204 non-party, 206 viewport) and five in `tests-jobs-applications` (TEST-JOBS-200, 201, 202, 204, 209). See those folders' `followups.md` for the per-spec landings. Net add: 10 cross-feature Playwright tests now green.

## [CHAT-118-001] Mark-read 2 s throttle is wall-clock, not unit-test friendly — RESOLVED 2026-05-07

- **Where.** `web/src/pages/ConversationPage.test.tsx` TEST-CHAT-118.
- **Was.** TEST-CHAT-118 asserted that a `new_message` after the 2 s throttle re-fires `PATCH /:id/read`. The throttle is a wall-clock check (`Date.now() - lastMarkReadAt < 2000`), so the test waited 2.2 s of real time.
- **Fix.** Replaced the real-time `setTimeout(2200)` with `vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 2_500)`. Real timers + MSW + fetch keep working; only the wall-clock check is shifted. Test runtime dropped from 2618 ms → 371 ms.
