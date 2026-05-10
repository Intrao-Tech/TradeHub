# Status

- State: spec-drafted (not yet implemented)
- Owner: Igor (PM); implementing engineer TBA
- Created: 2026-05-10
- Started: —
- Last Updated: 2026-05-10
- Shipped: —

## Notes

- **2026-05-10** — Spec drafted in same session as the contracts-and-referrals
  feature spec, immediately after the implementation slice closed. Tests are
  not yet written; this folder is the contract for the next session.
- **Slice plan**:
  - **A** — schema invariants + ReferralService cap math (U + E2E-B); delete old
    `collaboration.service.spec.ts.deferred` + dropped Subcontract specs.
  - **B** — Contract lifecycle E2E-B (TEST-CR-030..052).
  - **C** — Referral attribution + commission credit on release (TEST-CR-060..077).
  - **D** — Backfill sweep + retry endpoint (TEST-CR-080..085).
  - **E** — Frontend unit (TEST-CR-100..112).
  - Playwright e2e deferred to a separate `tests-cr-playwright` folder once
    UX stabilises.
- **2026-05-10** — Coverage-matrix shows 5 / 73 Must rows green at spec-time
  (purely from migration/build wiring). Implementation will move 68 from ⬜
  to ✅.

## Move-to-done checklist

- [ ] All `TEST-CR-NNN (Must)` files implemented and passing
- [ ] `cd backend && npx jest` green (existing + new)
- [ ] `cd web && npx vitest run` green (existing + new)
- [ ] `cd backend && npm run lint` clean
- [ ] `cd web && npm run lint:tokens` clean
- [ ] `coverage-matrix.md` shows every Must row ✅
- [ ] `followups.md` documents anything skipped/deferred with reasoning
- [ ] `status.md` updated: State `done`, Shipped date filled
