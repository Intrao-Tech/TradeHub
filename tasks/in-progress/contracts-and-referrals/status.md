# Status

- State: product (spec drafted, ready to move to in-progress)
- Owner: Igor (PM); implementing engineer: Claude session
- Created: 2026-05-10
- Started: —
- Last Updated: 2026-05-10
- Shipped: —

## Notes

- **2026-05-10** — Spec drafted in single session after 4 rounds of clarification with PM. Two coupled changes: (1) Collaboration→Contract refactor (Upwork model, 1:N relationship→contracts, persistent chat at relationship level); (2) full referral system rewrite (Account ref + Project ref W→W and E→E, attribution via cookies, payouts from platform_fee with 100% cap). Old `Referral`/`ReferralOffer` "subcontract" feature dropped entirely (no archive — owner accepted).
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
