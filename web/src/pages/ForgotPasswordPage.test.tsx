// TEST-AUTH-079 — ForgotPasswordPage.
// Source: web/src/pages/ForgotPasswordPage.tsx
// Contract: AUTH-007 anti-enumeration UX guarantee — same generic success
// copy regardless of whether the email exists.

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithRouter, screen, userEvent } from '@/test/render';
import { server } from '@/test/msw-server';
import ForgotPasswordPage from './ForgotPasswordPage';

const API = 'http://localhost:8081/api';

const SUCCESS_COPY = /If an account exists/i;

describe('TEST-AUTH-079 ForgotPasswordPage', () => {
  test('AUTH-007 — backend 200 with body { ok: true } shows the generic success state', async () => {
    server.use(
      http.post(`${API}/auth/forgot-password`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText(/Email/i), 'me@example.com');
    await user.click(screen.getByRole('button', { name: /Send reset link/i }));
    expect(await screen.findByText(SUCCESS_COPY)).toBeInTheDocument();
  });

  test('AUTH-007 — same success copy for an unknown email (UX hides the difference)', async () => {
    server.use(
      http.post(`${API}/auth/forgot-password`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText(/Email/i), 'noone@example.com');
    await user.click(screen.getByRole('button', { name: /Send reset link/i }));
    expect(await screen.findByText(SUCCESS_COPY)).toBeInTheDocument();
  });
});
