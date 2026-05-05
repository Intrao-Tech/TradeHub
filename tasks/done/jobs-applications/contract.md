# Contract — jobs-applications

Concrete technical decisions for implementation. Sealed on **2026-05-05**.

This document is **the single source of API shapes, error mapping, routes, and component conventions** for Jobs & Applications. Any deviation in code is a bug. Any change to this document must come with a matching update in `spec.md` (Decisions Log) per the working principle in repo `CLAUDE.md`.

Reads `tasks/done/auth-flow/contract.md` (sealed 2026-04-26) and `tasks/in-progress/profiles/contract.md` as authoritative upstream — never duplicate the auth- or profiles-shaped surface here.

---

## 1. Backend prerequisites

The backend surface is already in production. Three small "Should" items polish error mapping and dashboard ergonomics.

### `BE-JOBS-1` — Aggregate counts on `GET /job-posts/me`

The Prisma include already returns `_count: { applications: number }` on every job-post payload (see `JobPostService` `jobPostInclude`). The dashboard table consumes `_count.applications` directly — no new endpoint needed.

For per-status grouping (`pending`, `reviewed`, `shortlisted`, `accepted`, `rejected`, `withdrawn`) on the `/my-jobs/:id/applicants` tabs, the page calls `GET /job-applications/jobs/:jobPostId` once and counts client-side; the response already lists every application with status.

If at scale the per-row applicants fetch becomes expensive, extend the response shape to:

```ts
type JobPostRow = JobPost & {
  _count: { applications: number };
  application_summary?: {
    pending: number;
    reviewed: number;
    shortlisted: number;
    accepted: number;
    rejected: number;
    withdrawn: number;
  };
};
```

Not blocking MVP.

### `BE-JOBS-2` — Structured `409 ALREADY_APPLIED`

`JobApplicationService.apply()` currently throws `BadRequestException('You have already applied to this job')`. Replace with:

```ts
throw new ConflictException({
  code: 'ALREADY_APPLIED',
  message: 'You have already applied to this job',
});
```

So `parseApiError(err).code === 'ALREADY_APPLIED'` lights up the "Application submitted" branch on the detail page (JOBS-013).

### `BE-JOBS-3` — Structured `400 JOB_CLOSED`

Same file: `if (jobPost.status !== 'OPEN')` currently throws a plain `BadRequestException`. Replace with:

```ts
throw new BadRequestException({
  code: 'JOB_CLOSED',
  message: 'This job post is not open for applications',
});
```

### `BE-JOBS-4` (Defer)

`PAUSED` state on `JobPost.status` — out of MVP per JOBS-OQ-2. No schema change.

### `BE-JOBS-5` (Defer)

Worker-search endpoint behind employer "Invite" — out of MVP per JOBS-039. Existing id-paste invite remains.

---

## 2. Frontend routing additions

All routes register inside `MarketplaceRouter` (Auth contract §10 split). All lazy-loaded.

| Path | Component | Auth | Source endpoint |
|---|---|---|---|
| `/jobs` | `JobBoardPage` (rewritten) | public | `GET /job-posts?status=OPEN&...` |
| `/jobs/:id` | `JobDetailPage` (new) | public | `GET /job-posts/:id` |
| `/my-jobs` | `MyJobsPage` (new) | private + employer | `GET /job-posts/me` |
| `/my-jobs/:id/applicants` | `MyJobApplicantsPage` (new) | private + employer + ownership | `GET /job-posts/:id` + `GET /job-applications/jobs/:jobPostId` |
| `/my-jobs/:id/edit` | `EditJobPage` (new) | private + employer + ownership | `GET /job-posts/:id` |
| `/my-applications` | `MyApplicationsPage` (rewritten worker-only) | private + worker | `GET /job-applications/me` |

`/my-applications` route stays registered. Employer-side debug sections deleted per JOBS-047 once `/my-jobs` ships (Slice H).

Role-gating happens client-side as a UX courtesy: backend already enforces ownership / role on every mutation. Wrong-role users see a redirect to `/profile` (employers visiting `/my-applications` see an empty list per spec JOBS-041 / E2E-8).

---

## 3. New frontend modules

```
web/src/
  hooks/
    useSpecialisations.ts          # JOBS-022 — module-cached GET /specialisations
    useTags.ts                     # JOBS-022 — module-cached GET /tags
  pages/
    JobDetailPage.tsx              # JOBS-008..013
    MyJobsPage.tsx                 # JOBS-026..032
    MyJobApplicantsPage.tsx        # JOBS-033..040
    EditJobPage.tsx                # JOBS-018..020
    JobBoardPage.tsx               # JOBS-001..007 (rewritten — same path)
    MyApplicationsPage.tsx         # JOBS-041..047 (rewritten — same path)
  components/jobs/
    ChipMultiSelect.tsx            # JOBS-021 — shared primitive (composes shadcn Command)
    JobPostForm.tsx                # JOBS-014..017 — shared between Post and Edit (with `mode` prop)
    ApplyJobSheet.tsx              # JOBS-012 — cover + rate + submit
    ApplicantCard.tsx              # JOBS-036..038 — single applicant row with action buttons
    ApplicationStatusBadge.tsx     # status pill consumed by both worker and employer dashboards
    JobStatusBadge.tsx             # OPEN / CLOSED / FILLED / CANCELLED pill
    PayLine.tsx                    # extracts JobCard's payLine() helper for reuse
    InviteWorkerSheet.tsx          # JOBS-039 — id-paste invite (keeps current behaviour)
  components/ui/
    command.tsx                    # shadcn Command primitive (added if missing)
    popover.tsx                    # shadcn Popover primitive (added if missing — required by Command)
    tooltip.tsx                    # shadcn Tooltip primitive (added if missing — used for soft-freeze + delete-disabled)
```

Components live under `web/src/components/jobs/` (new namespace) to keep the diff scoped and merge-friendly with Auth's `web/src/components/` and Profiles' `web/src/components/profile/`.

---

## 4. Toaster mount

`<Toaster />` (re-exported from `web/src/components/ui/toast.tsx` → wraps `sonner`) is **not** currently mounted in production code (only in `web/src/test/render.tsx`). Mount it once at the top of `MarketplaceRouter` and `StaffRouter` in `App.tsx` so `toast(...)` calls anywhere in the SPA render. This is a global UI fix that lands inside Slice A.

---

## 5. Error mapping

All API calls go through Auth's `parseApiError(err)` → `ApiError`. Mapping table for Jobs error codes:

| Backend code / status | UI surface |
|---|---|
| `409 ALREADY_APPLIED` | CTA flips to "Application submitted · View status" with deep link to `/my-applications`; `toast.info("You've already applied to this job")` once |
| `400 JOB_CLOSED` | `toast.warning("This job is no longer accepting applications")` + page refetch (status badge flips) |
| `403 EMAIL_NOT_VERIFIED` | Render `<AuthBanner>` + disable Apply button (Auth-shipped pattern) |
| `403 ACCOUNT_DEACTIVATED` | Redirect `/login?reason=deactivated` |
| `403 Forbidden` (generic) | CTA never shown defensively; if surfaced: `toast.error("Only verified workers can apply")` |
| `401 INVALID_CREDENTIALS` (token expired mid-action) | `api.ts` already redirects to `/login?reason=expired&next=…` via the refresh-failed branch |
| `404 NOT_FOUND` on detail page | Render design-system 404 card with a back link to `/jobs` |
| `400 VALIDATION` (class-validator) | Field-level errors map to the failing input; `body.message` (joined string) shown above the form |
| Status-already-set on `PATCH /job-applications/:id/status` (returns `400`) | Toast "Already <STATUS>" then refetch — defensive only; UI hides the button after the optimistic flip |

Generic `ApiError.message` falls back to its `.message` for the toast.

---

## 6. Filters & URL state

`/jobs` filters bind to URL query params for shareability (JOBS-003):

| Param | Type | Notes |
|---|---|---|
| `q` | string | maps to backend `search` |
| `spec` | comma-separated `number[]` | maps to backend `specialisation_id` (single-id today; multi-id is JOBS-OQ — server already accepts only one, so MVP picks first if multiple selected and shows a small "Showing first selected" hint) |
| `area` | string (uppercased postcode area) | maps to backend `postcode_area` |
| `urgent` | `'1'` | maps to backend `is_urgent=true` |
| `page` | int (default 1) | maps to backend `page` |

URL is the source of truth — state synced via `useSearchParams`.

---

## 7. Form validation (frontend)

`react-hook-form + zod` (already used across Auth and Profiles). Schemas live next to their editor file. Length caps mirror Prisma (`backend/prisma/schema.prisma:671–748` and the Create DTO):

- `title`: 1–200 chars
- `description`: 0–10000 chars (treat as `text`; cap at 10000 client-side to prevent paste-bombs)
- `postcode_area`: regex `/^[A-Z]{1,2}\d{1,2}[A-Z]?$/` (UK outward code; reuses `POSTCODE_OUTWARD_REGEX` from `web/src/lib/london-boroughs.ts`)
- `site_address`: 0–300 chars
- `pay_type`: enum `'DAY_RATE' | 'FIXED_PRICE'`
- `day_rate_min` / `day_rate_max`: decimal, > 0; `max ≥ min` cross-field rule when both present
- `fixed_price`: decimal, > 0
- `duration_days`: integer, > 0
- `start_date`, `expires_at`: ISO date string; `expires_at` must be in the future on submit
- `is_urgent`: boolean
- `specialisation_ids`: `number[]`, length 0–10 (soft cap, JOBS-023)
- `tag_ids`: `number[]`, length 0–10
- `cover_message` (apply): 0–5000 chars (mirrors `apply-job.dto.ts`)
- `proposed_rate`: decimal, > 0

---

## 8. Soft-freeze policy (JOBS-019)

`/my-jobs/:id/edit` decides "applications received" via `_count.applications > 0` on the `GET /job-posts/:id` response (already returned).

When frozen, the following inputs are `disabled` with a `<Tooltip>` "Locked — applications received":

- `pay_type`
- `day_rate_min`
- `day_rate_max`
- `fixed_price`
- `postcode_area`
- `specialisation_ids`

Editable always: `title`, `description`, `site_address`, `duration_days`, `start_date`, `expires_at`, `is_urgent`, `tag_ids`.

Backend does **not** enforce the freeze — the spec is explicit (JOBS-019) that this is a frontend UX courtesy. Backend last-write-wins is acceptable in MVP.

---

## 9. Optimistic UI rules (JOBS-038)

`PATCH /job-applications/:id/status` and `POST /job-applications/:id/to-collaboration` flips the badge synchronously on click and disables every action button on the row. On error: revert badge, re-enable buttons, surface error via toast.

`useState`-driven; no library. Pattern:

```ts
const [pending, setPending] = useState<Set<string>>(new Set());
const [optimisticStatus, setOptimisticStatus] = useState<Record<string, string>>({});

async function transition(id: string, status: string, prev: string) {
  setPending((p) => new Set(p).add(id));
  setOptimisticStatus((s) => ({ ...s, [id]: status }));
  try {
    await api(`/job-applications/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await refetch();
  } catch (err) {
    setOptimisticStatus((s) => ({ ...s, [id]: prev }));
    toast.error(parseApiError(err)?.message ?? 'Action failed');
  } finally {
    setPending((p) => { const n = new Set(p); n.delete(id); return n; });
  }
}
```

---

## 10. Status-badge token mapping

Reuses Profiles' pattern (`PROF-030`):

| Status (job + application) | Variant |
|---|---|
| `OPEN`, `ACCEPTED` | `success` |
| `PENDING`, `REVIEWED`, `SHORTLISTED` | `warning` |
| `CLOSED`, `WITHDRAWN`, `REJECTED`, `CANCELLED` | `danger` |
| `FILLED` | `info` |
| anything unknown | `outline` |

Helpers `<JobStatusBadge>` / `<ApplicationStatusBadge>` centralise the mapping; never inline.

---

## 11. Acceptance pre-flight

Before marking a JOBS-* slice merge-ready:

1. `cd backend && npm run lint` (only when backend changes — Slice J).
2. `cd web && npm run lint:tokens` clean (no raw hex / default Tailwind classes).
3. `cd web && ./node_modules/.bin/vite build` clean (no TS errors).
4. Manual smoke of the slice's user flow at 375 px and desktop, light + dark mode.
5. Swagger `/api/docs` checked when backend endpoints change (Slice J only).
6. Grep guardrails (JOBS-048, JOBS-049): `grep -RIn "JSON.stringify" web/src/pages/Job* web/src/pages/My*` returns empty after Slice H; no comma-separated-id text inputs anywhere in the Jobs surface after Slice C.

---

## 12. Slice order (recommended, independently shippable)

1. **Slice A — kill JSON dumps + ship `/jobs/:id` real route + mount Toaster.** JOBS-001, JOBS-008, JOBS-048. Visible win, zero blockers. Detail page renders without Apply CTA in this slice (CTA lands in Slice D); link from `JobBoardPage` cards uses `react-router-dom` navigation instead of opening the dialog.
2. **Slice B — `<ChipMultiSelect>` + `useSpecialisations()` + `useTags()`.** JOBS-021, JOBS-022. Reusable primitive ahead of Slices C and E filters.
3. **Slice C — Post-a-job form rewrite.** JOBS-014, JOBS-015, JOBS-016, JOBS-017, JOBS-024. Removes comma-separated-id text inputs (JOBS-049). Uses `<JobPostForm mode="create">`.
4. **Slice D — role-aware Apply CTA on `/jobs/:id`.** JOBS-011, JOBS-012, JOBS-013. Depends on Slice A. Backend prereqs `BE-JOBS-2` / `BE-JOBS-3` should land in parallel; until they do, the SPA falls back to `body.message` substring matching.
5. **Slice E — `/my-jobs` employer dashboard.** JOBS-026..JOBS-032.
6. **Slice F — `/my-jobs/:id/applicants`.** JOBS-033..JOBS-040. Includes `<InviteWorkerSheet>` (id-paste only — JOBS-039 baseline).
7. **Slice G — redesigned `/my-applications` worker dashboard.** JOBS-041..JOBS-046. Status tabs, withdraw, invitations section, post snapshot rows.
8. **Slice H — delete legacy employer sections of `MyApplicationsPage`.** JOBS-047. Final cleanup; route stays worker-only.
9. **Slice I — `/my-jobs/:id/edit` with soft-freeze.** JOBS-018..JOBS-020. Reuses `<JobPostForm mode="edit">`.
10. **Slice J — backend prereqs.** `BE-JOBS-2` (`409 ALREADY_APPLIED`) and `BE-JOBS-3` (`400 JOB_CLOSED`). `BE-JOBS-1` already shipped via existing `_count` include — no work needed.

Each slice ships independently, exercises `lint:tokens` + `vite build` clean, and updates `spec.md` Decisions Log if any Open Question gets resolved during build.
