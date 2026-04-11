# TradeHub UK

B2B platform for UK construction tradespeople. Matching workers with employers, verified reviews, referral exchange, escrow payments.

## Ports

| Service    | Port |
|------------|------|
| Frontend   | 3000 |
| Backend    | 8081 |
| PostgreSQL | 5433 (Docker) |
| Swagger    | http://localhost:8081/api/docs |

## Quick start (dev)

```bash
# 1. Start database
docker compose up -d

# 2. Backend
cd backend
cp .env.dev .env          # already has working dev defaults
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
npm run start:dev         # http://localhost:8081/api

# 3. Frontend (separate terminal)
cd web
npm install
npm run dev               # http://localhost:3000
```

## Credentials

### Where to put them

| What | File | Notes |
|------|------|-------|
| DB, JWT, API keys | `backend/.env` | Copied from `.env.dev` (local) or `.env.prod` (deploy) |
| Frontend API URL | `web/.env` | `VITE_API_URL` |

### Dev (local) -- already filled in `.env.dev`

| Key | Value |
|-----|-------|
| DB | `postgresql://tradehub:tradehub_dev@localhost:5433/tradehub` |
| JWT_SECRET | `tradehub-dev-jwt-secret-change-in-prod` |
| JWT_REFRESH_SECRET | `tradehub-dev-refresh-secret-change-in-prod` |
| GOOGLE_CLIENT_ID | empty (Google OAuth disabled until set) |
| STRIPE_SECRET_KEY | empty (escrow stubbed until set) |
| RESEND_API_KEY | empty (email disabled until set) |

### Prod -- fill in `.env.prod` before deploy

| Key | Where to get |
|-----|-------------|
| DATABASE_URL | Your hosted PostgreSQL (Neon / Supabase / Railway) |
| JWT_SECRET | `openssl rand -hex 32` |
| JWT_REFRESH_SECRET | `openssl rand -hex 32` |
| GOOGLE_CLIENT_ID + SECRET | https://console.cloud.google.com/apis/credentials |
| STRIPE_SECRET_KEY | https://dashboard.stripe.com/apikeys |
| STRIPE_WEBHOOK_SECRET | Stripe webhook settings |
| RESEND_API_KEY | https://resend.com/api-keys |

## Test accounts (after seed)

Password for all: `Password123!`

| Role | Email |
|------|-------|
| Admin | admin@tradehub.co.uk |
| Moderator | moderator@tradehub.co.uk |
| Worker | mike.builder@example.com |
| Worker | sarah.sparks@example.com |
| Worker | dave.pipes@example.com |
| Employer | james@acmebuild.co.uk |
| Employer | lisa@homeworks.co.uk |

## Scripts

```bash
# Dev
./scripts/dev.ps1         # Start everything locally (Docker + backend + frontend)

# Prod build
./scripts/build-prod.ps1  # Build backend + frontend for deployment
```

## Project structure

```
TradeHub/
├── backend/          NestJS REST API
│   ├── prisma/       Schema + migrations + seed
│   ├── src/          16 modules (auth, profiles, portfolio, etc.)
│   ├── .env.dev      Dev credentials (committed, safe)
│   ├── .env.prod     Prod credentials (NOT committed, fill manually)
│   └── .env          Active config (copy from .dev or .prod)
├── web/              React + Vite (test UI, will be restyled)
│   ├── src/pages/    11 pages covering all API endpoints
│   └── .env          VITE_API_URL
├── docker-compose.yml
└── schema.sql        SQL DDL for Redgate visualization
```
