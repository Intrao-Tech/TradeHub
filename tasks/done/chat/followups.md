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
