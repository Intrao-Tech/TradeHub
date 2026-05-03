# Status

- State: product (brief only — spec / notes / contract to be drafted by feature owner)
- Owner: Artem (carved out from `profiles/` on 2026-05-03)
- Created: 2026-05-03
- Last Updated: 2026-05-03
- Shipped:

## Notes

- Created as a sibling feature folder when the manual staff document approval flow was carved out of `tasks/product/profiles/`. See profiles `spec.md` Decisions Log entry "Verification carved out as a sibling feature" for the boundary rationale.
- Brief is intentionally high-level. The feature owner's AI is expected to produce `spec.md`, `notes.md`, and `contract.md` following the same SDD discipline used by `auth-flow/` and `profiles/`.
- Profiles (`tasks/product/profiles/`) consumes this feature's contract — see profiles `spec.md` "Sealed Verification dependencies" subsection at the top of Requirements for the consumed surface. Coordinate any contract changes with the profiles spec owner.
- The Right-to-Work backend scope is undecided as of carve-out. Profiles' `PROF-052` ships the frontend either way and falls back to a generic upload if Verification scopes RTW out.

## Source inputs available to the drafting AI

- Product doc: `docs/TradeHub_UK_Technical_Specification_v2.docx` (§3.1, §3.2, §10, Appendix B)
- Existing backend code: `backend/src/document/`, `backend/src/verification/`, `backend/prisma/schema.prisma` (ClientProfile, Document, VerificationMilestone)
- Existing frontend: `web/src/pages/AdminPage.tsx` (staff side, Documents tab around `:624`), `web/src/components/VerificationBadge.tsx` (legacy vocabulary)
- Adjacent specs: `tasks/in-progress/auth-flow/{spec,contract,notes,status}.md`, `tasks/product/profiles/{brief,spec,notes,contract,status}.md`
- Backlog inventory: `tasks/in-progress/research.md` §11 (Documents), §12 (Staff/Admin)
