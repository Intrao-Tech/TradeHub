// TEST-AUTH-071 — default MSW handler set covering every auth-flow endpoint
// surfaced by `web/src/api.ts`. Each test overrides per-case via
// `server.use(http.<method>(...))`.

import { http, HttpResponse } from 'msw';
import { makeAccountSummary, makeLoginResponse } from './factories';
import { jobsHandlers } from './handlers/jobs';

const API = 'http://localhost:8081/api';

export const handlers = [
  ...jobsHandlers,
  // ── Discovery ───────────────────────────────────────────────
  http.get(`${API}/auth/providers`, () => HttpResponse.json({ google: true })),

  // ── Marketplace auth ────────────────────────────────────────
  http.post(`${API}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as { email?: string };
    return HttpResponse.json(
      { pending_verification: true, email: body.email ?? 'unknown@x.io' },
      { status: 201 },
    );
  }),

  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    return HttpResponse.json(
      makeLoginResponse({ email: body.email ?? 'user@x.io' }),
    );
  }),

  http.post(`${API}/auth/refresh`, () =>
    HttpResponse.json({
      access_token: 'fresh-access',
      refresh_token: 'fresh-refresh',
    }),
  ),

  http.post(`${API}/auth/logout`, () => HttpResponse.json({ ok: true })),
  http.post(`${API}/auth/logout-all`, () =>
    HttpResponse.json({ revoked: 1 }),
  ),

  http.post(`${API}/auth/forgot-password`, () =>
    HttpResponse.json({ ok: true }),
  ),
  http.post(`${API}/auth/reset-password`, () =>
    HttpResponse.json({ ok: true }),
  ),
  http.post(`${API}/auth/change-password`, () =>
    HttpResponse.json({ ok: true }),
  ),

  http.post(`${API}/auth/verify-email/send`, () =>
    HttpResponse.json({ ok: true }),
  ),
  http.post(`${API}/auth/verify-email/confirm`, async ({ request }) => {
    const body = (await request.json()) as { token?: string };
    return HttpResponse.json(makeLoginResponse({ withTokens: true, token: body.token }));
  }),

  // ── Account ────────────────────────────────────────────────
  http.get(`${API}/account/me`, () =>
    HttpResponse.json(makeAccountSummary()),
  ),

  // ── Staff ──────────────────────────────────────────────────
  http.post(`${API}/auth/staff/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string };
    return HttpResponse.json(
      makeLoginResponse({
        email: body.email ?? 'admin@x.io',
        is_staff: true,
        staff_role: 'ADMIN',
      }),
    );
  }),

  // ── Google OAuth (start endpoint) ──────────────────────────
  http.get(`${API}/auth/google/start`, () =>
    HttpResponse.json({
      redirect_url: 'https://accounts.google.com/o/oauth2/v2/auth?stub=1',
    }),
  ),
];
