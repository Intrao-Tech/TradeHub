# Status

- State: product (brief only — spec / notes / contract to be drafted by feature owner)
- Owner: Artem (carved out from Profiles on 2026-05-03)
- Created: 2026-05-03
- Last Updated: 2026-05-03
- Shipped:

## Notes

- Created as a sibling feature folder when the manual staff document approval flow was carved out of Profiles. See `tasks/done/profiles/spec.md` Decisions Log entry "Verification carved out as a sibling feature" for the boundary rationale.
- Brief is intentionally high-level. The feature owner's AI is expected to produce `spec.md`, `notes.md`, and `contract.md` following the same SDD discipline used by `auth-flow/` (now in `tasks/done/`) and Profiles (now in `tasks/done/`).
- **2026-05-03**: Profiles owner-side surface shipped (`tasks/done/profiles/`). Profiles' user-side `DocumentsTab` consumes `Document.status` today and renders `Document.rejection_reason` against an optional passthrough field; Verification needs to publish that column for rejection text to appear. Trust-ladder panel (PROF-032 / 033 / 034) and Right-to-Work submission (PROF-052) are explicitly held until Verification's contract is sealed — see `tasks/done/profiles/followups.md` §1 and §2 for what Profiles is waiting on and the integration shape.
- Profiles (`tasks/done/profiles/`) consumes this feature's contract — see Profiles `spec.md` "Sealed Verification dependencies" subsection at the top of Requirements for the consumed surface. Coordinate any contract changes with the Profiles owner before changing field names that landed in production.
- The Right-to-Work backend scope is undecided as of carve-out. Profiles' `PROF-052` is held until that decision lands; the spec authorises a generic-`OTHER`-doc fallback if Verification scopes RTW out.

## Source inputs available to the drafting AI

- Product doc: `docs/TradeHub_UK_Technical_Specification_v2.docx` (§3.1, §3.2, §10, Appendix B)
- Existing backend code: `backend/src/document/`, `backend/src/verification/`, `backend/prisma/schema.prisma` (ClientProfile, Document, VerificationMilestone)
- Existing frontend: `web/src/pages/AdminPage.tsx` (staff side, Documents tab around `:624`), `web/src/components/VerificationBadge.tsx` (legacy vocabulary)
- Adjacent specs (both shipped): `tasks/done/auth-flow/{spec,contract,notes,status}.md`, `tasks/done/profiles/{brief,spec,notes,contract,status,followups}.md`
- Backlog inventory: `tasks/in-progress/research.md` §11 (Documents), §12 (Staff/Admin)
