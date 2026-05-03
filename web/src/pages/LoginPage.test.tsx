// TEST-AUTH-077 — LoginPage.
// Source: web/src/pages/LoginPage.tsx
// Contract: AUTH-014-001/002, AUTH-005, AUTH-002, Decisions Log 2026-04-26
// (EMAIL_NOT_VERIFIED banner with Resend CTA, ACCOUNT_DEACTIVATED banner).

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { makeErrorBody, makeLoginResponse } from '@/test/factories';
import LoginPage from './LoginPage';

const API = 'http://localhost:8081/api';

function noop() {}

describe('TEST-AUTH-077 LoginPage', () => {
  test('AUTH-014-001 — submits to /auth/login with the form values', async () => {
    let body: { email?: string; password?: string } | null = null;
    server.use(
      http.post(`${API}/auth/login`, async ({ request }) => {
        body = (await request.json()) as never;
        return HttpResponse.json(makeLoginResponse({ email: body!.email }));
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<LoginPage onLogin={noop} />);
    await user.type(screen.getByLabelText(/Email/i), 'me@example.com');
    await user.type(screen.getByLabelText(/Password/i), 'Tr@deHub1A!');
    await user.click(screen.getByRole('button', { name: /Sign in/i }));
    await waitFor(() => {
      expect(body).toEqual({
        email: 'me@example.com',
        password: 'Tr@deHub1A!',
      });
    });
  });

  test('Decisions Log 2026-04-26 — code: EMAIL_NOT_VERIFIED is parsed (route to /verify-email), tokens preserved', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json(
          makeErrorBody('EMAIL_NOT_VERIFIED', {
            statusCode: 403,
            email: 'p@x.io',
            access_token: 'a',
            refresh_token: 'r',
          }),
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<LoginPage onLogin={noop} />);
    await user.type(screen.getByLabelText(/Email/i), 'p@x.io');
    await user.type(screen.getByLabelText(/Password/i), 'Tr@deHub1A!');
    await user.click(screen.getByRole('button', { name: /Sign in/i }));

    // Tokens are preserved so /verify-email can call resend immediately.
    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBe('a');
      expect(localStorage.getItem('refresh_token')).toBe('r');
    });
  });

  test('AUTH-002 — code: ACCOUNT_DEACTIVATED renders the deactivated banner', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json(
          makeErrorBody('ACCOUNT_DEACTIVATED', {
            statusCode: 403,
            message: 'This account has been deactivated.',
          }),
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<LoginPage onLogin={noop} />);
    await user.type(screen.getByLabelText(/Email/i), 'gone@x.io');
    await user.type(screen.getByLabelText(/Password/i), 'Tr@deHub1A!');
    await user.click(screen.getByRole('button', { name: /Sign in/i }));
    expect(await screen.findByText(/Account deactivated/i)).toBeInTheDocument();
  });

  test('AUTH-005 — Google CTA hidden when /auth/providers returns google: false', async () => {
    server.use(
      http.get(`${API}/auth/providers`, () => HttpResponse.json({ google: false })),
    );
    renderWithRouter(<LoginPage onLogin={noop} />);
    // Wait for providers fetch to settle.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /Continue with Google/i }),
      ).not.toBeInTheDocument();
    });
  });

  test('AUTH-005 — Google CTA visible when /auth/providers returns google: true', async () => {
    server.use(
      http.get(`${API}/auth/providers`, () => HttpResponse.json({ google: true })),
    );
    renderWithRouter(<LoginPage onLogin={noop} />);
    expect(
      await screen.findByRole('button', { name: /Continue with Google/i }),
    ).toBeInTheDocument();
  });
});
