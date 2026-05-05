# Notes

Working research and codebase snapshot for `tasks/product/jobs-applications/`. Cited inline; nothing here is normative — `spec.md` is the implementation-ready contract.

## A. Codebase snapshot (2026-05-05)

### Backend — Job posts (`backend/src/job-post/`)

Controller (`backend/src/job-post/job-post.controller.ts:30–109`):

| Route | Method | Auth | Notes |
|---|---|---|---|
| `POST /job-posts` | create | `JwtAuthGuard + RolesGuard('EMPLOYER') + AccountStateGuard + @RequiresVerifiedEmail()` | (`:35`) Throws `BadRequestException` if not employer or no profile |
| `GET /job-posts/me` | findMine | `JwtAuthGuard + RolesGuard('EMPLOYER')` | (`:54`) |
| `GET /job-posts` | findAll | public | (`:69`) |
| `GET /job-posts/:id` | findOne | public | (`:75`) |
| `PATCH /job-posts/:id` | update | `JwtAuthGuard` + service-level ownership check | (`:81`) Service confirms `employer_id === user.clientProfileId` |
| `DELETE /job-posts/:id` | remove | `JwtAuthGuard` + service-level ownership check | (`:96`) |

DTOs:
- `CreateJobPostDto` (`backend/src/job-post/dto/create-job-post.dto.ts:11–79`): `title` (req), `description?`, `postcode_area?`, `site_address?`, `pay_type ∈ DAY_RATE | FIXED_PRICE`, `day_rate_min?`, `day_rate_max?`, `fixed_price?`, `duration_days?`, `start_date?`, `expires_at?`, `is_urgent`, `specialisation_ids?: number[]`, `tag_ids?: number[]`.
- `JobPostQueryDto` (`backend/src/job-post/dto/job-post-query.dto.ts:5–53`): `page` (default 1), `limit` (default 20, max 100); filters `status?`, `postcode_area?`, `specialisation_id?`, `tag_id?`, `search?`, `is_urgent?`.

### Backend — Applications (`backend/src/job-application/`)

Controller (`backend/src/job-application/job-application.controller.ts:30–151`):

| Route | Method | Auth |
|---|---|---|
| `POST /job-applications/jobs/:jobPostId/apply` | apply | `JwtAuthGuard + RolesGuard('WORKER') + AccountStateGuard + @RequiresVerifiedEmail()` (`:35`) |
| `POST /job-applications/jobs/:jobPostId/invite` | invite | `JwtAuthGuard + RolesGuard('EMPLOYER') + AccountStateGuard + @RequiresVerifiedEmail()` (`:56`) — also creates a conversation in service (`:94`) |
| `GET /job-applications/jobs/:jobPostId` | listForPost | `JwtAuthGuard` + service-level ownership check (`:78`) |
| `GET /job-applications/me` | listMine | `JwtAuthGuard` (worker) (`:98`) |
| `PATCH /job-applications/:id/status` | updateStatus | `JwtAuthGuard` + status-specific authorisation (`:115`) |
| `POST /job-applications/:id/to-collaboration` | convert | `JwtAuthGuard` (employer, `status === ACCEPTED` only) (`:134`) |

Status-specific authorisation rules in `JobApplicationService.updateStatus()` (`:208–224`):
- `WITHDRAWN` — worker only, owns the application
- `REVIEWED | SHORTLISTED | ACCEPTED | REJECTED` — employer only, owns the post

DTOs:
- `ApplyJobDto` (`backend/src/job-application/dto/apply-job.dto.ts:5–17`): `cover_message?` (max 5000 chars), `proposed_rate?`.
- `UpdateApplicationStatusDto` (`backend/src/job-application/dto/update-application-status.dto.ts:4–17`): `status ∈ REVIEWED | SHORTLISTED | ACCEPTED | REJECTED | WITHDRAWN`.
- `ApplicationQueryDto`: `page`, `limit`, `status?`, `initiated_by ∈ WORKER | EMPLOYER`.

### Backend — Schema (`backend/prisma/schema.prisma:671–748`)

```
model JobPost {
  id              BigInt
  employer_id     BigInt   (FK → EmployerProfile)
  title           VarChar(200)
  description     Text?
  postcode_area   VarChar(10)?
  site_address    VarChar(300)?
  pay_type        VarChar(15)         // DAY_RATE | FIXED_PRICE
  day_rate_min    Decimal(8,2)?
  day_rate_max    Decimal(8,2)?
  fixed_price     Decimal(12,2)?
  duration_days   Int?
  start_date      Timestamptz?
  status          VarChar(20) default=OPEN  // OPEN | CLOSED | FILLED | CANCELLED
  is_urgent       Boolean default=false
  expires_at      Timestamptz?
  created_at      Timestamptz
  updated_at      Timestamptz

  specialisations  JobPostSpecialisation[]
  tags             JobPostTag[]
  applications     JobApplication[]
  collaborations   Collaboration[]
}

model JobApplication {
  id              BigInt
  job_post_id     BigInt   (FK)
  worker_id       BigInt   (FK → WorkerProfile)
  initiated_by    VarChar(10)         // WORKER | EMPLOYER
  status          VarChar(20) default=PENDING
  cover_message   Text?
  proposed_rate   Decimal(8,2)?
  responded_at    Timestamptz?
  created_at, updated_at

  @@unique([job_post_id, worker_id])
}

model JobPostSpecialisation { job_post_id, specialisation_id }
model JobPostTag            { job_post_id, tag_id }
model Specialisation        { id, name, slug }
model Tag                   { id, name, slug }
```

### Backend — Specialisations & Tags (public lists)

- `GET /specialisations` (`backend/src/specialisation/specialisation.controller.ts:31`) — public.
- `GET /tags` (`backend/src/tag/tag.controller.ts:24`) — public.
- Both have admin-only POST / PATCH / DELETE for the catalog. **Tag admin UI is out of scope for this feature** (JOBS-025).

### Frontend — Today's surface

- `web/src/pages/JobBoardPage.tsx` — public board + create-post sheet + per-job dialog.
  - Specialisation IDs comma-separated text input: `:310–316`.
  - Tag IDs comma-separated text input: `:319–325`.
  - JSON dump (last action response): `:339–345`, `:519`.
  - JSON dump (job detail dialog): `:478–479`.
  - Apply button visible to every signed-in role: `:495–496`.
- `web/src/pages/MyApplicationsPage.tsx` — three sections, three JSON dumps.
  - Worker applications JSON: `:243–245`.
  - Employer posts JSON: `:307–309`.
  - Applications-by-post JSON: `:409–411`.
  - Invite worker form (text id paste): `:416–445`.
- `web/src/App.tsx` — `/jobs` registered (`:198`), `/my-applications` registered (`:213`).
- `web/src/api.ts` — `api<T>()` helper (`:78`), `ApiError` class (`:32`), `parseApiError()` (`:45`).
- `web/src/components/ui/select.tsx` — single-select Radix wrapper. **No multi-select primitive**; this feature ships `<ChipMultiSelect>` (JOBS-021).
- Status-badge variant helper exists in `MyApplicationsPage.tsx:42–48`; pattern is reusable but tied to the JSON-dump layout.

### Backend e2e tests (none for jobs)

`backend/test/` has no `job-post.e2e-spec.ts` or `job-application.e2e-spec.ts`. The sibling `tests-jobs-applications/` feature folder will open these with the same Testcontainer pattern as the auth e2e suite (`tasks/done/auth-flow/`).

## B. UX research — surf MCP findings (2026-05-05)

Research goal: validate the chosen patterns against UK-construction trade marketplaces (the closest product analogues) and B2B freelancer marketplaces (the closest workflow analogues), and check the multi-select UX consensus.

### B.1 Consensus patterns adopted

| Pattern | Adopted as | Source |
|---|---|---|
| Job-post structure: title, category, description, postcode + radius, budget (fixed or hourly), start date, required certs, attachments | JOBS-009, JOBS-010 (UK-construction nuance: postcode + radius + cert filter; not skill keywords) | MyBuilder, SubbieUK, Subcontractee, Upwork |
| Free express-interest then pay-on-shortlist (MyBuilder) over connects/credits-to-apply (Upwork) | Non-goal: no pay-to-apply in MVP | [r/Upwork connects rant](https://www.reddit.com/r/Upwork/comments/1jykrxx) |
| Application lifecycle `SUBMITTED → SHORTLISTED → INTERVIEWING → OFFERED → ACCEPTED \| DECLINED \| WITHDRAWN \| EXPIRED`; tabbed dashboards (Upwork) | JOBS-035 / JOBS-042 (status tabs with counts) | [Upwork: review job proposals](https://support.upwork.com/hc/en-us/articles/18010402882195) |
| Worker self-updates application status (Indeed) | JOBS-044 (worker withdraw) | [Indeed: managing applied jobs](https://support.indeed.com/hc/en-us/articles/4412589551757) |
| Multi-select 10–30 categories: chip-based combobox with type-to-filter | JOBS-021 (`<ChipMultiSelect>`) | [Smashing 2026 — Combobox vs. Multiselect](https://smashingmagazine.com/2026/02/combobox-vs-multiselect-vs-listbox), [NN/g — Listboxes vs. Dropdowns](https://nngroup.com/articles/listbox-dropdown), [uxpatterns.dev — Multi-select](https://uxpatterns.dev/patterns/forms/multi-select-input) |
| Soft-freeze: edit cosmetic fields anytime; lock budget / category / location after first application; never hard-delete | JOBS-019 (soft-freeze), JOBS-031 (delete only at zero applications) | [LinkedIn: edit job post](https://linkedin.com/help/lms/answer/a517567), [LinkedIn: close not delete](https://linkedin.com/help/linkedin/answer/a518551), [Indeed: pause/close/reopen](https://indeed.com/hire/resources/howtohub/how-to-close-or-pause-jobs-on-indeed) |
| Progressive verification with risk-based step-up; gate apply on Basic, gate post on Certified, never gate browse | JOBS-OQ-4 (deferred until Verification seals); apply/post gated only on `verification_state === 'ACTIVE'` for MVP | [Veriff — marketplace user journey](https://veriff.com/onboarding/marketplace-user-journey), [Veld — marketplace trust & safety](https://veldsystems.com/blog/marketplace-trust-safety-buyers-sellers), [Botble KYC gates](https://docs.botble.com/kyc/integration/gates.html) |
| Dashboards with status tabs + count badges; CTA-led empty states; default sort newest first; no "save searches" in v1 | JOBS-028, JOBS-035, JOBS-042; JOBS-007 (sort default) | Upwork, Indeed, LinkedIn |

### B.2 Pitfalls to avoid (mirrored as non-goals)

| Pitfall | Mitigation |
|---|---|
| Inventing statuses outside the Upwork/Indeed lexicon | Use existing `JobApplication.status` values verbatim |
| Allowing unconditional re-apply after withdraw | JOBS-OQ-3 / Edge Cases — withdraw is permanent |
| Showing raw lists of 50+ applicants without grouping | JOBS-035 status tabs |
| Gating browse on KYC | JOBS-002 / JOBS-008 — public board, public detail |
| Multi-select dropdown without search for 30+ tags | JOBS-021 — typing filters |
| Allowing budget edit after applications arrive | JOBS-019 soft-freeze |
| Hiding closed jobs entirely (workers want history) | JOBS-007 closed-post visibility — hide from default browse, keep on history surfaces |
| "Best match" algorithmic ranking | JOBS-OQ-10 — sort by `created_at desc` only |

### B.3 UK-construction-specific notes

- **Postcode + radius is the primary filter**, not city. SubbieUK / Subcontractee / MyBuilder all key off postcode and a configurable working radius. **MVP uses postcode-area only** (London-borough preset reused from Profiles `PROF-015`); radius is a Phase 2 worker-search feature.
- **Certification / ticket filters > tag filters.** Gas Safe, NICEIC, CSCS, Part P. These map to TradeHub's verification tiers and to portfolio certification items (Profiles `PROF-021`). MVP does not surface a cert filter on the job board; the verification badge on cards is the proxy. Phase 2 candidate.
- **Day rate vs price-per-job vs price-on-application**, not Upwork's fixed/hourly toggle. Schema already has `pay_type ∈ DAY_RATE | FIXED_PRICE`; "Price on application" is a Phase 2 third option (would require a schema enum extension).
- **Two-way reviews are the differentiator.** JOBS-012 apply-sheet copy should mention this once Reviews ships ("When this job completes, you and the employer will both leave reviews"). Currently held — Reviews feature is not yet drafted.
- **Lead-buying fatigue is real.** UK trade Reddit threads consistently complain about Checkatrade / Bark / Rated People paid-shared-leads. TradeHub's free-apply MVP is a marketable differentiator; reinforced as a non-goal so monetisation discussions don't drift into pay-to-apply.

### B.4 Cited sources

1. MyBuilder how-it-works — https://mybuilder.com/how-it-works
2. Checkatrade vs Bark vs MyBuilder vs Rated People — https://localsearchnorth.uk/blog/checkatrade-vs-bark-vs-mybuilder
3. SubbieUK how-it-works — https://subbieuk.co.uk/hire-local-subcontractors-tradesmen
4. Subcontractee UK FAQ — https://subcontractee.co.uk/faqs
5. Upwork: review job proposals (statuses + tabs) — https://support.upwork.com/hc/en-us/articles/18010402882195
6. Upwork: send an offer from a job post (offer lifecycle, 7-day expiry) — https://support.upwork.com/hc/en-us/articles/211063618
7. Indeed: managing applied jobs (worker-side statuses) — https://support.indeed.com/hc/en-us/articles/4412589551757
8. Indeed Hire: pause / close / reopen — https://indeed.com/hire/resources/howtohub/how-to-close-or-pause-jobs-on-indeed
9. LinkedIn: edit job post (frozen fields) — https://linkedin.com/help/lms/answer/a517567
10. LinkedIn: close a job post (no delete) — https://linkedin.com/help/linkedin/answer/a518551
11. Smashing Magazine 2026 — Combobox vs. Multiselect vs. Listbox — https://smashingmagazine.com/2026/02/combobox-vs-multiselect-vs-listbox
12. NN/g — Listboxes vs. Dropdown Lists — https://nngroup.com/articles/listbox-dropdown
13. uxpatterns.dev — Multi-select Input Pattern — https://uxpatterns.dev/patterns/forms/multi-select-input
14. Veriff — Securing the Marketplace User Journey — https://veriff.com/onboarding/marketplace-user-journey
15. Botble KYC plugin — gating job posting on employer KYC — https://docs.botble.com/kyc/integration/gates.html
16. PeoplePerHour Manual — proposal flow + 15 free proposals/month — https://peopleperhour.com/static/manual
17. Reddit r/Upwork — boosted-proposal withdrawal complaint — https://www.reddit.com/r/Upwork/comments/1jykrxx
18. GitHub: francislagares/jobber-app — MERN freelance marketplace clone — https://github.com/francislagares/jobber-app
19. GitHub: Akshatjalan/DevFreelance — React job-post + apply clone — https://github.com/Akshatjalan/DevFreelance
20. GitHub: suletetes/TalentHive — TS MERN freelancing platform — https://github.com/suletetes/TalentHive

## C. Open implementation questions to log against `spec.md` Open Questions

These mirror `spec.md` Open Questions; logged here so the implementing AI can update both in one pass when answers land.

- JOBS-OQ-1 (edit-after-applications policy) — recommend soft-freeze.
- JOBS-OQ-2 (PAUSED state) — recommend defer.
- JOBS-OQ-3 (re-apply after withdraw) — recommend permanent withdraw.
- JOBS-OQ-4 (trust-tier gating) — recommend defer until Verification seals.
- JOBS-OQ-5 (cover message required vs optional) — recommend optional with soft-warn.
- JOBS-OQ-6 (URL slug vs id) — recommend numeric id for MVP.
- JOBS-OQ-7 (closed-post visibility) — recommend default `status=OPEN` filter on `/jobs`; closed posts reachable by deep link.
- JOBS-OQ-8 (multi-accepted applications) — recommend warn + allow.
- JOBS-OQ-9 (invitations as separate worker section) — recommend yes (JOBS-046).
- JOBS-OQ-10 (best-match ranking) — recommend defer; sort `created_at desc` only.
