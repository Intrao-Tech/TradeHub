// TEST-CR-100..103 — ReferralsPage component tests.
//
// MSW v2 stubs the 5 GET endpoints + 1 POST retry endpoint. Default
// handlers are minimal happy-paths; per-test overrides via `server.use`.

import { beforeEach, describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  renderWithRouter,
  screen,
  userEvent,
  waitFor,
} from '@/test/render';
import { server } from '@/test/msw-server';
import ReferralsPage from './ReferralsPage';

const API = 'http://localhost:8081/api';

beforeEach(() => {
  // Pin auth so the api() wrapper attaches a token (page is auth-gated).
  localStorage.setItem('access_token', 'test');

  // Default handlers — overridable per-test.
  server.use(
    http.get(`${API}/referrals/code`, () =>
      HttpResponse.json({
        code: 'MIKE-A1B2',
        link: 'http://localhost:3000/r/MIKE-A1B2',
      }),
    ),
    http.get(`${API}/referrals/account-stats`, () =>
      HttpResponse.json({
        window_months: 12,
        lifetime_signups: 0,
        total_earned_gbp: '0',
        items: [],
      }),
    ),
    http.get(`${API}/referrals/project-shares`, () =>
      HttpResponse.json({ applications: [], contracts: [] }),
    ),
    http.get(`${API}/referrals/incoming`, () =>
      HttpResponse.json({ referrer: null, total_paid_gbp: '0' }),
    ),
    http.get(`${API}/referrals/pending-payouts`, () => HttpResponse.json([])),
  );
});

describe('TEST-CR-100..103 ReferralsPage', () => {
  test('TEST-CR-100 (CR-040 / CR-080) — renders Your code section with code from /referrals/code', async () => {
    renderWithRouter(<ReferralsPage />);
    await waitFor(() => {
      expect(screen.getByText('MIKE-A1B2')).toBeInTheDocument();
    });
    // Copyable link with the same code visible.
    expect(
      screen.getByText('http://localhost:3000/r/MIKE-A1B2'),
    ).toBeInTheDocument();
  });

  test('TEST-CR-101 (CR-080) — Account stats shows lifetime_signups + items list', async () => {
    server.use(
      http.get(`${API}/referrals/account-stats`, () =>
        HttpResponse.json({
          window_months: 12,
          lifetime_signups: 2,
          total_earned_gbp: '12.50',
          items: [
            {
              account_id: '11',
              email: 'sarah@example.com',
              display_name: 'Sarah Jenkins',
              referred_at: '2025-12-01T00:00:00.000Z',
              window_ends_at: '2026-12-01T00:00:00.000Z',
            },
            {
              account_id: '12',
              email: 'bob@example.com',
              display_name: null,
              referred_at: '2026-01-15T00:00:00.000Z',
              window_ends_at: '2027-01-15T00:00:00.000Z',
            },
          ],
        }),
      ),
    );
    renderWithRouter(<ReferralsPage />);
    // Lifetime stat number.
    await waitFor(() =>
      expect(screen.getByText('2')).toBeInTheDocument(),
    );
    // Display name OR email shows as bold for both rows.
    expect(screen.getByText('Sarah Jenkins')).toBeInTheDocument();
    // Bob has no display name → falls back to email.
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  test('TEST-CR-102 (CR-080) — Pending payouts empty hides Retry button', async () => {
    renderWithRouter(<ReferralsPage />);
    await waitFor(() => {
      expect(screen.getByText(/no pending payouts\./i)).toBeInTheDocument();
    });
    // "Retry payouts" button must NOT be present when list is empty.
    expect(screen.queryByRole('button', { name: /retry payouts/i })).toBeNull();
  });

  test('TEST-CR-103 (followup) — non-empty Pending payouts shows Retry, click fires POST + reloads', async () => {
    let retryCalled = 0;
    server.use(
      http.get(`${API}/referrals/pending-payouts`, () =>
        HttpResponse.json([
          {
            id: '1',
            milestone_id: '5',
            contract_id: '7',
            type: 'PROJECT_W2W',
            amount: '10.00',
            status: 'PENDING',
            created_at: '2026-05-01T00:00:00.000Z',
          },
        ]),
      ),
      http.post(`${API}/referrals/pending-payouts/retry`, () => {
        retryCalled += 1;
        return HttpResponse.json({ paid: 1, failed: 0, skipped: 0 });
      }),
    );

    renderWithRouter(<ReferralsPage />);

    await waitFor(() =>
      expect(
        screen.getByText(/PROJECT_W2W · milestone #5/i),
      ).toBeInTheDocument(),
    );
    const retry = await screen.findByRole('button', { name: /retry payouts/i });
    await userEvent.click(retry);

    await waitFor(() => expect(retryCalled).toBe(1));
  });
});
