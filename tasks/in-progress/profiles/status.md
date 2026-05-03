# Status

- State: product (ready to move to in-progress)
- Owner: Igor (full-stack)
- Created: 2026-05-02
- Last Updated: 2026-05-03
- Shipped:

## Notes

- Second structured feature folder, after `auth-flow`. Follows the same `brief.md` / `spec.md` / `notes.md` / `status.md` shape.
- Scope is intentionally limited to the Profiles surface (read, write, upload, verification visibility) and explicitly defers any auth-lifecycle work to `auth-flow`.
- Drafted concurrently with the Auth feature so that both tracks can run in parallel; coordination boundary is documented in `spec.md` Open Questions.
- **2026-05-03**: Reconciled with the now-shipped Auth contract (`tasks/in-progress/auth-flow/contract.md`). Account-state vocabulary, banner reuse, security-page boundary, `MarketplaceRouter` registration, and `useAccountMe` hook (`PROF-051`) all aligned. Decisions Log appended in `spec.md`.
- **2026-05-03**: Re-validated product shape via surf research against the actual analogue stack (LinkedIn-for-trades + UK B2B comparators SubbieUK / Subcontractee + UK Right-to-Work + KYC ladder UX from Stripe / Onfido / Persona + CSCS / Gas Safe / NICEIC). Closed gaps: added Right-to-Work flow (`PROF-052`–`PROF-054`), languages (`PROF-055`), tightened verification ladder UX (`PROF-033` / `PROF-034`). Backend prerequisites consolidated into `BE-PROF-1`…`BE-PROF-8`. Eight end-to-end acceptance scenarios (E2E-1…E2E-8) replace the prior bullet list. `contract.md` skeleton drafted — ready for the implementation session to seal and move to `in-progress/`.
- Source inputs used for this draft:
  - product doc: `docs/TradeHub_UK_Technical_Specification_v2.docx`
  - repo docs: `README.md`, `CLAUDE.md`, `web/CLAUDE.md`
  - current code paths: `backend/src/{client-profile,worker-profile,employer-profile,portfolio,document,account}/*`, `backend/prisma/schema.prisma`, `web/src/pages/{ProfilePage,WorkerSearchPage,EmployerSearchPage,AdminPage}.tsx`, `web/src/{api.ts,App.tsx,components/*}`
  - parallel feature: `tasks/product/auth-flow/{brief,spec,notes,status}.md`
  - in-progress backlog: `tasks/in-progress/research.md` §2 (Profiles)
- Methodology: Spec-Driven Development (GitHub Spec Kit). Stable requirement IDs `PROF-001` … `PROF-050` for traceability.
