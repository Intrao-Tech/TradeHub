// TEST-AUTH-100..106 — Playwright config.
//
// Boots a Postgres Testcontainer, runs `prisma migrate deploy` against it,
// then spawns the backend (NODE_ENV=test) and Vite dev server side-by-side.
// Uses globalSetup/globalTeardown to start/stop the container.

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const WEB_PORT = Number(process.env.PW_WEB_PORT ?? 4173);
const API_PORT = Number(process.env.PW_API_PORT ?? 8082);
const WEB_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Backend is single-instance shared by all specs; one worker keeps the
  // mailbox sink and DB state predictable.
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // globalSetup spawns the backend AFTER the Postgres container is ready —
  // Playwright starts webServer entries in parallel with globalSetup, so a
  // webServer that depends on globalSetup's output races and reads stale env.
  // Vite (the only `webServer` entry) does not need the DB.
  globalSetup: resolve(__dirname, 'e2e/global-setup.ts'),
  globalTeardown: resolve(__dirname, 'e2e/global-teardown.ts'),
  webServer: [
    {
      command: `npx vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: false,
      cwd: __dirname,
      env: {
        VITE_API_URL: `http://localhost:${API_PORT}/api`,
      },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120_000,
    },
  ],
});
