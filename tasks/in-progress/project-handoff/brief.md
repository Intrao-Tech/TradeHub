# Brief — Project Handoff

## Feature

An explicit **worker → worker job handoff**: a tradesperson who won't take a
job can hand it directly to a specific mate via a targeted link. The mate lands
on a page that says "Mike handed you this job from ACME", takes it in one tap,
and applies as a normal applicant — with the employer seeing "handed off by
Mike". If a hire results, the hander keeps a referral commission (opt-out).

## Problem

The platform already has an **anonymous** worker→worker commission link
(`/jobs/:id?ref=CODE`, the "Share for commission" button) — but it is invisible
to the recipient and the employer, untargeted (any clicker is attributed), and
reads as a referral, not a deliberate "I'm giving you this job". Internal
testing (Igor, 2026-06) flagged that "передача проєктів" — actually handing a
project to a named person with a clear route — did not exist. Workers want to
pass real leads to mates they trust, visibly and intentionally.

## Goal

A first-class, targeted, employer-visible handoff with its own
accept/decline/revoke lifecycle, reusing the existing W2W commission rails so
the hander still earns on a hire — without building a second payout system.

## Users

- **Hander** (worker): finds a job not for them, hands it to a mate.
- **Recipient** (worker, may be unregistered): receives the link, takes or
  passes the job.
- **Employer**: sees who handed a job to an applicant when reviewing them.

## Expected outcome

More trusted leads flowing between tradespeople, with clear provenance and no
surprise charges (commission is paid from the platform fee, never the worker's
pay).

## Constraints / out of scope (MVP)

- Reuses the existing W2W project-referral payout — no new money path.
- The employer's hiring decision is unchanged: a handoff recipient applies and
  is accepted like any applicant (no auto-hire / fast bypass of review).
- Frontend creates **open links** (send to a friend) + optional note + commission
  toggle. Backend also supports targeting a registered worker by id (in-app
  notification + email), but the worker-search picker UI is deferred.
- GBP only; single handoff link per click (the hander can create more).
- No anti-fraud beyond self-handoff + target guards.
