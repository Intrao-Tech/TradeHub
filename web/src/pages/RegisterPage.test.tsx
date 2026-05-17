// TEST-AUTH-076 — RegisterPage.
// Source: web/src/pages/RegisterPage.tsx
// Contract: AUTH-019-001..003, AUTH-005, Decisions Log 2026-04-26 (back arrow,
// role-conditional name fields).

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  renderWithRouter,
  screen,
  userEvent,
  fireEvent,
  waitFor,
} from '@/test/render';
import { server } from '@/test/msw-server';
import RegisterPage from './RegisterPage';

const API = 'http://localhost:8081/api';

function noop() {}

describe('TEST-AUTH-076 RegisterPage', () => {
  test('Decisions Log 2026-04-26 — role chooser surfaces both roles', () => {
    renderWithRouter(<RegisterPage onRegister={noop} />);
    expect(screen.getByText(/I'm a tradesperson/i)).toBeInTheDocument();
    expect(screen.getByText(/I'm hiring/i)).toBeInTheDocument();
  });

  test('Decisions Log 2026-04-26 — picking WORKER reveals First name + Surname (not Company)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<RegisterPage onRegister={noop} />);
    await user.click(screen.getByText(/I'm a tradesperson/i));
    expect(screen.getByLabelText(/First name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Surname/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Company name/i)).not.toBeInTheDocument();
  });

  test('AUTH-019-001 — picking EMPLOYER reveals Company name (not First/Surname)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<RegisterPage onRegister={noop} />);
    await user.click(screen.getByText(/I'm hiring/i));
    expect(screen.getByLabelText(/Company name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/First name/i)).not.toBeInTheDocument();
  });

  test('AUTH-019-003 — confirm-password mismatch shows inline copy "Passwords don\'t match"', async () => {
    const user = userEvent.setup();
    renderWithRouter(<RegisterPage onRegister={noop} />);
    await user.click(screen.getByText(/I'm a tradesperson/i));
    // fireEvent.change sets the whole value in one render — char-by-char
    // userEvent.type re-renders the live-validating PasswordRules per
    // keystroke and is too slow for jsdom here.
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: 'Tr@deHub1A' },
    });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), {
      target: { value: 'Tr@deHub2X' },
    });
    expect(await screen.findByText(/Passwords don't match/i)).toBeInTheDocument();
  }, 20_000);

  test('AUTH-005 — when /auth/providers returns google: false, the Google CTA stays hidden', async () => {
    server.use(
      http.get(`${API}/auth/providers`, () => HttpResponse.json({ google: false })),
    );
    const user = userEvent.setup();
    renderWithRouter(<RegisterPage onRegister={noop} />);
    await user.click(screen.getByText(/I'm a tradesperson/i));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Continue with Google/i })).not.toBeInTheDocument();
    });
  });

  test('AUTH-019-001 — phone country picker combines +dial+digits to E.164 before submit', async () => {
    let captured: { phone?: string } | null = null;
    server.use(
      http.get(`${API}/auth/providers`, () => HttpResponse.json({ google: false })),
      http.post(`${API}/auth/register`, async ({ request }) => {
        captured = (await request.json()) as { phone?: string };
        return HttpResponse.json(
          { pending_verification: true, email: 'mike@example.com' },
          { status: 201 },
        );
      }),
    );
    renderWithRouter(<RegisterPage onRegister={noop} />);
    // All-fireEvent — userEvent is too slow under full-suite load for this
    // heaviest test (6 fields + submit), which flaked on the test timeout.
    fireEvent.click(screen.getByText(/I'm a tradesperson/i));

    // fireEvent.change per field — one render each instead of per keystroke.
    const policyCompliant = 'Tr@deHub1A!';
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'mike@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: policyCompliant },
    });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), {
      target: { value: policyCompliant },
    });
    fireEvent.change(screen.getByLabelText(/First name/i), {
      target: { value: 'Mike' },
    });
    fireEvent.change(screen.getByLabelText(/Surname/i), {
      target: { value: 'Builder' },
    });
    fireEvent.change(screen.getByLabelText(/Phone/i), {
      target: { value: '7700900123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
    await waitFor(() => {
      expect(captured).not.toBeNull();
    });
    // GB default → +44 prefix
    expect(captured!.phone).toMatch(/^\+44/);
    expect(captured!.phone).toContain('7700900123');
    // Generous timeout: the heaviest test in the file (6 fields + submit +
    // POST) — slow under full-suite parallel load, though logically correct.
  }, 40_000);
});
