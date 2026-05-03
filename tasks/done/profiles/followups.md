# Follow-ups

Owner-side Profiles work landed on `feat/profile` 2026-05-03 (see
`status.md`). The items below are intentionally **not shipped** and
each is blocked on something external. None of them are Profiles
work in the sense of needing more design — they are integration
tickets that fire when the dependency lands.

When opening these as follow-up PRs, branch from the merged
Profiles base and reference the `PROF-NNN` IDs in commits.

---

## 1. Trust ladder panel — PROF-032 / PROF-033 / PROF-034

**Blocked on:** `tasks/product/verification/` (sibling feature, owner
Artem) shipping its contract.

**What Verification needs to publish before we can build this:**
- Final `client_profile.verification_level` enum naming
  (`Unverified / Basic / Certified / Premium` per product spec
  §3.2, replacing the legacy `UNVERIFIED / IDENTITY_VERIFIED`).
- A migration that backfills existing rows.
- The `Document.rejection_reason` column (or whatever shape
  Verification picks) so the user-side document list and
  trust-ladder unhappy-path card can render the staff-provided
  reason.
- Promotion-engine timing: when does an APPROVED document advance
  the user a rung? Event-driven on `PATCH /documents/:id/status`
  is the simpler model — confirm with Verification.
- Frontend hooks: `verificationFromLevel()` in
  `web/src/components/VerificationBadge.tsx` is currently a
  legacy mapper. Once the enum unifies, drop the translation
  table and consume the values raw.

**FE work after Verification ships (~half a day):**
- Build `web/src/components/profile/TrustLadderPanel.tsx`
  rendering the four-rung ladder with state per requirement
  (`Done / Pending review / Not started`), single primary CTA
  per row, time-to-complete microcopy ("Usually takes 90
  seconds" — Stripe / Onfido pattern), explicit document-
  rejection state showing the staff-provided reason + "Re-
  upload" CTA. Mount on the user's own `/profile` Profile
  tab, after `CompletenessPanel`.
- Cap visible state at Certified until Reviews ships (the
  Premium rung renders requirement text without a resolvable
  state). When `worker_profile.rating_count` reaches 5 +
  Reviews ships, lift the cap.
- Update `DocumentsTab.tsx` so the rejection-reason render
  binds against the real field rather than the optional
  passthrough that's there now.

---

## 2. Right-to-Work submission — PROF-052 / PROF-053 / PROF-054

**Blocked on:** Verification's decision on whether to extend the
backend (`Document.doc_type` `RIGHT_TO_WORK_SHARE_CODE` /
`RIGHT_TO_WORK_DOCUMENT`, share-code validation, metadata storage)
or scope RTW out for MVP.

**FE work after the decision lands:**
- Build `web/src/components/profile/RightToWorkSection.tsx`
  with two mutually-exclusive submission paths the user picks
  from:
  - **Share code path** (non-British/Irish citizens): two text
    inputs — 9-character share code regex `^W[A-Z0-9]{8}$` +
    DOB. Submission posts to whatever endpoint Verification
    exposes.
  - **Document path** (British / Irish citizens): file upload
    of passport / passport card / passport-plus-NI-letter
    combo.
- Mount in the worker editor card on `/profile`.
- If Verification scopes RTW out, the spec authorises a fallback
  to a generic `OTHER` document upload. Land that as the v1 and
  swap to RTW-specific fields when Verification extends the
  enum.
- Add the RTW requirement to `CompletenessPanel` for workers
  (currently disabled with a comment).

---

## 3. Stripe Connect onboarding — PROF-041 / PROF-042

**Blocked on:** `BE-PROF-7` (the missing backend endpoint).

**Backend ticket BE-PROF-7:**
- `POST /worker-profiles/me/stripe-connect/onboarding-link`
  (JWT + `Roles('WORKER')`).
- Creates a Stripe Account Link, returning
  `{ url: string, expires_at: string }`. Creates a Connect
  Express account first if `client_profile.stripe_connect_account_id`
  is null.
- Webhook subscriber on `account.updated` flips
  `client_profile.stripe_onboarding_complete` when the account
  reaches `details_submitted`.
- `backend/src/stripe/` today contains only `stripe.module.ts`;
  this is the first real wiring.

**FE work (~2 hours after backend lands):**
- `web/src/components/profile/StripeConnectPanel.tsx`:
  - When `stripe_onboarding_complete === false`, show "Set up
    payouts" + CTA that POSTs to the new endpoint and opens
    the returned `url` in a new tab.
  - When `true`, show "Payouts ready" + masked
    `stripe_connect_account_id`.
- Mount on `/profile` worker editor card.
- Refresh the section on tab focus (webhook flips the flag
  out-of-band).

---

## 4. Specialisation seed — BE-PROF-5

**Blocked on:** Resolving the canonical 30-specialisation list from
`docs/TradeHub_UK_Technical_Specification_v2.docx` Appendix A. The
backend `seed.ts` currently has a partial set; we need product
sign-off on the final wording before inserting.

**Work:**
- Read Appendix A.
- Audit `backend/prisma/seed.ts` — idempotently insert any
  missing rows (skip on slug collision).
- Run `npm run db:seed` against a clean DB to verify.

---

## 5. Multi-role role extension — PROF-040 (deferred)

**Blocked on:** A backend endpoint that does not exist:
`POST /worker-profiles/me` / `POST /employer-profiles/me`
(or equivalent) to add a second sub-profile to an existing
account. Auth's `/auth/register` locks role at signup.

**Out of MVP per spec.** Re-introduce `PROF-040` ("Become a
[worker / employer]") when that endpoint lands. The schema already
permits it (shared-PK IS-A inheritance) — only the write surface
is missing.

---

## 6. Pre-merge checklist (you do)

Independent of the above, before opening the Profiles PR:

- `cd backend && npx prisma migrate dev` — applies the three
  unapplied migrations (`add_email_verification_state`,
  `add_staff_invite_expiry` from Auth, `add_worker_languages`
  from this work). Backend `tsc` errors disappear once that
  runs.
- `cd backend && npm run db:seed` — re-seed against the new
  schema if you reset.
- Manual smoke per `spec.md` Acceptance Criteria E2E-1 through
  E2E-8 in light + dark, 375 px and desktop. E2E-1 worker
  Basic-verification flow will partially fail until the
  Verification staff queue ships — that's expected; E2E-5 was
  already explicitly carved out as Verification's responsibility.

---

## Status of each spec requirement after this session

Of the 55 numbered `PROF-NNN` requirements in `spec.md`, 47 are
shipped or trivially satisfied. The remaining 8 are the items
above:

- 4 gated on Verification (PROF-032, 033, 034, 052).
- 2 gated on `BE-PROF-7` (PROF-041, 042).
- 1 deferred per spec decision (PROF-040).
- 2 Verification-side dependencies tracked here for visibility
  (PROF-053, PROF-054 — Verification owns the staff /
  share-code-flow handling).
