# Backend e2e tests

Live under `backend/test/*.e2e-spec.ts` (separate from the colocated
`*.spec.ts` unit specs under `src/`). The suite boots the full `AppModule`
against a Postgres Testcontainer, applies `prisma migrate deploy`, and
exercises the HTTP surface via Supertest.

## Run

```bash
docker compose up -d              # not strictly required — Testcontainers
                                  # spawns its own Postgres — but Docker
                                  # itself must be running.
cd backend
npm install
npm run test:e2e
```

The first run downloads the `postgres:16-alpine` image (~150 MB).
Subsequent runs reuse the cached layer. Each suite gets one container
per Jest worker; tables are truncated between tests via
`backend/test/util/postgres-container.ts:truncateAll`.

## Run a single spec

```bash
npx jest --config ./test/jest-e2e.json --testPathPatterns="auth.login"
```

`--testPathPatterns` is the v30 form of the older `--testPathPattern`.

## Keep the container alive between runs (debug)

The harness reuses the running container for the lifetime of the Jest
worker process. To debug interactively against the same DB across multiple
spec runs, run the suite once with `--watch`:

```bash
npx jest --config ./test/jest-e2e.json --watch
```

You can also point Prisma Studio at the container:

```bash
DATABASE_URL="<getConnectionUri-from-jest-output>" npx prisma studio
```

## Inspect captured email

`MailService` is overridden by `TestMailService` (in-memory mailbox).
Each spec accesses it via the harness:

```ts
const harness = await createTestApp();
// …
const mail = harness.mail.latest('user@example.com', 'verification');
console.log(mail?.data.token, mail?.data.confirmUrl);
```

## Rate-limit spec (TEST-AUTH-050)

`auth.rate-limit.e2e-spec.ts` boots a separate app instance with the real
`ThrottlerGuard` (`enableThrottler: true`) so the per-route throttle table
in `AuthController` actually fires. All other suites use the harness'
`NoopThrottlerGuard` so they don't trip per-IP limits incidentally.

## Troubleshooting

- **`Could not find a working Docker socket`** — start Docker / OrbStack
  before running the suite. Testcontainers exits 1 with a clear hint.
- **`route /api/test/mailbox/:address not found`** — the
  `TestOnlyModule` is gated by `NODE_ENV === 'test'`. The harness sets
  this in `createTestApp`; production never mounts it.
