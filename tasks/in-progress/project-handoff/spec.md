# Spec — Project Handoff

Requirement IDs: `HANDOFF-NNN`. Builds on the shipped Contracts & Referrals
W2W project-referral rails (`tasks/in-progress/contracts-and-referrals/`).

## Summary

A worker hands a specific OPEN job to a mate via a targeted, tokenised link.
The recipient opens a landing page ("X handed you this job from <employer>"),
takes it, and applies. The resulting `JobApplication` is stamped with
`handoff_id` (employer-visible provenance) and — unless commission was waived
or the worker↔employer pairing already exists — the hander is recorded as the
W2W `project_referrer`, so the existing milestone-release payout fires on hire.

A handoff is intentionally **not** the anonymous `?ref=` link: it is a
first-class record (`JobHandoff`), targeted, employer-visible, with its own
PENDING → VIEWED → CLAIMED → APPLIED / DECLINED / REVOKED / EXPIRED lifecycle.

## User flow

1. Mike (worker) on a job that isn't for him → "Hand off this job" → optional
   note + commission toggle → gets a `/handoff/:token` link to send.
2. Bob opens the link. Logged out → prompted to log in / sign up (token
   preserved via `?next=`). Logged-in worker → sees the context + "Take this
   job" / "Pass".
3. Bob takes it → handoff CLAIMED → he lands on the job and applies.
4. Apply consumes the handoff: `JobApplication.handoff_id` set, Mike recorded
   as W2W `project_referrer` (if commission kept + new pairing), handoff →
   APPLIED, Mike notified.
5. The employer reviews applicants and sees "Handed off by Mike". Hiring is
   unchanged; on a milestone release Mike earns the W2W commission.

## Requirements

### Schema

- **HANDOFF-001 (Must).** `job_handoff` model: `id`, `job_post_id` FK→job_post
  (Cascade), `from_worker_id` FK→worker_profile (Cascade), `to_worker_id`
  FK→worker_profile NULL (SetNull), `token` VarChar(40) UNIQUE, `status`
  VarChar(20) default `PENDING`, `message` VarChar(1000) NULL,
  `earn_commission` Boolean default true, `claimed_by_id` FK→worker_profile
  NULL (SetNull), `expires_at`, `created_at`, `updated_at`. Indexes on
  `(job_post_id)`, `(from_worker_id)`, `(to_worker_id, status)`,
  `(claimed_by_id, job_post_id)`.
- **HANDOFF-002 (Must).** `job_application.handoff_id` BigInt? UNIQUE,
  FK→job_handoff (SetNull). A handoff yields at most one application.
- **HANDOFF-003 (Must).** Status values: PENDING, VIEWED, CLAIMED, APPLIED,
  DECLINED, REVOKED, EXPIRED. Open (claimable/consumable) = {PENDING, VIEWED,
  CLAIMED}. Expiry window 30 days.

### Backend — handoff domain (`backend/src/handoff/`)

- **HANDOFF-010 (Must).** `POST /job-posts/:jobPostId/handoffs` (WORKER,
  verified email). Body `{ to_worker_id?, message?, earn_commission? }`.
  Refuses a non-OPEN job (400 `JOB_CLOSED`); refuses self-target (400
  `SELF_HANDOFF`); validates a supplied `to_worker_id` exists. Returns the
  handoff incl. `token` + `link`.
- **HANDOFF-011 (Must).** A targeted handoff (`to_worker_id` set) notifies the
  target in-app (`JOB_HANDOFF`) + email (`sendJobHandoffReceived`).
- **HANDOFF-012 (Must).** `GET /handoffs/by-token/:token` (optional auth,
  public-readable). Returns job summary + hander + status + a `viewer` block
  (`is_worker`, `is_hander`, `can_claim`, `target_mismatch`). A PENDING handoff
  viewed by its eligible recipient bumps to VIEWED. Stale-but-open handoffs are
  reported (and lazily flipped) EXPIRED.
- **HANDOFF-013 (Must).** `POST /handoffs/:token/claim` (WORKER, verified).
  Guards: not the hander (400 `SELF_HANDOFF`); matches target if targeted (403);
  not expired (409 `HANDOFF_EXPIRED`); still open (409 `HANDOFF_CLOSED`). Sets
  CLAIMED + `claimed_by_id`. Idempotent for the same claimer. Notifies the hander.
- **HANDOFF-014 (Must).** `POST /handoffs/:token/decline` (WORKER). Same recipient
  guards; sets DECLINED; notifies the hander.
- **HANDOFF-015 (Must).** `POST /handoffs/:id/revoke` (WORKER). Owner-only (403);
  refuses an APPLIED handoff (409 `HANDOFF_ALREADY_USED`); sets REVOKED.
- **HANDOFF-016 (Must).** `GET /handoffs/mine` (WORKER). Returns `{ outgoing,
  incoming }` (incoming = targeted-at-me or claimed-by-me, excluding my own).
- **HANDOFF-017 (Must).** Audit events `handoff.created/claimed/applied/
  declined/revoked`.

### Backend — apply integration

- **HANDOFF-020 (Must).** `JobApplicationService.apply` consumes a handoff
  **before** the anonymous `?ref=` intent (handoff wins). `consumeForApplication`
  matches the actor's own claimed/targeted, still-open, non-expired handoff for
  the job. The application is stamped `handoff_id` regardless of commission.
- **HANDOFF-021 (Must).** Commission: the hander is set as
  `project_referrer_id` + role `WORKER` only when `earn_commission` is true,
  the hander ≠ applicant, AND the worker has no prior collaboration with this
  job's employer (the W2W "new pairing" rule, shared with the `?ref=` path).
  On success the handoff flips APPLIED and the hander is notified; the generic
  referral-attributed email is suppressed for the handoff path (handoff sends
  its own).

### Frontend

- **HANDOFF-030 (Must).** "Hand off this job" button on the worker view of the
  job detail page (alongside "Share for commission"; hidden when the job is
  closed). Dialog: optional note, "keep commission" toggle (default on),
  generates + copies the link.
- **HANDOFF-031 (Must).** `/handoff/:token` landing page. Logged out → log in /
  sign up with `?next=` preserving the token. Eligible worker → "Take this job"
  (claims then routes to the job to apply) + "Pass" (declines). Terminal/closed
  + target-mismatch + hander + non-worker states each render a clear message.
- **HANDOFF-032 (Must).** Employer applicant card shows a "Handed off by X"
  badge when `application.handoff` is present.

## Non-goals

See `brief.md`. Notably: no worker-search picker UI (open links only on FE),
no auto-hire, no new payout path, no multi-tier handoffs.

## Known limitations

- **Commission payout depends on the contract being created from the handed-off
  job post.** The hander's W2W commission rides the existing CR-038 backfill,
  which copies `JobApplication.project_referrer_id` onto the contract only when
  the contract is created with the matching `job_post_id`. If the employer
  hires the worker via "hire again", a worker-initiated collaboration, or by
  picking a *different* job in the New Contract sheet, the referrer is silently
  dropped and the hander earns nothing. This gap is inherited from the shipped
  `?ref=` design, not introduced here. Mitigations applied: the hander's
  "applied" notification scopes the promise to "if they're hired **for this
  job**". A fuller fix (default/suggest the handed-off job at contract creation,
  or backfill from the referred application regardless of `dto.job_post_id`)
  touches shared contract code and is deferred pending PM sign-off — see
  `tests-project-handoff/spec.md` follow-ups.
- **Open-season minting.** Any worker can mint a handoff link for any OPEN job
  (no prior relationship required), exactly like the existing "Share for
  commission" link. No rate limit in MVP. Accepted as consistent with `?ref=`.

## Open Questions

(none — scope confirmed with PM 2026-06-20: "explicit handoff to a named friend".)

## Decisions Log

- **2026-06-20** — Chose an explicit, first-class `JobHandoff` over reusing the
  anonymous `?ref=` link. Rationale: the PM wanted a *clearer route* than a
  referral — targeted, recipient-facing, and employer-visible — which the
  anonymous link cannot express.
- **2026-06-20** — Reuse the W2W project-referral payout rather than a new money
  path. The handoff sets the same `project_referrer_id` the `?ref=` flow uses, so
  commission, capping, and Stripe payout are unchanged.
- **2026-06-20** — Handoff takes priority over a concurrent `?ref=` intent at
  apply time (explicit intent beats anonymous click).
- **2026-06-20** — Commission obeys the existing "new worker↔employer pairing"
  rule: a handoff into an existing relationship records provenance
  (`handoff_id`) but pays no commission. Consistent with `?ref=`.
- **2026-06-20** — Recipient still applies + is accepted normally; a handoff does
  not bypass the employer's hiring decision (avoids an auth/escrow hole).
- **2026-06-20** — FE MVP creates open links (send to a friend). Backend keeps
  `to_worker_id` targeting (notify + email) for a later in-app picker.
