# TradeHub UKK

B2B platform for UK construction tradespeople.

## Ports

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8081/api |
| Swagger | http://localhost:8081/api/docs |
| Prisma Studio | http://localhost:5555 |
| PostgreSQL | localhost:5433 |

## First time setup

```bash
docker compose up -d
cd backend
cp .env.dev .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
cd ../web
npm install
```

## Daily run

```bash
docker compose up -d                     # if not already running

# terminal 1
cd backend && npm run start:dev

# terminal 2
cd web && npm run dev
```

## Useful commands

```bash
cd backend
npx prisma studio                        # browse DB in browser
npx prisma migrate reset                 # wipe DB + re-migrate + re-seed
npx prisma migrate dev --name <name>     # create new migration after schema change
```

## Reset database

```bash
cd backend
npx prisma migrate reset
```
Drops everything, re-runs all migrations, re-seeds test data.

## Deploy to prod

Works with Railway / Render / Fly.io / any VPS.

1. Set env vars from `backend/.env.prod` (fill all empty values)
2. Set `web/.env.production` with your domain

```bash
# Backend
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
node dist/main.js

# Frontend
cd web
npm ci
npm run build
# serve web/dist/ via nginx / Vercel / Netlify
```

## Credentials

| What | Dev file | Prod file |
|------|----------|-----------|
| Backend (DB, JWT, Stripe, etc.) | `backend/.env.dev` | `backend/.env.prod` |
| Frontend API URL | `web/.env` | `web/.env.production` |

Dev defaults work out of the box. For prod, fill `backend/.env.prod`:

| Key | Where to get |
|-----|-------------|
| DATABASE_URL | Neon / Supabase / Railway |
| JWT_SECRET | `openssl rand -hex 32` |
| JWT_REFRESH_SECRET | `openssl rand -hex 32` |
| GOOGLE_CLIENT_ID + SECRET | console.cloud.google.com |
| STRIPE_SECRET_KEY | dashboard.stripe.com |
| RESEND_API_KEY | resend.com |

## Test accounts

Password: `Password123!`

| Role | Email |
|------|-------|
| Admin | admin@tradehub.co.uk |
| Moderator | moderator@tradehub.co.uk |
| Worker | mike.builder@example.com |
| Employer | james@acmebuild.co.uk |

## Project structure

```
TradeHub/
├── backend/            NestJS REST API
│   ├── prisma/         Schema + migrations + seed
│   ├── src/            16 modules
│   ├── .env.dev        Dev defaults (safe, committed)
│   └── .env.prod       Prod secrets (NOT committed)
├── web/                React + Vite test UI
├── docker-compose.yml
└── schema.sql          DDL for Redgate
```
