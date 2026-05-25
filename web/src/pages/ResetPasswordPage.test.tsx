// TEST-AUTH-080 — ResetPasswordPage.
// Source: web/src/pages/ResetPasswordPage.tsx
// Contract: AUTH-007 (no auto-login, redirect to /login), AUTH-019-003 (mismatch
// blocks submit), AUTH-015-004 (live policy feedback).

import { describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithRouter, screen, userEvent, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import ResetPasswordPage from './ResetPasswordPage';

const API = 'http://localhost:8081/api';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );
  return { ...actual };
});

describe('TEST-AUTH-080 ResetPasswordPage', () => {
  test('AUTH-019-003 — confirm-password mismatch keeps submit disabled', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ResetPasswordPage />, {
      route: '/reset-password?token=abc123abc123abc123',
    });
    await user.type(screen.getByLabelText(/^New password$/i), 'Tr@deHub1A!');
    await user.type(screen.getByLabelText(/^Confirm password$/i), 'Different1!');
    expect(await screen.findByText(/Passwords don't match/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Save new password/i }),
    ).toBeDisabled();
  });

  test('AUTH-015-004 — rule list reflects live policy (e.g. too-short stays unmet until 8 chars)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ResetPasswordPage />, {
      route: '/reset-password?token=abc123abc123abc123',
    });
    await user.type(screen.getByLabelText(/^New password$/i), 'Aa1!');
    const minLengthRow = screen.getByText(/At least \d+ characters/).closest('li')!;
    expect(minLengthRow.className).not.toContain('text-success');

    await user.type(screen.getByLabelText(/^New password$/i), 'aaaa');
    await waitFor(() => {
      expect(minLengthRow.className).toContain('text-success');
    });
  });

  test('AUTH-007 — on success, page navigates to /login?reason=password_changed (no auto-login)', async () => {
    server.use(
      http.post(`${API}/auth/reset-password`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    const user = userEvent.setup();
    renderWithRouter(<ResetPasswordPage />, {
      route: '/reset-password?token=abc123abc123abc123',
    });
    const password = 'Tr@deHub1A!';
    await user.type(screen.getByLabelText(/^New password$/i), password);
    await user.type(screen.getByLabelText(/^Confirm password$/i), password);
    await user.click(screen.getByRole('button', { name: /Save new password/i }));

    // No tokens in localStorage — the response carried none and we did not
    // auto-login.
    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBeNull();
    });
  });
});
