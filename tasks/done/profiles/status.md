# Status

- State: shipped (owner-side complete; follow-ups blocked on sibling tracks)
- Owner: Igor (full-stack)
- Created: 2026-05-02
- Last Updated: 2026-05-03
- Shipped: 2026-05-03 on branch `feat/profile`. 12 commits, baseline `d1a65fe`.
  - Slice A (PROF-010, 011, 013, 051) — `f22a54a`
  - BE-PROF-1 — `f60e326`
  - Slice B (PROF-012, 014–019) — `1be020b`
  - Slice C (PROF-001, 002, 005–009) — `f1ecad9`
  - BE-PROF-2 — `fc414e6`
  - Slice D (PROF-020–027) — `3917d45`
  - Slice E partial (PROF-028, 029, 030, 031) — `a819237`
  - Slice F (PROF-035, 036, 037, 038, 039, 044–050) — `e3f0965`
  - Slice H (PROF-003, 004) — `acbf8de`
  - BE-PROF-3 + BE-PROF-8 + specialisations UI — `41396ca`
  - BE-PROF-6 + slice G partial (PROF-055) — `8d3ffbf`
- Follow-ups (gated on external dependencies — see `followups.md`):
  - PROF-032 / 033 / 034 — trust ladder; depends on Verification track
  - PROF-052 / 053 / 054 — Right-to-Work submission; depends on Verification track
  - PROF-041 / 042 — Stripe Connect onboarding state; gated on BE-PROF-7
  - BE-PROF-5 — specialisation seed audit against product-spec Appendix A
  - PROF-040 — multi-role role-extension (backend endpoint missing)

## Notes

- Second structured feature folder, after `auth-flow`. Follows the same `brief.md` / `spec.md` / `notes.md` / `status.md` shape.
- Scope is intentionally limited to the Profiles surface (read, write, upload, verification visibility) and explicitly defers any auth-lifecycle work to `auth-flow`.
- Drafted concurrently with the Auth feature so that both tracks can run in parallel; coordination boundary is documented in `spec.md` Open Questions.
- **2026-05-03**: Reconciled with the now-shipped Auth contract (`tasks/done/auth-flow/contract.md`). Account-state vocabulary, banner reuse, security-page boundary, `MarketplaceRouter` registration, and `useAccountMe` hook (`PROF-051`) all aligned. Decisions Log appended in `spec.md`.
- **2026-05-03**: Re-validated product shape via surf research against the actual analogue stack (LinkedIn-for-trades + UK B2B comparators SubbieUK / Subcontractee + UK Right-to-Work + KYC ladder UX from Stripe / Onfido / Persona + CSCS / Gas Safe / NICEIC). Closed gaps: added Right-to-Work flow (`PROF-052`–`PROF-054`), languages (`PROF-055`), tightened verification ladder UX (`PROF-033` / `PROF-034`). Backend prerequisites consolidated into `BE-PROF-1`…`BE-PROF-8`. Eight end-to-end acceptance scenarios (E2E-1…E2E-8) replace the prior bullet list. `contract.md` skeleton drafted — ready for the implementation session to seal and move to `in-progress/`.
- Source inputs used for this draft:
  - product doc: `docs/TradeHub_UK_Technical_Specification_v2.docx`
  - repo docs: `README.md`, `CLAUDE.md`, `web/CLAUDE.md`
  - current code paths: `backend/src/{client-profile,worker-profile,employer-profile,portfolio,document,account}/*`, `backend/prisma/schema.prisma`, `web/src/pages/{ProfilePage,WorkerSearchPage,EmployerSearchPage,AdminPage}.tsx`, `web/src/{api.ts,App.tsx,components/*}`
  - parallel feature: `tasks/done/auth-flow/{brief,spec,notes,status}.md`
  - in-progress backlog: `tasks/in-progress/research.md` §2 (Profiles)
- Methodology: Spec-Driven Development (GitHub Spec Kit). Stable requirement IDs `PROF-001` … `PROF-050` for traceability.
