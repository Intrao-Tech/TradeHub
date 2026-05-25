// TEST-AUTH-040: shared Postgres Testcontainer utilities.
//
// Strategy: ONE container per Jest worker (process). Migrations apply once
// against an empty DB. Each spec resets state via `truncateAll()` rather
// than restarting the container — orders of magnitude faster.

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer | null = null;
let connectionUri: string | null = null;
let migrated = false;

const BACKEND_DIR = join(__dirname, '..', '..');

export async function startPostgres(): Promise<{
  container: StartedPostgreSqlContainer;
  uri: string;
}> {
  if (container && connectionUri) return { container, uri: connectionUri };

  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('tradehub_test')
    .withUsername('tradehub_test')
    .withPassword('tradehub_test')
    .start();

  connectionUri = container.getConnectionUri();
  process.env.DATABASE_URL = connectionUri;

  if (!migrated) {
    // `prisma migrate deploy` with the container URL applies every committed
    // migration against the empty DB. We run it as a one-shot subprocess so
    // it picks up the live env, not a cached client.
    execSync('npx prisma migrate deploy', {
      cwd: BACKEND_DIR,
      env: { ...process.env, DATABASE_URL: connectionUri },
      stdio: 'inherit',
    });
    migrated = true;
  }

  return { container, uri: connectionUri };
}

export async function stopPostgres(): Promise<void> {
  if (container) {
    await container.stop();
    container = null;
    connectionUri = null;
    migrated = false;
  }
}

/**
 * Truncate every public-schema table except Prisma's own migration table.
 * Restarts identity sequences so BigInt PKs stay small and deterministic.
 */
export async function truncateAll(prisma: {
  $queryRawUnsafe: (sql: string) => Promise<unknown>;
  $executeRawUnsafe: (sql: string) => Promise<unknown>;
}): Promise<void> {
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `)) as Array<{ tablename: string }>;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}
