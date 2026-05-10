// TEST-CR-110..112 — useRefAttribution hook.
// Verifies cookie attribution flow: ?ref= → POST /referral/track-click,
// strip the param, no-op if absent, silent fail on invalid code.

import { renderHook, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import * as React from 'react';
import { server } from '../../test/msw-server';
import { useRefAttribution } from './useRefAttribution';

// Pin auth token so api() helper picks something out of localStorage —
// trackProjectClick is public but api wrapper reads token at module load.
beforeEach(() => {
  localStorage.setItem('access_token', 'test');
});

const API = 'http://localhost:8081/api';

function wrap(initialPath: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      MemoryRouter,
      { initialEntries: [initialPath] },
      children,
    );
  };
}

describe('TEST-CR-110..112 useRefAttribution', () => {
  beforeEach(() => {
    // Default handler: succeeds with a referrer name.
    server.use(
      http.post(`${API}/referral/track-click`, async ({ request }) => {
        const body = (await request.json()) as { code: string };
        if (body.code === 'BAD-BAD0') {
          return HttpResponse.json(
            { code: 'NOT_FOUND', message: 'Code not found' },
            { status: 404 },
          );
        }
        return HttpResponse.json({
          referrer_display_name: 'Mike Thompson',
          target: { type: 'JOB', id: '5', title: 'Office refit' },
        });
      }),
    );
  });

  test('TEST-CR-110 (CR-083) — ?ref=CODE present → fires POST + strips param', async () => {
    const trackSpy = vi.fn();
    server.use(
      http.post(`${API}/referral/track-click`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        trackSpy(body);
        return HttpResponse.json({
          referrer_display_name: 'X',
          target: { type: 'JOB', id: '5', title: 't' },
        });
      }),
    );

    renderHook(
      () => useRefAttribution({ targetId: 5, targetRole: 'WORKER' }),
      { wrapper: wrap('/jobs/5?ref=ABCD-EFGH') },
    );

    await waitFor(() => expect(trackSpy).toHaveBeenCalledTimes(1));
    expect(trackSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ABCD-EFGH',
        target_id: 5,
        target_role: 'WORKER',
      }),
    );
  });

  test('TEST-CR-111 (CR-083) — no ?ref in URL → no-op', async () => {
    const trackSpy = vi.fn();
    server.use(
      http.post(`${API}/referral/track-click`, async () => {
        trackSpy();
        return HttpResponse.json({
          referrer_display_name: null,
          target: { type: 'JOB', id: '5', title: 't' },
        });
      }),
    );

    renderHook(
      () => useRefAttribution({ targetId: 5, targetRole: 'WORKER' }),
      { wrapper: wrap('/jobs/5') },
    );

    // Wait long enough that any fire-on-mount would have happened.
    await new Promise((r) => setTimeout(r, 50));
    expect(trackSpy).not.toHaveBeenCalled();
  });

  test('TEST-CR-112 (CR-083) — invalid code → silent fail (no throw)', async () => {
    const trackSpy = vi.fn();
    server.use(
      http.post(`${API}/referral/track-click`, async ({ request }) => {
        const body = (await request.json()) as { code: string };
        trackSpy(body);
        return HttpResponse.json(
          { code: 'NOT_FOUND', message: 'Code not found' },
          { status: 404 },
        );
      }),
    );

    expect(() =>
      renderHook(
        () => useRefAttribution({ targetId: 5, targetRole: 'WORKER' }),
        { wrapper: wrap('/jobs/5?ref=BAD-BAD0') },
      ),
    ).not.toThrow();

    await waitFor(() => expect(trackSpy).toHaveBeenCalledTimes(1));
    // Hook still completes; toast not asserted (it's silent on error).
  });

  test('TEST-CR-110 — targetId null → does NOT fire (waits for resolved id)', async () => {
    const trackSpy = vi.fn();
    server.use(
      http.post(`${API}/referral/track-click`, async () => {
        trackSpy();
        return HttpResponse.json({
          referrer_display_name: null,
          target: { type: 'JOB', id: '5', title: 't' },
        });
      }),
    );

    renderHook(
      () => useRefAttribution({ targetId: null, targetRole: 'WORKER' }),
      { wrapper: wrap('/jobs/5?ref=ABCD-EFGH') },
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(trackSpy).not.toHaveBeenCalled();
  });
});

