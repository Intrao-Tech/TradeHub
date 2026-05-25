# Coverage Matrix — tests-verification

Maps every `VER-NNN` requirement (per `tasks/done/verification/spec.md`) to the
`TEST-VER-NNN` IDs that guard it. Authored at the end of the implementation
pass per TEST-VER-603.

Where a requirement is covered both at the unit and the e2e layer, both IDs
are listed. Skipped tests (un-shipped prerequisites or harness-blocked
branches) are flagged with `.skip`.

## Trust-ladder vocabulary & engine

| VER- | Test IDs | File(s) |
|---|---|---|
| VER-001 | TEST-VER-100..107 | `promotion-engine.service.spec.ts` |
| VER-002 | TEST-VER-100..107 | `promotion-engine.service.spec.ts` |
| VER-003 | TEST-VER-100, TEST-VER-101 | `promotion-engine.service.spec.ts` (truth tables) |
| VER-004 | TEST-VER-106 | `promotion-engine.service.spec.ts` (demotion path) |
| VER-005 | TEST-VER-100, TEST-VER-101, TEST-VER-154 | engine + ladder PREMIUM=COMING_SOON |
| VER-006 | TEST-VER-101 | engine employer truth table |
| VER-010 | TEST-VER-100 | engine worker truth table |
| VER-011 | TEST-VER-100 | engine worker BASIC predicate |
| VER-012 | TEST-VER-100, TEST-VER-101, TEST-VER-214 | engine + e2e employer Certified |
| VER-013 | TEST-VER-100, TEST-VER-101 | engine PREMIUM predicate |
| VER-014 | TEST-VER-102, TEST-VER-103, TEST-VER-105 | milestone shape + idempotency + audit row |

## Stripe Identity & webhooks

| VER- | Test IDs | File(s) |
|---|---|---|
| VER-020 | TEST-VER-254 (deprecated `/start`/`/status` smoke — covered by harness skip) | `verification.reads.e2e-spec.ts` (skipped pending Stripe stub) |
| VER-021 | TEST-VER-140, TEST-VER-200 | `verification.service.spec.ts` + identity e2e (503 path) |
| VER-022 | TEST-VER-141, TEST-VER-200 (`.skip` on already-verified branch — needs Stripe stub) | unit + e2e |
| VER-023 | TEST-VER-142 | `verification.service.spec.ts` |
| VER-024 | TEST-VER-143, TEST-VER-145 | webhook verified + requires_input |
| VER-025 | TEST-VER-144 | webhook idempotency |
| VER-026 | TEST-VER-320..322 (deferred to ProfilePage tests; spec scope reduced) | n/a — not authored this PR; ProfilePage CTA scope deferred |
| VER-027 | TEST-VER-148, TEST-VER-201 | `verification.service.spec.ts` + identity e2e |

## Documents (review, assignment, validator)

| VER- | Test IDs | File(s) |
|---|---|---|
| VER-030 | TEST-VER-110..117, TEST-VER-210..213 | unit review + e2e |
| VER-031 | TEST-VER-110, TEST-VER-211 | reject path |
| VER-032 | TEST-VER-110, TEST-VER-111, TEST-VER-211, TEST-VER-212 | reject + validation |
| VER-033 | TEST-VER-112, TEST-VER-113, TEST-VER-114, TEST-VER-210, TEST-VER-212 | approve flow |
| VER-035 | TEST-VER-160..164, TEST-VER-260..262 | queue scoping |
| VER-036 | TEST-VER-160, TEST-VER-260 | scope filters |
| VER-037 | TEST-VER-115, TEST-VER-212 | terminal-status guard |
| VER-040 | TEST-VER-170..174, TEST-VER-240..245, TEST-VER-270 | metadata validator |
| VER-041 | TEST-VER-172, TEST-VER-270 | OTHER metadata title |
| VER-043 | TEST-VER-240 (RTW auxiliary) | RTW e2e |
| VER-051 | TEST-VER-117 | doc-type → milestone-type mapping |

## Workload + assignment

| VER- | Test IDs | File(s) |
|---|---|---|
| VER-070 | TEST-VER-162, TEST-VER-261 | sort/pagination, oldest-first |
| VER-072 | TEST-VER-302, TEST-VER-305 | UI approve/reject; terminal disable |
| VER-073 | TEST-VER-303 | UI reject reason flow |
| VER-074 | TEST-VER-164, TEST-VER-262 | getOne + history |
| VER-090 | TEST-VER-310..313 | MilestonesStrip flag projection |
| VER-091 | TEST-PROF-108 (existing, not duplicated) | VerificationBadge vocabulary |
| VER-092 | TEST-VER-170, TEST-VER-240, TEST-VER-241, TEST-VER-270, TEST-VER-306 | RTW share code |
| VER-093 | TEST-VER-310, TEST-VER-312 | strip render + empty state |
| VER-094 | TEST-VER-311, TEST-VER-313 | reviews chip + cert label table |
| VER-125 | TEST-VER-120, TEST-VER-220, TEST-VER-223 | pickNextAssignee + reassign |
| VER-126 | TEST-VER-121, TEST-VER-220 | upload-time auto-assign |
| VER-127 | TEST-VER-125, TEST-VER-223, TEST-VER-225 | reassignFromStaff + terminal not reassigned |
| VER-128 | TEST-VER-123, TEST-VER-222 | assignToStaff validation |
| VER-130 | TEST-VER-160, TEST-VER-260 | queue scoping |
| VER-131 | TEST-VER-161, TEST-VER-261 | status filter + scope |
| VER-132 | TEST-VER-116, TEST-VER-213 | assignee gating |
| VER-137 | TEST-VER-124, TEST-VER-221 | claim race + ALREADY_ASSIGNED (FU-VER-1) |

## Companies House

| VER- | Test IDs | File(s) |
|---|---|---|
| VER-140 | TEST-VER-130, TEST-VER-235 | not-configured |
| VER-141 | TEST-VER-131, TEST-VER-132, TEST-VER-231 | details missing + 404 |
| VER-142 | TEST-VER-133, TEST-VER-134, TEST-VER-232, TEST-VER-233 | mismatch (FU-VER-2) |
| VER-143 | TEST-VER-135, TEST-VER-234 | upstream errors |
| VER-144 | TEST-VER-236 (`.skip` — per-employer cap not shipped) | rate-limit (Should) |
| VER-145 | TEST-VER-136, TEST-VER-137, TEST-VER-138, TEST-VER-230 | match path + name normalisation (FU-VER-3) |
| VER-146 | TEST-VER-171, TEST-VER-243, TEST-VER-244 | HMRC CIS validator |
| VER-149 | TEST-VER-243 | audit row redaction |

## Public reads

| VER- | Test IDs | File(s) |
|---|---|---|
| VER-053 | TEST-VER-150, TEST-VER-250 | `/verification/me` |
| VER-060 | TEST-VER-151, TEST-VER-251 | `/verification/levels/:id` |
| VER-060a | TEST-VER-151, TEST-VER-251 | deactivated → 404 |
| VER-061 | TEST-VER-153, TEST-VER-154, TEST-VER-252 | `/verification/ladder/:id` |

## Coverage thresholds + guardrails

| VER- | Test IDs | Status |
|---|---|---|
| VER-acceptance (E2E) | TEST-VER-410 (guardrails Playwright spec authored) | TEST-VER-400..409 are deferred — Stripe webhook signing harness not yet wired. Documented in status.md |
| VER-extras "no <pre> dumps" | TEST-VER-307, TEST-VER-410 | unit + e2e |
| VER-extras leak prevention | TEST-VER-152, TEST-VER-251 | substring grep over response |

## Skipped tests (with citations)

- **TEST-VER-200** "BASIC user → 409 ALREADY_VERIFIED" — needs Stripe stub harness (TEST-VER-005).
- **TEST-VER-200** "PENDING_EMAIL_VERIFICATION → 403" — same reason; the 503 STRIPE_NOT_CONFIGURED short-circuits before reaching the guard.
- **TEST-VER-202..203** Stripe webhook fixture replays — needs signed-payload helper at the controller level.
- **TEST-VER-236** Companies House per-employer rate cap — VER-144 not shipped per OQ-3.
- **TEST-VER-254** Deprecated `/verification/start` and `/verification/status` smoke — locked at the unit layer via `verification.service.spec.ts`; e2e smoke deferred.
- **TEST-VER-330..331** inbox row + WorkerCard/EmployerCard verification badge — pre-existing failing tests in those files reference legacy "KYC verified" / "HMRC confirmed" copy (FU-VER-4); duplicating them here would compound the drift.
- **TEST-VER-400..409** end-to-end Playwright flows that drive Stripe redirect + webhook replay — same as above plus require backend boot + Vite + Postgres Testcontainer; only TEST-VER-410 (guardrails) is authored.

## Out-of-scope per spec

- Tests for `verificationFromLevel` / `<VerificationBadge>` (TEST-PROF-108 already covers these).
- Tests for Auth's `verificationState` (locked in `tests-auth-flow`).
- Real Stripe / Companies House / Resend network calls.

## Followups discovered while authoring

See `followups.md`:
1. **FU-VER-1** — claim error code 400 vs spec 409.
2. **FU-VER-2** — Companies House mismatch error codes (403 vs 400).
3. **FU-VER-3** — `normaliseCompanyName` PLC substitution pre-empted by LIMITED rule.
4. **FU-VER-4** — Pre-existing Profiles tests reference legacy verification vocabulary.

The first three are tracked as recommended single-call-site fixes; the
fourth is a Profiles-side cleanup PR.
