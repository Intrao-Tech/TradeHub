# Status

- State: in-progress (spec drafted; **schema reworked 2026-05-11 — code rewrite pending**)
- Owner: Igor (PM); implementing engineer: Claude session
- Created: 2026-05-10
- Started: 2026-05-10
- Last Updated: 2026-05-11
- Shipped: —

> **2026-05-11 — schema rework.** After a full DB audit the referral/contract
> data model was redesigned. Authoritative schema: `tasks/in-progress/DATA-MODEL.md`
> + `backend/prisma/schema.prisma` + `db-schema-full.sql`. `spec.md` §1 +
> banner updated; `contract.md` Schema section superseded (banner added).
> Headline changes: `account` is now a pure auth root — referral columns +
> all referral FKs moved to `client_profile`; `referral_intent` targets are
> typed FKs (`target_job_post_id` / `target_worker_id`); `escrow_transaction`
> and `pending_referral_payout` dropped (commissions are `payment` rows);
> `collaboration.last_contract_id` dropped. **Backend/frontend code +
> migration + seed must be rewritten against the new schema** — next phase.

## Notes

- **2026-05-10** — Spec drafted in single session after 4 rounds of clarification with PM. Two coupled changes: (1) Collaboration→Contract refactor (Upwork model, 1:N relationship→contracts, persistent chat at relationship level); (2) full referral system rewrite (Account ref + Project ref W→W and E→E, payouts from platform_fee with 100% cap). Old `Referral`/`ReferralOffer` "subcontract" feature dropped entirely (no archive — owner accepted).
- **2026-05-10 (afternoon revision)** — Architecture pivot on referrals: cookies → server-side `ReferralIntent` table. Cookie attribution turned out to be broken in real testing (cross-origin `Set-Cookie` dropped because `fetch` lacked `credentials:'include'`; Safari ITP would have capped to 7d anyway). New model: account-ref via pure URL (`/r/:code` → `/register?ref=`), project-ref via DB intent row keyed by logged-in actor. Anonymous viewers of project-ref links intentionally not attributed. Migration `referral_intent` added; cookie middleware + helpers + `POST /referral/track-click` deleted. See updated spec §3 (Referral domain) and the 2026-05-10 (revision) entries in Decisions Log.
- **2026-05-10 (afternoon revision)** — Contract creation gains W2W backfill (CR-038 step 2): when contract is created from a `job_post_id`, backend reads `JobApplication.project_referrer_id` from the matching application and copies it onto the contract. Without this the W2W chain (worker shares link → applicant captured → employer hires) was broken at the hire step.
- **Headline decisions** (full Decisions Log in `spec.md`):
  - Single migration `contracts_and_referrals_refactor` + new seed regenerates all dev data
  - Project ref only credits already-registered users; new-signup-via-project-link gets only Account ref
  - Cap total referral commissions at 100% of platform_fee per milestone (worker payout never reduced)
  - Account ref window default 12 months, admin-configurable, NULL=lifetime
  - All percentages live in `PlatformSetting`, no hardcoded business defaults beyond seed values
  - E→E requires target_worker match; if employer hires different worker than the one shared, no attribution
  - Conversation persists at Collaboration level across all contracts under it
  - Reviews migrate from collab-scoped to contract-scoped
- **Slice plan** (4 slices, see `contract.md`): A=schema+seed, B=contract domain backend, C=referral domain backend, D=frontend+admin
- **Owner directive:** do NOT commit during implementation. Leave changes uncommitted for review at end of session.

## Move-to-done checklist

- [ ] All `CR-NNN (Must)` requirements implemented
- [ ] All 4 slices completed
- [ ] `cd backend && npm run lint && npx prisma validate && npm run build` clean
- [ ] `cd web && npm run lint:tokens && ./node_modules/.bin/vite build` clean
- [ ] Seed regenerates a working multi-contract collab + ref-attributed signup + project-ref-attributed contract
- [ ] Manual smoke: full account-ref flow (create code → share link → fresh signup via link → make contract → fund+release → see commission)
- [ ] Manual smoke: full project-ref W→W flow
- [ ] Manual smoke: hire-again from ENDED contract
- [ ] No `console.log` of cookie payloads in shipped code
- [ ] `tasks/product/contracts-and-referrals/` moved to `tasks/done/`
- [ ] `status.md` updated: State `done`, Shipped date filled
