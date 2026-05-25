// TEST-AUTH-085 — api.ts contract: ApiError + parseApiError + 401 refresh
// retry. Source: web/src/api.ts.
//
// The token storage is module-level. Each test gets a fresh module via
// `vi.resetModules()` and a fresh MSW handler set.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './test/msw-server';

const API = 'http://localhost:8081/api';

async function freshApi() {
  vi.resetModules();
  return await import('./api');
}

beforeEach(() => {
  localStorage.clear();
  // Strip any pre-set tokens from earlier suites.
  vi.resetModules();
  // jsdom's location.href setter throws — stub it so the redirect path is
  // observable rather than fatal.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, href: 'http://localhost/' },
  });
});

afterEach(() => {
  server.resetHandlers();
});

describe('TEST-AUTH-085 ApiError + parseApiError', () => {
  test('Decisions Log 2026-04-26 — parseApiError extracts code, message, embedded fields from ApiError', async () => {
    const { ApiError, parseApiError } = await freshApi();
    const err = new ApiError(403, {
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email.',
      email: 'pending@x.io',
      access_token: 'a',
    });
    const parsed = parseApiError(err);
    expect(parsed).toMatchObject({
      status: 403,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email.',
    });
    expect(parsed!.body).toMatchObject({
      email: 'pending@x.io',
      access_token: 'a',
    });
  });

  test('AUTH-008 — ApiError instances are also instanceof Error and carry status + body', async () => {
    const { ApiError } = await freshApi();
    const err = new ApiError(401, { code: 'X' });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(401);
    expect(err.body).toEqual({ code: 'X' });
  });

  test('parseApiError handles a plain Error with a JSON-stringified message (legacy callers)', async () => {
    const { parseApiError } = await freshApi();
    const err = new Error('{"code":"X","message":"why"}');
    const parsed = parseApiError(err);
    expect(parsed).toMatchObject({ code: 'X', message: 'why' });
  });
});

describe('TEST-AUTH-085 api() 401 refresh retry', () => {
  test('AUTH-008 — 401 triggers /auth/refresh; on success, the original request is retried with the new token', async () => {
    let attempts = 0;
    server.use(
      http.get(`${API}/account/me`, ({ request }) => {
        attempts += 1;
        const auth = request.headers.get('Authorization');
        if (attempts === 1) {
          return HttpResponse.json({ message: 'expired' }, { status: 401 });
        }
        // Second attempt should carry the refreshed token.
        if (auth !== 'Bearer fresh-access') {
          return HttpResponse.json(
            { message: 'wrong bearer' },
            { status: 401 },
          );
        }
        return HttpResponse.json({ id: '1', email: 'x@x.io' });
      }),
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({
          access_token: 'fresh-access',
          refresh_token: 'fresh-refresh',
        }),
      ),
    );
    localStorage.setItem('access_token', 'stale');
    localStorage.setItem('refresh_token', 'have-it');

    const { api } = await freshApi();
    const data = await api<{ email: string }>('/account/me');
    expect(data.email).toBe('x@x.io');
    expect(localStorage.getItem('access_token')).toBe('fresh-access');
    expect(localStorage.getItem('refresh_token')).toBe('fresh-refresh');
  });

  test('AUTH-008 — refresh failure → tokens cleared + redirect to /login?reason=expired', async () => {
    server.use(
      http.get(`${API}/account/me`, () =>
        HttpResponse.json({ message: 'expired' }, { status: 401 }),
      ),
      http.post(`${API}/auth/refresh`, () =>
        HttpResponse.json({ message: 'no good' }, { status: 401 }),
      ),
    );
    localStorage.setItem('access_token', 'stale');
    localStorage.setItem('refresh_token', 'also-stale');

    // Capture the location.href assignment instead of letting jsdom throw.
    const setHref = vi.fn();
    Object.defineProperty(window.location, 'href', {
      configurable: true,
      get: () => 'http://localhost/',
      set: setHref,
    });

    const { api, ApiError } = await freshApi();
    await expect(api('/account/me')).rejects.toBeInstanceOf(ApiError);
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(setHref).toHaveBeenCalledWith('/login?reason=expired');
  });
});
