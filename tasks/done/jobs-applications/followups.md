# Follow-ups — Jobs & Applications

Production drifts and missing-protections surfaced by the
`tests-jobs-applications/` suite (TEST-JOBS-230). All six were
**closed on 2026-05-05** in lockstep with the test feature, mirroring
the precedent set by `0698910` (FU-1..FU-7 for Auth) and `c2d4204`
(six items for Profiles).

Each entry below records the original finding and the fix landing.

---

## ✅ [JOBS-031] `DELETE /job-posts/:id` no longer cascades

**Closed 2026-05-05.**

**Original**: `JobPostService.delete()` did not block the call when
applications existed; Prisma's `onDelete: Cascade` wiped them. The
`JOBS-031` UX promise — "applicants would lose their record, close
it instead" — was enforced **frontend-only**. A direct API caller
could erase an applicant's record.

**Fix**: `JobPostService.delete()` now issues
`409 { code: 'HAS_APPLICATIONS', message: 'Close this job instead — applicants would lose their record.' }`
when `_count.applications > 0`. The unit-spec test that pinned the
old cascade behaviour was flipped to assert the new 409 path; an
e2e regression
(TEST-JOBS-070 → "owner DELETE on a post with applications → 409 HAS_APPLICATIONS")
now guards the boundary. The frontend toast already pipes the
structured message through `parseApiError()`.

---

## ✅ [JOBS-002] `findAll()` defaults to `status=OPEN`

**Closed 2026-05-05.**

**Original**: `JobPostService.findAll()` returned CLOSED / FILLED /
CANCELLED rows when no `status` query was supplied. The frontend
appended `?status=OPEN` defensively but a direct API consumer (or a
future page that forgot the param) leaked non-OPEN rows.

**Fix**: `findAll()` now treats `status === undefined` as
`status = 'OPEN'`. Callers that want every status (employer
dashboard via `findMyPosts()`, admin tooling, e2e fixtures) can opt
out explicitly with `?status=ALL`, which `buildWhere()` recognises
as the no-filter sentinel. `findMyPosts()` is unaffected because it
calls `buildWhere()` directly with the caller's query, so the
employer dashboard still sees every status. Three new unit specs
guard the new contract (default-OPEN, explicit override, ALL
opt-out).

---

## ✅ [JOBS-OQ-3] Same-status transition emits a structured `STATUS_UNCHANGED`

**Closed 2026-05-05.**

**Original**: `JobApplicationService.updateStatus()` threw a plain
`BadRequestException('Status is already X')` when the caller
re-asserted the current status. No structured code → the SPA could
not map this to a friendly toast.

**Fix**: `updateStatus()` now throws
`400 { code: 'STATUS_UNCHANGED', message: 'Application is already <status>.' }`.
TEST-JOBS-023's same-status spec was flipped from
`toBeInstanceOf(BadRequestException)` to a structured-body
assertion on `code === 'STATUS_UNCHANGED'`.

---

## ✅ [JOBS-005] `/jobs` paginates at 20 per page with prev/next URL-bound

**Closed 2026-05-05.**

**Original**: `JobBoardPage` hard-coded `limit=50` and shipped no
paginator. Spec called for 20 per page with prev/next controls and
URL-bound `?page=`.

**Fix**: `JobBoardPage` now reads `?page=` from `useSearchParams()`,
sends `limit=20`, and renders a prev/next paginator (with
`Page X of Y` indicator) whenever `total > PAGE_SIZE`. Filter
mutations reset to page 1; explicit page advances do not. Two new
frontend-unit tests guard the request shape and the Next-click flow
(TEST-JOBS-101).

---

## ✅ [JOBS-003] Public board has a chip-multiselect specialisation filter

**Closed 2026-05-05.**

**Original**: `JobBoardPage` exposed only `search` + `postcode_area`
inputs. Spec called for a specialisation chip-multiselect identical
to the post-create one.

**Fix**: `JobBoardPage` now mounts `<ChipMultiSelect>` sourced from
`useSpecialisations()`, single-select for the public-board filter,
URL-bound to `?specialisation_id=`. The selected chip pre-fills from
the URL on load (deep-link safe). A new frontend-unit test verifies
the URL-pre-fill round-trip (TEST-JOBS-101 →
"specialisation_id in URL pre-selects the chip filter").

The form-driven `Apply` button replaces the legacy auto-fetch on
keystroke, matching the search-bar UX precedent on
`/workers` / `/employers` (Profiles).

---

## ✅ [JOBS-021] `<ChipMultiSelect>` lives at `components/ui/`

**Closed 2026-05-05.**

**Original**: spec called for
`web/src/components/ui/chip-multi-select.tsx`; the parent feature
shipped `web/src/components/jobs/ChipMultiSelect.tsx`.

**Fix**: file moved to `web/src/components/ui/chip-multi-select.tsx`
(via `git mv` to preserve history). Imports retargeted in
`JobPostForm.tsx`, `JobBoardPage.tsx`, and the colocated test. The
component is now reachable from any consumer (Profiles' future
specialisation editor, search pages) without crossing a `jobs/`
boundary.

---

## Summary

All six `tests-jobs-applications/` follow-ups are closed. The test
suite now asserts the spec-correct behaviour for each — re-introducing
any of these regressions will go red on the relevant
`TEST-JOBS-NNN` test.

Production code touched by the fixes:

- `backend/src/job-post/job-post.service.ts` (delete-with-applications gate, default-OPEN filter)
- `backend/src/job-application/job-application.service.ts` (structured STATUS_UNCHANGED)
- `web/src/pages/JobBoardPage.tsx` (paginator + chip filter + URL-bound state)
- `web/src/components/ui/chip-multi-select.tsx` (moved from `components/jobs/`)
- `web/src/components/jobs/JobPostForm.tsx` (import retargeted)
