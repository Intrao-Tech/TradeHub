# Coverage matrix — `CR-NNN ↔ TEST-CR-NNN`

Status legend: ⬜ pending · 🟡 in-progress · ✅ green

## Schema (CR-001..014)

| Spec ID | Test ID | Layer | Status |
| ------- | ------- | ----- | ------ |
| CR-001 | TEST-CR-002, TEST-CR-003 | E2E-B | ⬜ |
| CR-002 | (covered by service tests) | U | ⬜ |
| CR-003 | TEST-CR-002 | E2E-B | ⬜ |
| CR-004 | (seed-driven) | n/a | ⬜ |
| CR-005 | (drop migration) | n/a | ✅ (migration applied) |
| CR-006 | TEST-CR-005 | E2E-B | ⬜ |
| CR-007 | TEST-CR-052 | E2E-B | ⬜ |
| CR-008 | TEST-CR-004 | E2E-B | ⬜ |
| CR-009 | TEST-CR-001 | E2E-B | ⬜ |
| CR-010 | TEST-CR-064 | E2E-B | ⬜ |
| CR-011 | TEST-CR-066 | E2E-B | ⬜ |
| CR-012 | (covered by U cap math) | U | ⬜ |
| CR-013 | TEST-CR-006 | E2E-B | ⬜ |
| CR-014 | (migration applied) | n/a | ✅ |

## Contract domain (CR-020..025)

| Spec ID | Test ID | Layer | Status |
| ------- | ------- | ----- | ------ |
| CR-020 | TEST-CR-030..034, TEST-CR-038 | E2E-B | ⬜ |
| CR-021 | TEST-CR-035..037 | E2E-B | ⬜ |
| CR-022 | (escrow refactor verified by build) | n/a | ✅ |
| CR-023 | (collab.service slim verified by build) | n/a | ✅ |
| CR-024 | TEST-CR-031, TEST-CR-050..051 | E2E-B | ⬜ |
| CR-025 | TEST-CR-040 | E2E-B | ⬜ |

## Referral domain (CR-030..044)

| Spec ID | Test ID | Layer | Status |
| ------- | ------- | ----- | ------ |
| CR-030 | (module wired — verified by build) | n/a | ✅ |
| CR-031 | (cookie middleware deferred to auth-on-signup) | n/a | ⬜ |
| CR-032 | TEST-CR-060..061 | E2E-B | ⬜ |
| CR-033..035 | TEST-CR-062..063 | E2E-B | ⬜ |
| CR-036 | TEST-CR-064..066 | E2E-B | ⬜ |
| CR-037 | (covered indirectly by TEST-CR-074) | E2E-B | ⬜ |
| CR-038 | (covered indirectly by TEST-CR-074) | E2E-B | ⬜ |
| CR-039 | TEST-CR-065, TEST-CR-120..123 | E2E-B | ⬜ |
| CR-040 | TEST-CR-100..103 | F | ⬜ |
| CR-041 | TEST-CR-010..020, TEST-CR-070..076 | U + E2E-B | ⬜ |
| CR-042 | TEST-CR-070..076 | E2E-B | ⬜ |
| CR-043 | TEST-CR-077 | E2E-B | ⬜ |
| CR-044 | (covered by TEST-CR-001) | E2E-B | ⬜ |

## Notifications (CR-050..054)

| Spec ID | Test ID | Layer | Status |
| ------- | ------- | ----- | ------ |
| CR-050 | (deferred — mail service mock) | E2E-B | ⬜ |
| CR-051 | (deferred — mail service mock) | E2E-B | ⬜ |
| CR-052 | (deferred — mail service mock) | E2E-B | ⬜ |
| CR-053 | TEST-CR-039 | E2E-B | ⬜ |
| CR-054 | (smoke-only) | n/a | ⬜ |

## Frontend (CR-070..085)

| Spec ID | Test ID | Layer | Status |
| ------- | ------- | ----- | ------ |
| CR-070..075 | (Playwright deferred → tests-cr-playwright) | PW | ⬜ |
| CR-080 | TEST-CR-100..103 | F | ⬜ |
| CR-081..082 | (PW deferred) | PW | ⬜ |
| CR-083 | TEST-CR-110..112 | F | ⬜ |
| CR-084 | (PW deferred) | PW | ⬜ |
| CR-085 | (PW deferred) | PW | ⬜ |

## Admin (CR-090..092)

| Spec ID | Test ID | Layer | Status |
| ------- | ------- | ----- | ------ |
| CR-090 | (PW deferred) | PW | ⬜ |
| CR-091 | (out of scope — admin tooling) | n/a | ⬜ |
| CR-092 | (Should — out of scope) | n/a | ⬜ |

## Anti-fraud (CR-100..110)

| Spec ID | Test ID | Layer | Status |
| ------- | ------- | ----- | ------ |
| CR-100 | TEST-CR-065, TEST-CR-120 | E2E-B | ⬜ |
| CR-101 | TEST-CR-121 | E2E-B | ⬜ |
| CR-102 | (covered by TEST-CR-122) | E2E-B | ⬜ |
| CR-103 | TEST-CR-122 | E2E-B | ⬜ |
| CR-104 | TEST-CR-123 | E2E-B | ⬜ |
| CR-105 | (cookie last-click — covered by TEST-CR-066) | E2E-B | ⬜ |
| CR-106 | (cookie TTL — out of scope, browser-side) | n/a | ⬜ |
| CR-107 | TEST-CR-019..020 | U | ⬜ |
| CR-108 | (covered by TEST-CR-074) | E2E-B | ⬜ |
| CR-109..110 | (Should — out of scope MVP) | n/a | ⬜ |

## Migration / Cleanup (CR-120..124)

| Spec ID | Test ID | Layer | Status |
| ------- | ------- | ----- | ------ |
| CR-120..124 | (verified by build + migration applied) | n/a | ✅ |

## Audit / observability (CR-130..131)

| Spec ID | Test ID | Layer | Status |
| ------- | ------- | ----- | ------ |
| CR-130 | TEST-CR-040, TEST-CR-077 | E2E-B | ⬜ |
| CR-131 | (Should — log structure smoke) | n/a | ⬜ |

---

**Totals (Must coverage):**

- ✅ green: 5 / 73 — schema migration + module wiring (no test runtime needed)
- ⬜ pending: 68 / 73

**Files to create when implementing:**

- `backend/src/referral/referral.service.spec.ts` — TEST-CR-010..020, TEST-CR-080..083
- `backend/src/contract/contract.service.spec.ts` — selected unit cases
- `backend/test/cr.contract.e2e-spec.ts` — TEST-CR-030..052
- `backend/test/cr.referral.e2e-spec.ts` — TEST-CR-060..066, TEST-CR-120..123
- `backend/test/cr.commission-cap.e2e-spec.ts` — TEST-CR-070..077, TEST-CR-080..085
- `backend/test/cr.schema.e2e-spec.ts` — TEST-CR-001..006
- `web/src/pages/ReferralsPage.test.tsx` — TEST-CR-100..103
- `web/src/components/referral/useRefAttribution.test.ts` — TEST-CR-110..112
