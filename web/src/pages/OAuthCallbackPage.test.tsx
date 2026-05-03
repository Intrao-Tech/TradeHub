// TEST-AUTH-082 — OAuthCallbackPage.
// Source: web/src/pages/OAuthCallbackPage.tsx
// Contract: Decisions Log 2026-04-26 (NO_GOOGLE_ACCOUNT, intent flag),
// AUTH-014-002 (post-auth routing).

import { describe, expect, test } from 'vitest';
import { renderWithRouter, screen, waitFor } from '@/test/render';
import OAuthCallbackPage from './OAuthCallbackPage';

function noop() {}

describe('TEST-AUTH-082 OAuthCallbackPage', () => {
  test('Decisions Log 2026-04-26 — error=NO_GOOGLE_ACCOUNT renders "Create an account" CTA', async () => {
    renderWithRouter(<OAuthCallbackPage onLogin={noop} />, {
      route: '/oauth/callback?error=NO_GOOGLE_ACCOUNT&intent=login',
    });
    expect(
      await screen.findByText(/No TradeHub account yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Create a TradeHub account/i }),
    ).toBeInTheDocument();
  });

  test('Decisions Log 2026-04-26 — error=ACCOUNT_EXISTS&intent=register → "you already have an account, sign in instead"', async () => {
    renderWithRouter(<OAuthCallbackPage onLogin={noop} />, {
      route: '/oauth/callback?error=ACCOUNT_EXISTS&intent=register&email=me%40example.com',
    });
    expect(
      await screen.findByText(/already have a TradeHub account/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Sign in to your account/i }),
    ).toBeInTheDocument();
  });

  test('AUTH-014-002 — success (tokens + state) stashes tokens for postAuthRedirect', async () => {
    renderWithRouter(<OAuthCallbackPage onLogin={noop} />, {
      route:
        '/oauth/callback?access_token=a&refresh_token=r&state=ACTIVE&is_worker=true&email=me%40example.com&next=%2Fprofile',
    });
    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBe('a');
      expect(localStorage.getItem('refresh_token')).toBe('r');
    });
  });
});
