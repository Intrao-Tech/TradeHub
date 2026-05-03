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

## Working principles

**Specs are living documents.** When a decision is made on an active feature (Open Question answered, scope changed, requirement clarified), update the relevant `spec.md` in the same step — move the resolved item out of `Open Questions` into a numbered requirement, and append the decision + date to a `Decisions Log` section at the bottom. The repo state must always match the spec; out-of-date specs are bugs.
