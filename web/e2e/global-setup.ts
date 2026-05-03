// TEST-AUTH-100 — Playwright globalSetup. Starts a Postgres Testcontainer,
// runs prisma migrate deploy, then spawns the backend (NODE_ENV=test) and
// waits for it to answer on /api/auth/providers. Stashes the container id +
// backend pid in `.e2e-env` for globalTeardown.

// Disable Testcontainers' ryuk reaper BEFORE importing — ryuk only reaps
// when the launching process dies, and Playwright's globalSetup runs in a
// short-lived process. We manage cleanup ourselves in globalTeardown.
process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';

import { execSync, spawn } from 'node:child_process';
import { writeFileSync, openSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const WEB_DIR = resolve(__dirname, '..');
const BACKEND_DIR = resolve(WEB_DIR, '../backend');
const LOG_DIR = resolve(WEB_DIR, '.e2e-logs');

const WEB_PORT = Number(process.env.PW_WEB_PORT ?? 4173);
const API_PORT = Number(process.env.PW_API_PORT ?? 8082);
const WEB_URL = `http://localhost:${WEB_PORT}`;

export default async function globalSetup() {
  mkdirSync(LOG_DIR, { recursive: true });

  // ── 1. Boot the Postgres Testcontainer ─────────────────────
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('tradehub_pw')
    .withUsername('tradehub_pw')
    .withPassword('tradehub_pw')
    .withName(`tradehub-pw-${Date.now()}`)
    .start();
  const uri = container.getConnectionUri();

  // ── 2. Apply migrations ───────────────────────────────────
  execSync('npx prisma migrate deploy', {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: uri },
    stdio: 'inherit',
  });

  // ── 3. Spawn the backend in NODE_ENV=test ─────────────────
  const stdoutFd = openSync(resolve(LOG_DIR, 'backend.stdout.log'), 'a');
  const stderrFd = openSync(resolve(LOG_DIR, 'backend.stderr.log'), 'a');
  const backend = spawn(
    'npx',
    ['ts-node', '-r', 'tsconfig-paths/register', 'src/main.ts'],
    {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: uri,
        PORT: String(API_PORT),
        FRONTEND_URL: WEB_URL,
        STAFF_FRONTEND_URL: WEB_URL,
        STAFF_LOGIN_HOST: 'localhost',
        JWT_SECRET: 'pw-secret',
        JWT_REFRESH_SECRET: 'pw-refresh-secret',
        REDIS_URL: '',
      },
      stdio: ['ignore', stdoutFd, stderrFd],
      detached: true,
    },
  );
  backend.unref();

  // ── 4. Wait for backend readiness ─────────────────────────
  const deadline = Date.now() + 60_000;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${API_PORT}/api/auth/providers`);
      if (res.ok) {
        lastErr = null;
        break;
      }
      lastErr = new Error(`status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (lastErr) {
    throw new Error(
      `backend failed to start within 60s: ${(lastErr as Error).message}. See ${LOG_DIR}/backend.stderr.log`,
    );
  }

  // ── 5. Persist teardown info ──────────────────────────────
  writeFileSync(
    resolve(WEB_DIR, '.e2e-env'),
    `PW_PG_CONTAINER_ID="${container.getId()}"\nPW_BACKEND_PID="${backend.pid ?? ''}"\nDATABASE_URL="${uri}"\n`,
    'utf8',
  );
}
