// TEST-AUTH-073 — host.ts (marketplace ↔ staff subdomain split, AUTH-016).
//
// `IS_STAFF_HOST` is computed at module load from window.location.hostname.
// vitest's jsdom environment fixes the URL to `http://localhost`. We
// monkey-patch the hostname before re-importing the module to test each
// branch.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

async function importHostWithHostname(hostname: string) {
  vi.resetModules();
  const original = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...original, hostname },
  });
  return await import('./host');
}

afterEach(() => {
  vi.resetModules();
});

describe('TEST-AUTH-073 IS_STAFF_HOST (AUTH-016)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('AUTH-016-004 — internal.localhost → IS_STAFF_HOST = true', async () => {
    const mod = await importHostWithHostname('internal.localhost');
    expect(mod.IS_STAFF_HOST).toBe(true);
  });

  test('AUTH-016-004 — internal.tradehub.co.uk → IS_STAFF_HOST = true', async () => {
    const mod = await importHostWithHostname('internal.tradehub.co.uk');
    expect(mod.IS_STAFF_HOST).toBe(true);
  });

  test('AUTH-016-004 — apex tradehub.co.uk → IS_STAFF_HOST = false', async () => {
    const mod = await importHostWithHostname('tradehub.co.uk');
    expect(mod.IS_STAFF_HOST).toBe(false);
  });

  test('AUTH-016-004 — app.tradehub.co.uk (marketplace) → IS_STAFF_HOST = false', async () => {
    const mod = await importHostWithHostname('app.tradehub.co.uk');
    expect(mod.IS_STAFF_HOST).toBe(false);
  });

  test('AUTH-016-004 — localhost (dev marketplace) → IS_STAFF_HOST = false', async () => {
    const mod = await importHostWithHostname('localhost');
    expect(mod.IS_STAFF_HOST).toBe(false);
  });
});
