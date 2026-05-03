// TEST-AUTH-083 — SettingsSecurityPage.
// Source: web/src/pages/SettingsSecurityPage.tsx
// Contract: AUTH-008 change-password + logout-all, Decisions Log 2026-04-26
// (admin-only StaffModule UI gating — covered in TEST-AUTH-024 e2e).

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { makeErrorBody } from '@/test/factories';
import SettingsSecurityPage from './SettingsSecurityPage';

const API = 'http://localhost:8081/api';

describe('TEST-AUTH-083 SettingsSecurityPage', () => {
  test('AUTH-008 — change-password: validates required fields, submits to /auth/change-password', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/auth/change-password`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true });
      }),
    );
    const user = userEvent.setup();
    renderWithRouter(<SettingsSecurityPage />);
    await user.type(screen.getByLabelText(/Current password/i), 'Old@Password1');
    await user.type(screen.getByLabelText(/^New password$/i), 'New@Password1');
    await user.type(screen.getByLabelText(/Confirm new password/i), 'New@Password1');
    await user.click(screen.getByRole('button', { name: /Update password/i }));

    await waitFor(() => {
      expect(body).toMatchObject({
        current_password: 'Old@Password1',
        new_password: 'New@Password1',
      });
    });
    expect(await screen.findByText(/Password changed/i)).toBeInTheDocument();
  });

  test('AUTH-008 — wrong current password surfaces INVALID_CURRENT_PASSWORD copy', async () => {
    server.use(
      http.post(`${API}/auth/change-password`, () =>
        HttpResponse.json(
          makeErrorBody('INVALID_CURRENT_PASSWORD', {
            statusCode: 401,
            message: 'Current password is incorrect.',
          }),
          { status: 401 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<SettingsSecurityPage />);
    await user.type(screen.getByLabelText(/Current password/i), 'Wrong1!Aa');
    await user.type(screen.getByLabelText(/^New password$/i), 'New@Password1');
    await user.type(screen.getByLabelText(/Confirm new password/i), 'New@Password1');
    await user.click(screen.getByRole('button', { name: /Update password/i }));
    expect(
      await screen.findByText(/Wrong current password/i),
    ).toBeInTheDocument();
  });

  test('AUTH-008 — logout-all hits /auth/logout-all and clears local tokens', async () => {
    localStorage.setItem('access_token', 'a');
    localStorage.setItem('refresh_token', 'r');
    server.use(
      http.post(`${API}/auth/logout-all`, () =>
        HttpResponse.json({ revoked: 2 }),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<SettingsSecurityPage />);
    await user.click(screen.getByRole('button', { name: /Sign out everywhere/i }));
    expect(await screen.findByText(/All sessions revoked/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
    });
  });
});
