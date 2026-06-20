# Status

- State: in-progress (implemented + tested; pending PM review)
- Owner: Igor (PM); implementing engineer: Claude session
- Created: 2026-06-20
- Started: 2026-06-20
- Last Updated: 2026-06-20
- Shipped: —

## Notes

- **2026-06-20** — Built end-to-end in one session after PM confirmed the
  intent ("explicit handoff to a named friend", not the existing anonymous
  commission link). Branch `feat/project-handoff`.
- Reuses the shipped W2W project-referral payout rails — no new money path.
- **2026-06-20 — review round.** Three review subagents (backend / frontend /
  integration) ran; no blockers. Fixed: TOCTOU race on open-link claims (atomic
  `status IN (open)` transition → 409), read-bump guard, decline/revoke guard
  parity, one-tap apply (`?apply=1` deep link), `can_claim`-false fallback
  message, checkbox token, commission-promise copy scoped to the job. Two
  inherited limitations documented in `spec.md` (commission payout depends on
  the CR-038 contract backfill; open-season minting) — same as `?ref=`.

## What landed

- **Schema**: `job_handoff` model + `job_application.handoff_id` (unique FK).
  Migration `20260620000000_project_handoff`.
- **Backend**: `backend/src/handoff/` (service, controller, dto, constants);
  consumption wired into `JobApplicationService.apply` (handoff > `?ref=`);
  `MailService.sendJobHandoffReceived`; `JOB_HANDOFF` notifications; audit
  events; `handoff` added to `applicationInclude` for employer provenance.
- **Frontend**: `HandoffButton` on the job detail worker view;
  `HandoffLandingPage` at `/handoff/:token`; "Handed off by X" badge on
  `ApplicantCard`; `components/handoff/api.ts`; route + i18n keys
  (`jobs.applicant.handedOff[By]`, en/ru/uk).

## Tests

- `backend/src/handoff/handoff.service.spec.ts` — 11 unit specs (guards/branches).
- `backend/test/cr.handoff.e2e-spec.ts` — 8 e2e (create → claim → apply →
  provenance + commission, expiry, targeting, revoke).
- `web/src/pages/HandoffLandingPage.test.tsx` — 4 component specs.
- All green. Backend `npm run build`, web `lint:tokens` + `vite build` clean.
- Test contract: `tests-project-handoff/spec.md`.

## Move-to-done checklist

- [x] All `HANDOFF-NNN (Must)` requirements implemented
- [x] Backend builds; web `lint:tokens` + `vite build` clean
- [x] Unit + e2e + FE tests green
- [ ] Manual smoke: create handoff → open link logged-out → sign up → take → apply
- [ ] Manual smoke: employer sees "Handed off by X" on the applicant
- [ ] Seed adds a demo handoff (deferred — not in seed yet)
- [ ] PM review of UX copy (English strings; i18n keys added for the badge only)
- [ ] `tasks/in-progress/project-handoff/` moved to `tasks/done/`
- [ ] `status.md` updated: State `done`, Shipped date filled
