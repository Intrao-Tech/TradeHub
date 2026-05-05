// TEST-JOBS-181 — useTags caches the catalog at module level (JOBS-022).

import { describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { server } from '@/test/msw-server';
import { useTags } from './useTags';

const API = 'http://localhost:8081/api';

describe('TEST-JOBS-181 useTags caches at module level (JOBS-022)', () => {
  test('JOBS-022 — two consumers mounted in sequence share one GET /tags call', async () => {
    const handler = vi.fn(() =>
      HttpResponse.json([{ id: 10, name: 'Loft', slug: 'loft' }]),
    );
    server.use(http.get(`${API}/tags`, handler));

    const { result: first, unmount } = renderHook(() => useTags());
    await waitFor(() => expect(first.current.loading).toBe(false));
    expect(first.current.items).toHaveLength(1);
    unmount();

    const { result: second } = renderHook(() => useTags());
    await waitFor(() => expect(second.current.loading).toBe(false));
    expect(second.current.items).toHaveLength(1);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
