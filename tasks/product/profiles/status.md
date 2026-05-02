# Status

- State: product
- Owner: Product draft
- Created: 2026-05-02
- Last Updated: 2026-05-02
- Shipped:

## Notes

- Second structured feature folder, after `auth-flow`. Follows the same `brief.md` / `spec.md` / `notes.md` / `status.md` shape.
- Scope is intentionally limited to the Profiles surface (read, write, upload, verification visibility) and explicitly defers any auth-lifecycle work to `auth-flow`.
- Drafted concurrently with the Auth feature so that both tracks can run in parallel; coordination boundary is documented in `spec.md` Open Questions.
- Source inputs used for this draft:
  - product doc: `docs/TradeHub_UK_Technical_Specification_v2.docx`
  - repo docs: `README.md`, `CLAUDE.md`, `web/CLAUDE.md`
  - current code paths: `backend/src/{client-profile,worker-profile,employer-profile,portfolio,document,account}/*`, `backend/prisma/schema.prisma`, `web/src/pages/{ProfilePage,WorkerSearchPage,EmployerSearchPage,AdminPage}.tsx`, `web/src/{api.ts,App.tsx,components/*}`
  - parallel feature: `tasks/product/auth-flow/{brief,spec,notes,status}.md`
  - in-progress backlog: `tasks/in-progress/research.md` §2 (Profiles)
- Methodology: Spec-Driven Development (GitHub Spec Kit). Stable requirement IDs `PROF-001` … `PROF-050` for traceability.
