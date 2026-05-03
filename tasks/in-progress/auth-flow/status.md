# Status

- State: in-progress
- Owner: Artem (full-stack — backend + frontend, sole owner of auth-flow scope)
- Created: 2026-04-24
- Last Updated: 2026-05-03
- Shipped:

## Notes

- Moved from `product/` → `in-progress/` on 2026-04-26 after spec was reviewed and all six initial Open Questions were resolved (see `spec.md` Decisions Log).
- Single-owner scope: backend (NestJS + Prisma migrations + mail templates + rate limiting + audit) and frontend (React pages + AuthShell-wrapped flows + design-system compliance).
- Companion implementation contract lives in `contract.md` — concrete API shapes, token-model column names, env vars, storage strategy, and post-login routing table.
- Companion implementation plan lives in `notes.md` under "Implementation plan" — ordered list of backend (`BE-NN`) and frontend (`FE-NN`) tasks plus the migration, mail-template, and lint pre-flight steps.
- Adjacent feature: `tasks/product/profiles/` (Igor) — depends on the post-login redirect contract (AUTH-014-002) landing the user on `/profile`. Coordinate any change to that target with the profiles spec owner.
- All decisions during implementation must follow the working principle in `CLAUDE.md` → "Specs are living documents": new Open Questions go in `spec.md`, never in `notes.md`; resolutions move them into a numbered requirement and append to the Decisions Log with a date.

## Source inputs used for the draft

- repo docs: `README.md`, `CLAUDE.md`, `web/CLAUDE.md`
- product doc: `docs/TradeHub_UK_Technical_Specification_v2.docx`
- current code paths in `backend/src/auth`, `backend/src/account`, `backend/src/mail`, `web/src/api.ts`, and auth-related pages in `web/src/pages`
- adjacent feature spec: `tasks/product/profiles/spec.md` (post-login landing target)
