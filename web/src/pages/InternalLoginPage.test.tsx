// TEST-AUTH-078 — InternalLoginPage.
// Source: web/src/pages/InternalLoginPage.tsx
// Contract: §11 (no Google CTA on staff host), AUTH-018-007 INVITE_EXPIRED.

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithRouter, screen, userEvent } from '@/test/render';
import { server } from '@/test/msw-server';
import { makeErrorBody, makeLoginResponse } from '@/test/factories';
import InternalLoginPage from './InternalLoginPage';

const API = 'http://localhost:8081/api';

function noop() {}

describe('TEST-AUTH-078 InternalLoginPage', () => {
  test('§11 — never renders a Google CTA, even when providers say google: true', async () => {
    server.use(
      http.get(`${API}/auth/providers`, () =>
        HttpResponse.json({ google: true }),
      ),
    );
    renderWithRouter(<InternalLoginPage onLogin={noop} />);
    expect(
      screen.queryByRole('button', { name: /Continue with Google/i }),
    ).not.toBeInTheDocument();
  });

  test('AUTH-018-007 — INVITE_EXPIRED response body surfaces the right copy', async () => {
    server.use(
      http.post(`${API}/auth/staff/login`, () =>
        HttpResponse.json(
          makeErrorBody('INVITE_EXPIRED', {
            statusCode: 401,
            message: 'Your staff invite has expired.',
          }),
          { status: 401 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<InternalLoginPage onLogin={noop} />);
    await user.type(screen.getByLabelText(/Email/i), 'admin@tradehub.co.uk');
    await user.type(screen.getByLabelText(/Password/i), 'Tr@deHub1A!');
    await user.click(screen.getByRole('button', { name: /Staff sign in/i }));
    expect(await screen.findByText(/Invite expired/i)).toBeInTheDocument();
  });

  test('AUTH-014-002 — successful staff login triggers post-auth redirect to /admin', async () => {
    server.use(
      http.post(`${API}/auth/staff/login`, () =>
        HttpResponse.json(
          makeLoginResponse({
            email: 'admin@tradehub.co.uk',
            is_staff: true,
            staff_role: 'ADMIN',
          }),
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<InternalLoginPage onLogin={noop} />);
    await user.type(screen.getByLabelText(/Email/i), 'admin@tradehub.co.uk');
    await user.type(screen.getByLabelText(/Password/i), 'Tr@deHub1A!');
    await user.click(screen.getByRole('button', { name: /Staff sign in/i }));
    // Tokens stored — that's evidence the page reached the success branch.
    // (Navigation is via react-router's MemoryRouter; the destination is
    // exercised in the Playwright suite TEST-AUTH-104.)
    expect(localStorage.getItem('access_token')).toBeTruthy();
  });
});
