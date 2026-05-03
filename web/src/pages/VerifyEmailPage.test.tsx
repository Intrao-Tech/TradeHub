// TEST-AUTH-081 (part 1) — VerifyEmailPage.
// Source: web/src/pages/VerifyEmailPage.tsx
// Contract: AUTH-006 (resend with success/error states), AUTH-007 anti-
// enumeration (always show generic success copy).

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithRouter, screen, userEvent } from '@/test/render';
import { server } from '@/test/msw-server';
import VerifyEmailPage from './VerifyEmailPage';

const API = 'http://localhost:8081/api';

describe('TEST-AUTH-081 VerifyEmailPage — resend', () => {
  test('AUTH-006 — successful resend shows "Email sent" success banner', async () => {
    server.use(
      http.post(`${API}/auth/verify-email/send`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<VerifyEmailPage />, {
      route: '/verify-email?email=me%40example.com',
    });
    await user.click(
      screen.getByRole('button', { name: /Resend confirmation email/i }),
    );
    expect(await screen.findByText(/Email sent/i)).toBeInTheDocument();
  });

  test('AUTH-006 — failure surface renders an error banner (not silent)', async () => {
    server.use(
      http.post(`${API}/auth/verify-email/send`, () =>
        HttpResponse.json({ message: 'rate limited' }, { status: 429 }),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<VerifyEmailPage />, {
      route: '/verify-email?email=me%40example.com',
    });
    await user.click(
      screen.getByRole('button', { name: /Resend confirmation email/i }),
    );
    expect(
      await screen.findByText(/Could not send email/i),
    ).toBeInTheDocument();
  });
});
