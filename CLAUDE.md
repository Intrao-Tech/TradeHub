# TradeHub UK — Full Project Context

## What is this

B2B platform for UK construction tradespeople. Matches employers (who offer work) with workers (tradespeople/contractors). Think Upwork for UK construction industry.

Core value propositions:
- Verified two-way reviews
- Commission-based job referral exchange
- Searchable labor database
- Platform-mediated payments via Stripe Connect (escrow, platform as guarantor)
- Worker experience/credential verification system (KYC → reviews → HMRC confirmation progression)

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | NestJS + TypeScript | Latest |
| ORM | Prisma | 7.7.0 (uses `prisma.config.ts` + `@prisma/adapter-pg`) |
| Database | PostgreSQL | 16 (via Docker) |
| Frontend | React + Vite + TypeScript | Latest |
| Routing | react-router-dom | v7 |
| Auth | JWT (access + refresh) + bcrypt + Google OAuth (Passport) |
| Payments | Stripe Connect (escrow on collaborations) |
| Email | Resend / SendGrid |
| File uploads | Multer (local `./uploads`, S3-compatible for prod) |
| Real-time | Socket.IO + `@socket.io/redis-adapter` |
| Docs | Swagger at `/api/docs` |
| Validation | `class-validator` + `class-transformer` |
| Infra | Docker Compose (Postgres + Redis) |

## Ports

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8081/api |
| Swagger | http://localhost:8081/api/docs |
| WebSocket Chat | ws://localhost:8081/chat |
| Prisma Studio | http://localhost:5555 |
| PostgreSQL | localhost:5433 |
| Redis | localhost:6379 |

## Project Structure

```
TradeHub/
├── backend/                NestJS REST API + WebSocket
│   ├── prisma/
│   │   ├── schema.prisma   35 models, Prisma 7 format
│   │   ├── migrations/     Auto-generated
│   │   ├── seed.ts         Test data (all accounts, profiles, jobs, messages, etc.)
│   │   └── prisma.config.ts  Prisma 7 datasource config
│   ├── src/
│   │   ├── main.ts         Bootstrap + Redis WS adapter
│   │   ├── app.module.ts   Root module (20+ feature modules)
│   │   ├── prisma/         PrismaService (uses @prisma/adapter-pg)
│   │   ├── common/         Guards, interceptors, filters, decorators
│   │   │   ├── guards/     JwtAuthGuard, RolesGuard
│   │   │   ├── interceptors/  BigIntSerializationInterceptor
│   │   │   ├── filters/    GlobalExceptionFilter
│   │   │   └── decorators/  @Roles(), @CurrentUser()
│   │   ├── auth/           Register, login, refresh, logout, Google OAuth
│   │   ├── account/        Account CRUD
│   │   ├── client-profile/ Client profile (base for worker/employer)
│   │   ├── worker-profile/ Worker search, update
│   │   ├── employer-profile/ Employer search, update
│   │   ├── specialisation/ Reference data (trades)
│   │   ├── tag/            Reference data (keywords)
│   │   ├── document/       File upload + verification status
│   │   ├── portfolio/      Experience, project, certification items
│   │   ├── collaboration/  Worker-employer work agreements
│   │   ├── review/         Two-way reviews on collaborations
│   │   ├── referral/       Commission-based job referrals + offers
│   │   ├── escrow/         Stripe Connect escrow transactions
│   │   ├── job-post/       Job board (CRUD + search)
│   │   ├── job-application/ Apply, invite, status management
│   │   ├── conversation/   Chat (REST + WebSocket gateway + Redis adapter)
│   │   ├── moderation/     Staff moderation queue
│   │   ├── notification/   In-app notifications
│   │   ├── subscription/   Plans + user subscriptions (inactive by default)
│   │   └── audit/          Audit log search
│   ├── .env.dev            Dev defaults (committed, works out of box)
│   └── .env.prod           Prod placeholders (NOT committed)
├── web/                    React + Vite minimal test UI
│   ├── src/
│   │   ├── api.ts          API client (fetch + JWT management + auto-refresh)
│   │   ├── App.tsx         Router + nav (14 routes)
│   │   └── pages/          13 page components
│   ├── .env                Dev API URL
│   └── .env.production     Prod API URL placeholder
├── docker-compose.yml      Postgres 16 + Redis 7
├── schema.sql              Full DDL for Redgate Data Modeler visualization
└── CLAUDE.md               This file
```

## Database Architecture

### ID Strategy
- Main entities: `BIGSERIAL` (auto-incrementing `BIGINT`)
- Shared PK children: `BIGINT` referencing parent ID (1:1)
- Small reference tables (specialisation, tag, subscription_plan): `SERIAL` (`INT`)

### Temporal Types
All date/datetime columns use `TIMESTAMPTZ` in PostgreSQL → Prisma `DateTime` with `@db.Timestamptz()` → JS `Date`.

### Entity Hierarchy (Shared Primary Key pattern)

```
Account (auth base)
├── ClientProfile (shared PK = account.id)
│   ├── WorkerProfile (shared PK = client_profile.id)
│   └── EmployerProfile (shared PK = client_profile.id)
└── StaffMember (shared PK = account.id)
```

Account has NO direct relations to business tables. All business logic flows through the profile hierarchy.

### Key Design Patterns
- **Shared PK**: IS-A inheritance (Account → ClientProfile → Worker/Employer)
- **Unique FK**: HAS-A 1:1 associations (Collaboration → EscrowTransaction)
- **Polymorphic**: ModerationItem uses `entity_type` + `entity_id`
- **Denormalization**: `client_profile.verification_level`, `portfolio_item.verified` for read performance
- **Composite FK**: Message → ConversationParticipant via `(conversation_id, sender_id)` enforces sender must be participant

### All 35 Prisma Models

**Core auth:** Account, RefreshToken, StaffMember
**Profiles:** ClientProfile, WorkerProfile, EmployerProfile
**Portfolio:** PortfolioItem, ExperienceDetail, ProjectDetail, CertificationDetail, PortfolioMedia, PortfolioItemDocument
**Documents:** Document, ModerationItem, ModerationAction, VerificationMilestone
**Business:** Collaboration, Review, EscrowTransaction
**Referrals:** Referral, ReferralOffer
**Job board:** JobPost, JobPostSpecialisation, JobPostTag, JobApplication
**Messaging:** Conversation, ConversationParticipant, Message
**Reference data:** Specialisation, WorkerSpecialisation, Tag, WorkerTag
**Platform:** SubscriptionPlan, UserSubscription, Notification, AuditLog

## All API Endpoints (~115 routes)

### Auth (`/api/auth`)
- `POST /register` — email/password registration
- `POST /login` — email/password login
- `POST /refresh` — refresh access token
- `POST /logout` — invalidate refresh token (JWT required)
- `POST /logout-all` — invalidate all refresh tokens (JWT)
- `GET /google` — Google OAuth start
- `GET /google/callback` — Google OAuth callback

### Account (`/api/account`) — all JWT
- `GET /me` — current account + profiles
- `PATCH /me` — update phone/verification
- `DELETE /me` — deactivate

### Client Profiles (`/api/client-profiles`)
- `GET /` — search/list
- `PATCH /me` — update own (JWT)
- `GET /:slug` — public profile by slug

### Worker Profiles (`/api/worker-profiles`)
- `GET /` — search with filters
- `PATCH /me` — update own (JWT, WORKER role)
- `GET /:id` — public profile

### Employer Profiles (`/api/employer-profiles`)
- `GET /` — search with filters
- `PATCH /me` — update own (JWT, EMPLOYER role)
- `GET /:id` — public profile

### Specialisations (`/api/specialisations`)
- `GET /` — list all
- `GET /:id/workers` — workers by specialisation
- `POST /` — create (STAFF)
- `PATCH /:id` — update (STAFF)
- `DELETE /:id` — delete (STAFF)

### Tags (`/api/tags`)
- `GET /` — list all
- `POST /` — create (STAFF)
- `PATCH /:id` — update (STAFF)
- `DELETE /:id` — delete (STAFF)

### Documents (`/api/documents`)
- `POST /upload` — multipart upload (JWT)
- `GET /me` — my documents (JWT)
- `GET /:id` — single doc (owner or STAFF)
- `PATCH /:id/status` — review status (STAFF)
- `DELETE /:id` — delete if pending (JWT)

### Portfolio (`/api/portfolio`)
- `GET /worker/:workerId` — public list
- `GET /:id` — single item
- `POST /experience` — create experience (WORKER)
- `POST /project` — create project (WORKER)
- `POST /certification` — create certification (WORKER)
- `PATCH /:id` — update base fields (WORKER)
- `PATCH /:id/experience` — update experience detail (WORKER)
- `PATCH /:id/project` — update project detail (WORKER)
- `PATCH /:id/certification` — update certification detail (WORKER)
- `POST /:id/media` — add media (WORKER)
- `DELETE /media/:mediaId` — remove media (WORKER)
- `POST /:id/documents/:documentId` — link document (WORKER)
- `DELETE /:id/documents/:documentId` — unlink document (WORKER)
- `DELETE /:id` — delete item (WORKER)

### Collaborations (`/api/collaborations`)
- `POST /` — create (WORKER or EMPLOYER)
- `GET /me` — my collaborations (JWT)
- `GET /:id` — detail (participant or STAFF)
- `PATCH /:id/status` — update status (JWT)
- `POST /:id/flag` — flag with reason (JWT)

### Reviews (`/api/reviews`)
- `POST /collaboration/:collaborationId` — create review (JWT)
- `GET /collaboration/:collaborationId` — reviews for collab (JWT, participant)
- `GET /worker/:workerId` — published reviews about worker
- `GET /employer/:employerId` — published reviews about employer
- `GET /:id` — single review (public if published)
- `PATCH /:id/publish` — publish review (STAFF)

### Referrals (`/api/referrals`)
- `POST /` — create referral (JWT, client profile)
- `GET /` — public search
- `GET /me` — my referrals (JWT)
- `GET /offers/me` — offers received (WORKER)
- `GET /:id` — detail with offers (JWT)
- `PATCH /:id` — update own open referral (JWT)
- `DELETE /:id` — cancel own referral (JWT)
- `POST /:id/offers` — send offer to worker (JWT)
- `PATCH /offers/:offerId/respond` — accept/decline (WORKER)

### Escrow (`/api/escrow`)
- `POST /collaboration/:collaborationId` — create escrow (EMPLOYER)
- `GET /collaboration/:collaborationId` — get escrow (participant or STAFF)
- `POST /:id/deposit` — start deposit (EMPLOYER)
- `POST /:id/confirm-deposit` — confirm deposit held (STAFF)
- `POST /:id/release` — release funds to worker (STAFF)
- `POST /:id/refund` — refund (STAFF)
- `POST /:id/dispute` — dispute (JWT, participant)

### Job Posts (`/api/job-posts`)
- `POST /` — create (EMPLOYER)
- `GET /me` — my posts (EMPLOYER)
- `GET /` — public search with filters
- `GET /:id` — detail
- `PATCH /:id` — update (owner)
- `DELETE /:id` — delete (owner)

### Job Applications (`/api/job-applications`)
- `POST /jobs/:jobPostId/apply` — apply to job (WORKER)
- `POST /jobs/:jobPostId/invite` — invite worker (EMPLOYER, auto-creates conversation)
- `GET /jobs/:jobPostId` — applications for job (EMPLOYER, owner)
- `GET /me` — my applications (WORKER)
- `PATCH /:id/status` — update status (permissions in service)
- `POST /:id/to-collaboration` — convert accepted app to collaboration (EMPLOYER)

### Conversations (`/api/conversations`) — all JWT
- `POST /` — start/resume conversation (finds or creates)
- `GET /` — inbox (paginated)
- `GET /unread-count` — total unread
- `GET /:id/messages` — paginated messages
- `POST /:id/messages` — send message
- `PATCH /:id/read` — mark read

### WebSocket (`ws://host:port/chat` namespace)
- Auth: JWT token via `auth.token` on handshake
- Auto-joins all conversation rooms on connect
- Events emitted: `new_message`, `message_read`
- Client can emit: `join_conversation`
- Redis adapter for multi-instance scaling

### Moderation (`/api/moderation`) — all STAFF
- `GET /queue` — paginated queue
- `GET /:id` — item with actions
- `POST /:id/actions` — record action
- `GET /:id/actions` — list actions

### Notifications (`/api/notifications`) — all JWT
- `GET /` — list
- `GET /unread-count` — count
- `PATCH /read-all` — mark all read
- `PATCH /:id/read` — mark one read

### Subscriptions (`/api/subscriptions`)
- `GET /plans` — list plans
- `POST /plans` — create plan (ADMIN)
- `PATCH /plans/:id` — update plan (ADMIN)
- `POST /subscribe` — subscribe to plan (JWT)
- `GET /me` — current subscription (JWT)
- `DELETE /:id` — cancel subscription (JWT)

### Audit (`/api/audit`) — STAFF only
- `GET /` — search audit logs

## Messaging Architecture (Upwork-like)

- One conversation per unique pair of accounts (LinkedIn/Upwork style)
- Context (job invitation/application) carried in `message.metadata` and `message.message_type` (TEXT, JOB_INVITATION, SYSTEM)
- `ConversationParticipant` table manages read status (last_read_at)
- Message has composite FK to ConversationParticipant: sender must be participant
- Any user can message a moderator; moderator can message anyone
- Employer inviting worker auto-creates conversation with JOB_INVITATION message
- Real-time via Socket.IO + Redis Pub/Sub adapter

## Role System

Roles determined from account relations (not a field on account):
- **WORKER**: has `account.client_profile.worker_profile`
- **EMPLOYER**: has `account.client_profile.employer_profile`
- **ADMIN**: has `account.staff_member` with `staff_role = 'ADMIN'`
- **MODERATOR**: has `account.staff_member` with `staff_role = 'MODERATOR'`
- **STAFF**: any staff member (ADMIN or MODERATOR)

JWT payload: `{ sub: accountId, email }`. On validate, JwtStrategy loads full profile tree and attaches to request:
```typescript
{ accountId, email, clientProfileId, isWorker, isEmployer, isStaff, staffRole }
```

Guards: `JwtAuthGuard` (auth check) + `RolesGuard` with `@Roles(...)` decorator.

## Global NestJS Infrastructure

- `BigIntSerializationInterceptor`: converts BigInt → Number for JSON serialization
- `GlobalExceptionFilter`: consistent error response format
- `ValidationPipe`: whitelist + transform + implicit conversion
- Global prefix: `/api`
- CORS: enabled for all origins
- Rate limiting: 60 requests per 60 seconds (ThrottlerModule)

## Prisma 7 Specifics

- No `url` in `datasource` block of `schema.prisma` — URL defined in `prisma.config.ts`
- `PrismaService` and seed script both use `@prisma/adapter-pg` to instantiate client
- `prisma.config.ts` reads `DATABASE_URL` from env

## Frontend Pages (14 routes in App.tsx)

All pages are minimal/functional test UI (bare buttons, forms, raw JSON output). A separate frontend developer will build the real UI.

| Route | Page | What it tests |
|-------|------|---------------|
| `/login` | LoginPage | Email/password login |
| `/register` | RegisterPage | Registration |
| `/dashboard` | DashboardPage | Account info, notification count |
| `/profile` | ProfilePage | Profile edit, portfolio CRUD, documents |
| `/jobs` | JobBoardPage | Job search, create post, apply |
| `/workers` | WorkerSearchPage | Worker search with filters |
| `/employers` | EmployerSearchPage | Employer search |
| `/collaborations` | CollaborationsPage | Create, status, flag, escrow |
| `/referrals` | ReferralsPage | Create, offers, respond |
| `/reviews` | ReviewsPage | Create review, list by worker/employer |
| `/notifications` | NotificationsPage | List, read, count |
| `/my-applications` | MyApplicationsPage | Applications, invitations, convert to collab |
| `/inbox` | InboxPage | Conversations, messages, real-time WS |
| `/admin` | AdminPage | Moderation, documents, subscriptions, specialisations, audit |

Frontend API client (`web/src/api.ts`): custom fetch wrapper with JWT token storage in localStorage, auto `Authorization` header, auto-refresh on 401.

## Test Accounts (seed data)

Password for ALL accounts: `Password123!`

| Role | Email | Notes |
|------|-------|-------|
| Admin | admin@tradehub.co.uk | Full access |
| Moderator | moderator@tradehub.co.uk | Moderation + can message anyone |
| Worker | mike.builder@example.com | Has portfolio, collaborations, messages |
| Worker | sarah.sparks@example.com | Electrician |
| Worker | dave.pipes@example.com | Plumber |
| Worker | tom.wood@example.com | Carpenter |
| Worker | emma.tiles@example.com | Tiler |
| Employer | james@acmebuild.co.uk | Has job posts, collaborations |
| Employer | lisa@homeworks.co.uk | Has job posts |
| Employer | rob@quickfix.co.uk | Has job posts |

## Environment Variables

All in `backend/.env.dev` (committed, works out of box):
- `DATABASE_URL` — Postgres on port 5433 via Docker
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — dev secrets
- `JWT_ACCESS_TTL=15m` / `JWT_REFRESH_TTL=7d`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — empty (OAuth disabled in dev)
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — empty (escrow stubbed)
- `RESEND_API_KEY` — empty (no emails in dev)
- `REDIS_URL=redis://localhost:6379` — local Redis via Docker (set empty for in-memory WS)
- `PORT=8081`

## Known Gaps / Minor Issues

1. **Google OAuth**: No frontend button. Needs real credentials to work.
2. **Tags CRUD**: Backend exists, no dedicated frontend (manageable via Swagger).
3. **Subscription subscribe/cancel**: Backend exists, no frontend buttons (subscriptions disabled by default).
4. **Escrow deposit/release/refund/dispute**: Staff-only actions, testable via Swagger.
5. **Job post edit/delete**: Backend exists, not in Job Board UI.
6. **Account update/delete**: Backend exists, not in frontend.
7. **Frontend logout**: Calls `POST /auth/logout` but doesn't send `refresh_token` in body — server-side invalidation may not work fully.

## Key Decisions Made During Development

1. **No unit tests** in current MVP phase.
2. **Subscriptions present but inactive** — `is_active=false` by default on plans, can be enabled from admin.
3. **Escrow on Collaboration** (not on Referral) — escrow guards the actual work agreement.
4. **Singular table names** everywhere (`account` not `accounts`).
5. **BIGINT IDs** for all main entities (not UUID) — user preference.
6. **TIMESTAMPTZ** for all dates — no timezone issues.
7. **Monorepo**: backend + web in one repo, mobile app will be added later with shared backend.
8. **Minimal frontend**: intentionally ugly — a separate developer will build the real UI.

## Running Locally

```bash
docker compose up -d          # Postgres + Redis
cd backend
cp .env.dev .env              # only first time
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
npm run start:dev             # terminal 1

cd web
npm install
npm run dev                   # terminal 2
```

## Resetting Database

```bash
cd backend
npx prisma migrate reset      # drops all, re-migrates, re-seeds
```

## Production Deploy

Works with Railway / Render / Fly.io / any VPS. Fill `backend/.env.prod`, set `web/.env.production`, then:

```bash
# Backend
cd backend && npm ci && npx prisma generate && npx prisma migrate deploy && npm run build && node dist/main.js

# Frontend
cd web && npm ci && npm run build
# serve web/dist/ via nginx / Vercel / Netlify
```
