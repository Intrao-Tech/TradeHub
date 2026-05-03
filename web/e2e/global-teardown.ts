// TEST-AUTH-100 — Playwright globalTeardown. Reads container id + backend pid
// from `.e2e-env` and shuts everything down.

import { readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const WEB_DIR = resolve(__dirname, '..');

export default async function globalTeardown() {
  let containerId: string | null = null;
  let backendPid: number | null = null;
  try {
    const text = readFileSync(resolve(WEB_DIR, '.e2e-env'), 'utf8');
    const cm = text.match(/PW_PG_CONTAINER_ID="([^"]+)"/);
    const pm = text.match(/PW_BACKEND_PID="(\d+)"/);
    if (cm) containerId = cm[1];
    if (pm) backendPid = Number(pm[1]);
  } catch {
    /* no env file — nothing to clean up */
  }

  if (backendPid && Number.isFinite(backendPid)) {
    try {
      process.kill(backendPid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
  if (containerId) {
    try {
      execSync(`docker rm -f ${containerId}`, { stdio: 'ignore' });
    } catch {
      /* container may have been reaped already */
    }
  }
  try {
    unlinkSync(resolve(WEB_DIR, '.e2e-env'));
  } catch {
    /* missing is fine */
  }
}
