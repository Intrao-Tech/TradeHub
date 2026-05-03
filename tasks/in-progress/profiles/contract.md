# Contract — profiles

Concrete technical decisions for implementation. Drafted **2026-05-03**, ready to seal at the start of the implementation session.

This document is **the single source of API shapes, env vars, DB columns, file-upload limits, and routing rules for Profiles**. Any deviation in code is a bug. Any change to this document must come with a matching update in `spec.md` (Decisions Log) per the working principle in repo `CLAUDE.md`.

Reads `tasks/in-progress/auth-flow/contract.md` (sealed 2026-04-26) as an authoritative upstream — never duplicate the auth-shaped surface here.

---

## 1. Backend prerequisites (must land before all Must requirements complete)

Bundled from `spec.md` §14. Each item maps to a backend ticket.

### `BE-PROF-1` — Avatar upload endpoint

`POST /client-profiles/me/avatar` — JWT-only. Multipart, field `file`. Multer with disk storage, route-scoped limit `fileSize: 5 * 1024 * 1024`, MIME whitelist `image/jpeg | image/png | image/webp`. Server: validates dimensions ≥ 256×256 (sharp probe), writes to `./uploads/{uuid}.{ext}`, deletes the prior `client_profile.avatar_url` file if any, sets the new path. Response: `{ avatar_url: string }`. Errors: `400 IMAGE_TOO_SMALL`, `400 INVALID_MIME`, `413 FILE_TOO_LARGE`.

### `BE-PROF-2` — Portfolio media file-upload endpoint

`POST /portfolio/:id/media/upload` — JWT + `Roles('WORKER')`. Multipart, field `file`, optional form fields `caption`, `sort_order`. Same Multer config as `BE-PROF-1` but `fileSize: 10 * 1024 * 1024`. Server: writes file, creates `PortfolioMedia { portfolio_item_id, media_url, caption?, sort_order }`. Response: the new `PortfolioMedia` row. Existing `POST /portfolio/:id/media` (URL-only) is left in place for programmatic use.

### `BE-PROF-3` — Worker ↔ specialisation linking

- `POST /worker-profiles/me/specialisations/:specialisationId` — JWT + `Roles('WORKER')`. Idempotent upsert into `worker_specialisation`. Optional body `{ is_primary?: boolean }`. Response: the row.
- `DELETE /worker-profiles/me/specialisations/:specialisationId` — JWT + `Roles('WORKER')`. Idempotent. Response `204`.

### ~~`BE-PROF-4` — Document model extensions~~

**Moved to Verification feature** (`tasks/product/verification/`). Profiles consumes whatever shape Verification ships. If Verification adds `Document.rejection_reason`, Profiles renders it (`PROF-030` / `PROF-033`); if Verification adds RTW `doc_type` values, the RTW frontend (`PROF-052`) posts to them; otherwise Profiles falls back to a generic `OTHER` upload.

### `BE-PROF-5` — Specialisation seed

Audit `backend/prisma/seed.ts`. Ensure all 30 specialisations from product spec Appendix A are seeded. Idempotent insert: skip on slug collision.

### `BE-PROF-6` — Worker languages

Prisma migration `add_worker_languages`:

```prisma
model WorkerProfile {
  // existing
  languages String[] @default([])  // ISO 639-1 codes
}
```

`PATCH /worker-profiles/me` accepts `languages?: string[]` (validated against ISO 639-1).

### `BE-PROF-7` — Stripe Connect onboarding

`POST /worker-profiles/me/stripe-connect/onboarding-link` — JWT + `Roles('WORKER')`. Creates a Stripe Account Link (creating the Connect Express account first if `client_profile.stripe_connect_account_id` is null). Response: `{ url: string, expires_at: string }`. Backend wires the existing `account.updated` Stripe webhook to flip `client_profile.stripe_onboarding_complete` when the account reaches `details_submitted`.

### `BE-PROF-8` — Multer global hardening

In `backend/src/document/document.controller.ts` (and the new endpoints above) attach explicit Multer options at route scope: `limits: { fileSize }`, `fileFilter` enforcing MIME whitelist. No reliance on Multer defaults.

---

## 2. Frontend routing additions

Register inside `MarketplaceRouter` (Auth contract §10 split). Lazy-loaded.

| Path | Component | Auth | Source endpoint |
|---|---|---|---|
| `/workers/:id` | `WorkerDetailPage` | public | `GET /worker-profiles/:id` + `GET /portfolio/worker/:id` |
| `/employers/:id` | `EmployerDetailPage` | public | `GET /employer-profiles/:id` |
| `/clients/:slug` | `ClientPublicProfilePage` | public | `GET /client-profiles/:slug` |
| `/clients` | `ClientDirectoryPage` (Should) | public | `GET /client-profiles` |

`/profile` route stays as the user's own profile (Auth `postAuthRedirect` lands ACTIVE workers / employers there).

---

## 3. New frontend modules

```
web/src/
  hooks/
    useAccountMe.ts                # PROF-051 — singleton GET /account/me cache
  pages/
    WorkerDetailPage.tsx           # PROF-001
    EmployerDetailPage.tsx         # PROF-002
    ClientPublicProfilePage.tsx    # PROF-003
    ClientDirectoryPage.tsx        # PROF-004 (Should)
  components/profile/
    ProfileHeader.tsx              # avatar + name + role + location + badge + rating
    ProfileTabs.tsx                # About / Portfolio / Certifications / Reviews
    AvatarUploader.tsx             # PROF-016 — drag-drop, square crop, preview
    PortfolioGrid.tsx              # PROF-020
    PortfolioItemEditor.tsx        # PROF-021 — branches by item_type
    PortfolioMediaUploader.tsx     # PROF-023
    DocumentLinkPicker.tsx         # PROF-026
    DocumentUploader.tsx           # PROF-029 — drag-drop + progress + retry
    DocumentList.tsx               # PROF-030
    TrustLadderPanel.tsx           # PROF-033 / PROF-034
    CompletenessPanel.tsx          # PROF-035 / PROF-037
    RightToWorkSection.tsx         # PROF-052 — share-code OR document path
    LanguagesEditor.tsx            # PROF-055
    StripeConnectPanel.tsx         # PROF-041 / PROF-042 (Should)
  lib/
    london-boroughs.ts             # PROF-015 — preset list
    iso-639-1.ts                   # PROF-055 — curated 13-language subset
```

Components live in `web/src/components/profile/` (new namespace) to keep the diff scoped and merge-friendly with Auth's `web/src/components/`.

---

## 4. Token + image handling

- **Auth**: do not duplicate. `getToken()` from `web/src/api.ts` (Auth contract §4 retains localStorage).
- **Avatar render**: prepend `VITE_API_BASE_URL` (already in `.env`) to `client_profile.avatar_url` because the field stores `/uploads/...`. Reuse the existing helper if `web/src/api.ts` exposes one; if not, add `web/src/lib/files.ts → publicFileUrl(path)`.
- **Crop library**: `react-easy-crop` (zero-dep, accessible, used widely with shadcn). Output: `Blob` via canvas. Posted as `multipart/form-data` field `file`.

---

## 5. Form validation (frontend)

All editors use `react-hook-form + zod` (already used by Auth's `RegisterPage`). Zod schemas live next to the editor file. Length caps mirror Prisma:

- `display_name`: 1–150 chars
- `bio`: 0–2000 chars (treat as `text`; cap at 2000 client-side to prevent paste-bombs)
- `city`: 1–100, must be in London-borough preset (PROF-015)
- `postcode_area`: regex `/^[A-Z]{1,2}\d{1,2}[A-Z]?$/` (UK outward code)
- `company_name`: 1–200
- `company_number`: regex `/^[A-Z0-9]{8}$/` (Companies House format)
- `team_size`: integer, 1–9999
- `years_experience`: integer, 0–80
- `day_rate_min` / `day_rate_max`: decimal(8,2), > 0, max ≥ min
- `share_code`: regex `/^W[A-Z0-9]{8}$/`
- `dob` (RTW): real date, 18+ years ago

---

## 6. Error mapping

All API calls go through Auth's `parseApiError(err)` → `ApiError`. Mapping table for new error codes:

| Backend code | UI surface |
|---|---|
| `IMAGE_TOO_SMALL` | "Avatar must be at least 256×256 px." |
| `INVALID_MIME` | "Use a JPEG, PNG, or WebP image." |
| `FILE_TOO_LARGE` (HTTP 413) | "File is too large. Max 5 MB for avatars, 10 MB for documents and portfolio media." |
| `INVALID_SHARE_CODE` | "Share code must start with W and be 9 characters." |
| `STRIPE_ONBOARDING_LINK_FAILED` | "Couldn't reach Stripe — try again in a moment." |

Generic `ApiError` falls back to its `.message` for the toast.

---

## 7. Tracking (frontend events)

Use the existing audit/analytics pipeline if Auth wired one (TBD — confirm at seal time). Profile-specific events worth emitting:

- `profile.avatar.uploaded`
- `profile.portfolio_item.created { item_type }`
- `profile.portfolio_item.edited { item_type }`
- `profile.document.uploaded { doc_type }`
- `profile.right_to_work.submitted { path: 'share_code' | 'document' }`
- `profile.completeness.changed { from, to }` (LinkedIn-style)
- `profile.public_view.opened` (on public detail pages — anonymous OK)

If no analytics pipeline exists yet, defer this section.

---

## 8. Acceptance pre-flight

Before marking PROF-* complete:

1. `cd backend && npm run lint` and `npx prisma format` clean.
2. `cd web && npm run lint:tokens` clean.
3. `cd web && ./node_modules/.bin/vite build` clean (no TS errors).
4. Manual smoke: E2E-1 through E2E-8 (`spec.md` Acceptance Criteria), light + dark, 375 px + desktop.
5. Swagger `/api/docs` visually checked for the new endpoints in `BE-PROF-1` … `BE-PROF-7`.
6. `tasks/product/profiles/` moved to `tasks/in-progress/profiles/` at the start; status moved to `shipped` at the end with the merge SHA.

---

## 9. Recommended slice order

Each slice is independently shippable and testable.

1. **Slice A — kill the JSON dump (no backend prereq).** PROF-010, PROF-011, PROF-013, PROF-051. End state: account section is structured, client + employer editors save through the existing `PATCH` endpoints. Visible win, zero blockers.
2. **Slice B — avatar + worker editor (needs `BE-PROF-1`).** PROF-012, PROF-014, PROF-015, PROF-016, PROF-017, PROF-018, PROF-019.
3. **Slice C — public detail pages (no backend prereq).** PROF-001, PROF-002, PROF-005, PROF-006, PROF-007, PROF-008, PROF-009. `WorkerCard.onSelect` finally wired.
4. **Slice D — portfolio CRUD + media + docs linkage (needs `BE-PROF-2`).** PROF-020 — PROF-027.
5. **Slice E — documents + RTW + ladder (depends on Verification feature).** PROF-028 — PROF-034, PROF-052. Implementable against the existing `Document` shape today; richer rendering (rejection reason text, RTW share-code path) gated on Verification shipping its contract.
6. **Slice F — completeness + multi-role + cross-cutting.** PROF-035 — PROF-039, PROF-044 — PROF-050.
7. **Slice G — Stripe Connect (needs `BE-PROF-7`) and languages (needs `BE-PROF-6`).** PROF-041, PROF-042, PROF-055. Defer behind the others.
8. **Slice H — `/clients` directory (Should).** PROF-003, PROF-004.
