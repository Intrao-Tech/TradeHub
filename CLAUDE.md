# TradeHub UK

B2B platform for UK construction tradespeople — Upwork-style. Two-way verified reviews, Stripe Connect escrow, commission-based referrals, KYC → reviews → HMRC verification progression.

## Stack

NestJS + Prisma 7 + PostgreSQL 16 (backend), React 19 + Vite 8 + Tailwind v4 + shadcn/ui (web). JWT + bcrypt + Google OAuth. Socket.IO + Redis adapter. Stripe Connect. Resend. Docker Compose.

## Ports

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:8081/api |
| Swagger | http://localhost:8081/api/docs |
| WS | ws://localhost:8081/chat |
| Postgres | localhost:5433 · Redis localhost:6379 · Prisma Studio :5555 |

## Seed data

Password for every account: `Password123!`

- `admin@tradehub.co.uk`, `moderator@tradehub.co.uk`
- Workers: mike.builder / sarah.sparks / dave.pipes / tom.wood / emma.tiles `@example.com`
- Employers: james@acmebuild.co.uk, lisa@homeworks.co.uk, rob@quickfix.co.uk

## Env

All defaults in `backend/.env.dev` (committed; works out of box). Empty by default: Google OAuth, Stripe, Resend. Redis URL = `redis://localhost:6379` (empty = in-memory WS).

## Run

```bash
docker compose up -d
cd backend && cp .env.dev .env && npm i && npx prisma generate && npx prisma migrate dev --name init && npm run db:seed && npm run start:dev
cd web && npm i && npm run dev
```

Reset DB: `cd backend && npx prisma migrate reset`. Deploy: Railway / Render / Fly.io / any VPS (Prisma migrate deploy + Vite build + serve `web/dist`).

## Frontend

Design-system rules live in `web/CLAUDE.md`. Semantic tokens only, shadcn primitives, light + dark, mobile-first, enforced by `web/scripts/lint-tokens.mjs`. 14 pages wrapped in `AppShell` (or `AuthShell` for auth).

## Tests

Tests are not optional. Every shipped feature must have a `tests-<feature>` counterpart in `tasks/done/`.

| Command | Scope |
|---|---|
| `cd backend && npm test` | Backend unit specs (colocated `*.spec.ts` under `src/`, deep-mocked Prisma — fast, no Docker) |
| `cd backend && npm run test:e2e` | Backend e2e specs (`*.e2e-spec.ts` under `backend/test/`, real Postgres in a Testcontainer — requires Docker) |
| `cd web && npm test` | Frontend unit specs (Vitest + RTL + MSW v2, no real network) |
| `cd web && npm run test:e2e` | Playwright against a live backend on a Testcontainer Postgres (requires Docker + `npx playwright install chromium`) |

Backend e2e: per-suite container, truncate-between-tests cleanup (see `backend/test/README.md`). The opt-in rate-limit spec is `describe.skip` until FU-6 lands. See `tasks/done/auth-flow/` for the AUTH-NNN contract that the auth tests guard, and `tasks/done/tests-auth-flow/followups.md` for known production bugs surfaced by tests but deliberately not fixed in the test feature.

## Working principles

**Specs are living documents.** When a decision is made on an active feature (Open Question answered, scope changed, requirement clarified), update the relevant `spec.md` in the same step — move the resolved item out of `Open Questions` into a numbered requirement, and append the decision + date to a `Decisions Log` section at the bottom. The repo state must always match the spec; out-of-date specs are bugs.

**Every shipped feature has tests.** When a feature folder moves to `tasks/done/`, a `tests-<feature>/` folder must exist (or be opened that same week) under `tasks/done/` or `tasks/in-progress/` covering its acceptance criteria. Shipping production behaviour without a regression-guarding test counterpart is a bug — see `tasks/GUIDE.md`.
