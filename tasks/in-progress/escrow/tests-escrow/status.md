# Status — tests-escrow

- State: in-progress (scaffold drafted, real cases pending Slice A start)
- Owner: TBA — same engineer as escrow Slice A
- Created: 2026-05-09
- Started: TBA (parallel to escrow Slice A)
- Last Updated: 2026-05-09
- Shipped: —

## Notes

- **2026-05-09** — Scaffold created alongside `tasks/in-progress/escrow/` spec drafting. `brief.md`, `spec.md` (placeholder with layer breakdown + file plan), `coverage-matrix.md` (skeleton with all 101 ESCROW-NNN requirements mapped to TEST-ESCROW-NNN slots — all 🔴), and this `status.md`.
- Real `TEST-ESCROW-NNN` cases are written **as the corresponding ESCROW-NNN requirement is implemented**, not retrospectively. Per `PROMPTS.md §2`, this is a parallel session to implementation — not a sequential follow-up.
- Coverage matrix locked: every (Must) requirement has a TEST-ESCROW-NNN slot. Filling each slot = one PR's worth of test work.
- `stripe-mock` (Docker container, official Stripe image) is the test-side Stripe API. Real Stripe never called in tests. CI step boots `stripe-mock` before backend e2e suite.
- Date / time isolation via injectable `Clock` Nest provider. Auto-release (7 days) and contract auto-end (7 days) tests fast-forward the clock.

## Source inputs available

- Parent feature: `tasks/in-progress/escrow/spec.md` — the ESCROW-NNN contract this test suite proves.
- `tasks/in-progress/escrow/contract.md` — sealed schema + endpoints + audit events.
- `tasks/in-progress/escrow/notes.md` — Stripe Connect patterns, idempotency keys, webhook coverage.
- `tasks/done/verification/tests-verification/` — precedent for test infrastructure (pattern reuse).
- `tasks/done/chat/tests-chat/` — precedent for webhook + WS test setup.
- `backend/test/util/factories.ts` — shared test factories (already exists, extend with escrow factories).
- `backend/test/util/storage-stub.ts` — already exists for file uploads; pattern to follow for `stripe-mock` URL override.

## Move-to-done checklist

When this folder moves to `tasks/done/escrow/tests-escrow/` (nested under shipped feature):

- [ ] All ESCROW-NNN (Must) requirements have ≥1 TEST-ESCROW-NNN case
- [ ] Coverage matrix shows ≥90% green for Must, ≥70% for Should, ≥50% for Could
- [ ] All TEST-ESCROW-NNN cases pass in CI on green pipeline
- [ ] No 🟡 (skipped) without followup ID + reason
- [ ] All Playwright happy-path scenarios pass
- [ ] Backend e2e suite + frontend MSW suite + unit suite all parallelizable, total CI time <10 minutes
- [ ] `stripe-mock` Docker container in `docker-compose.test.yml`, CI green-flagged
- [ ] `followups.md` documented (production bugs surfaced but deferred to fix(escrow): X PRs)
- [ ] Final report: green-test counts by layer (U / E2E-B / E2E-WH / F / PW) + coverage matrix snapshot
- [ ] `status.md` updated: State `done`, Shipped date filled
