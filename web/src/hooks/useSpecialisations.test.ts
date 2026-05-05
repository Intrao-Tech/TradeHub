// TEST-JOBS-180 — useSpecialisations caches the catalog at module level
// across consumers (JOBS-022). Two consumers mounted back-to-back should
// share one fetch — not two — for the page lifetime.

import { describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { server } from '@/test/msw-server';
import { useSpecialisations } from './useSpecialisations';

const API = 'http://localhost:8081/api';

describe('TEST-JOBS-180 useSpecialisations caches at module level (JOBS-022)', () => {
  test('JOBS-022 — two consumers mounted in sequence share one GET /specialisations call', async () => {
    const handler = vi.fn(() =>
      HttpResponse.json([{ id: 1, name: 'Plumbing', slug: 'plumbing' }]),
    );
    server.use(http.get(`${API}/specialisations`, handler));

    const { result: first, unmount: unmountFirst } = renderHook(() =>
      useSpecialisations(),
    );
    await waitFor(() => expect(first.current.loading).toBe(false));
    expect(first.current.items).toHaveLength(1);
    unmountFirst();

    // Second consumer reads from the cache; no new fetch.
    const { result: second } = renderHook(() => useSpecialisations());
    await waitFor(() => expect(second.current.loading).toBe(false));
    expect(second.current.items).toHaveLength(1);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
