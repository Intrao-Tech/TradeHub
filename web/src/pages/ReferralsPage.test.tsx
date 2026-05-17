// TEST-CR-100..103 — ReferralsPage component tests.
//
// Post-payment-ledger: referral commissions are `payment` ledger rows
// surfaced by GET /referrals/payments (any status). There is no manual
// retry — PENDING commissions are swept automatically once the referrer
// finishes Stripe Connect onboarding, so the page has no Retry button.

import { beforeEach, describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithRouter, screen, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { setTokens } from '@/api';
import ReferralsPage from './ReferralsPage';

const API = 'http://localhost:8081/api';

beforeEach(() => {
  // Pin auth so the api() wrapper attaches a token (page is auth-gated).
  setTokens('test', 'test');

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
    http.get(`${API}/referrals/payments`, () => HttpResponse.json([])),
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
          lifetime_signups: 2,
          total_earned_gbp: '12.50',
          items: [
            {
              account_id: '11',
              email: 'sarah@example.com',
              display_name: 'Sarah Jenkins',
              referred_at: '2025-12-01T00:00:00.000Z',
            },
            {
              account_id: '12',
              email: 'bob@example.com',
              display_name: null,
              referred_at: '2026-01-15T00:00:00.000Z',
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

  test('TEST-CR-102 (CR-080) — empty commission payments renders empty copy; no Retry button', async () => {
    renderWithRouter(<ReferralsPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/no commission payments yet\./i),
      ).toBeInTheDocument();
    });
    // The manual retry sweep was removed — no Retry button anywhere.
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  test('TEST-CR-103 (CR-080) — commission payment rows render type · milestone + status badge', async () => {
    server.use(
      http.get(`${API}/referrals/payments`, () =>
        HttpResponse.json([
          {
            id: '1',
            milestone_id: '5',
            type: 'REFERRAL_W2W',
            amount: '10.00',
            currency: 'GBP',
            status: 'PAID',
            failure_reason: null,
            created_at: '2026-05-01T00:00:00.000Z',
            settled_at: '2026-05-02T00:00:00.000Z',
          },
        ]),
      ),
    );

    renderWithRouter(<ReferralsPage />);

    await waitFor(() =>
      expect(
        screen.getByText(/REFERRAL_W2W · milestone #5/i),
      ).toBeInTheDocument(),
    );
    // Status surfaces as a badge.
    expect(screen.getByText('PAID')).toBeInTheDocument();
  });
});
