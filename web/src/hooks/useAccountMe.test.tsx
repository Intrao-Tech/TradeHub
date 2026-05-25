// TEST-AUTH-084 — useAccountMe hook.
// Source: web/src/hooks/useAccountMe.ts
// Contract: PROF-051 (single client-side cache, refetch invalidates).
//
// The hook holds a module-level cache. We rely on the global setup file
// dispatching `auth-changed` between tests to clear it.

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { useAccountMe } from './useAccountMe';

const API = 'http://localhost:8081/api';

describe('TEST-AUTH-084 useAccountMe', () => {
  test('PROF-051 — first call fetches /account/me; second mount within the same module lifetime returns the cached value (no refetch)', async () => {
    let hits = 0;
    server.use(
      http.get(`${API}/account/me`, () => {
        hits += 1;
        return HttpResponse.json({
          id: '1',
          email: 'cached@x.io',
          email_verified_at: new Date().toISOString(),
          phone: null,
          phone_verified: false,
          status: 'ACTIVE',
          client_profile: { id: '1', display_name: 'C', worker_profile: null, employer_profile: null },
          staff_member: null,
        });
      }),
    );

    const first = renderHook(() => useAccountMe());
    await waitFor(() => {
      expect(first.result.current.account?.email).toBe('cached@x.io');
    });
    expect(hits).toBe(1);

    // Second consumer in the same lifetime — should NOT trigger a second fetch.
    const second = renderHook(() => useAccountMe());
    await waitFor(() => {
      expect(second.result.current.account?.email).toBe('cached@x.io');
    });
    expect(hits).toBe(1);
  });

  test('PROF-051 — refetch() re-fires the request', async () => {
    let hits = 0;
    server.use(
      http.get(`${API}/account/me`, () => {
        hits += 1;
        return HttpResponse.json({
          id: '1',
          email: 'refetch@x.io',
          email_verified_at: null,
          phone: null,
          phone_verified: false,
          status: 'ACTIVE',
          client_profile: null,
          staff_member: null,
        });
      }),
    );
    const { result } = renderHook(() => useAccountMe());
    await waitFor(() => {
      expect(result.current.account?.email).toBe('refetch@x.io');
    });
    const before = hits;
    await result.current.refetch();
    expect(hits).toBe(before + 1);
  });

  test('PROF-051 — auth-changed event invalidates the cache (state reset between tests proves it)', async () => {
    // Setup file dispatches `auth-changed` after each test, so this test's
    // first call counts as a fresh mount and triggers a fetch.
    let hits = 0;
    server.use(
      http.get(`${API}/account/me`, () => {
        hits += 1;
        return HttpResponse.json({
          id: '1',
          email: 'fresh@x.io',
          email_verified_at: null,
          phone: null,
          phone_verified: false,
          status: 'ACTIVE',
          client_profile: null,
          staff_member: null,
        });
      }),
    );
    const { result } = renderHook(() => useAccountMe());
    await waitFor(() => {
      expect(result.current.account?.email).toBe('fresh@x.io');
    });
    expect(hits).toBe(1);
  });
});
