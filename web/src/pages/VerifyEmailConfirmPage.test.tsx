// TEST-AUTH-081 (part 2) — VerifyEmailConfirmPage.
// Source: web/src/pages/VerifyEmailConfirmPage.tsx
// Contract: Decisions Log 2026-04-26 (StrictMode useRef guard) +
// AUTH-006 expired-token recovery path.

import { describe, expect, test } from 'vitest';
import { StrictMode } from 'react';
import { http, HttpResponse } from 'msw';
import { renderWithRouter, screen, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { makeErrorBody, makeLoginResponse } from '@/test/factories';
import VerifyEmailConfirmPage from './VerifyEmailConfirmPage';

const API = 'http://localhost:8081/api';

function noop() {}

describe('TEST-AUTH-081 VerifyEmailConfirmPage', () => {
  test('Decisions Log 2026-04-26 — useRef guard prevents StrictMode double-mount from consuming the token twice', async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/auth/verify-email/confirm`, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(makeLoginResponse({ withTokens: true }));
        }
        return HttpResponse.json(
          makeErrorBody('TOKEN_INVALID', {
            statusCode: 400,
            message: 'Already used.',
          }),
          { status: 400 },
        );
      }),
    );
    renderWithRouter(
      <StrictMode>
        <VerifyEmailConfirmPage onLogin={noop} />
      </StrictMode>,
      { route: '/verify-email/confirm?token=abc123abc123abc123' },
    );
    // Wait for the success banner to appear before asserting call count —
    // StrictMode mounts effects twice in dev; the useRef guard must keep it
    // to ONE network call.
    expect(await screen.findByText(/Email verified/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(calls).toBe(1);
    });
  });

  test('AUTH-006 — expired/used token surfaces "Verification failed" + "Send a new link" CTA', async () => {
    server.use(
      http.post(`${API}/auth/verify-email/confirm`, () =>
        HttpResponse.json(
          makeErrorBody('TOKEN_INVALID', {
            statusCode: 400,
            message: 'This link is invalid or has expired.',
          }),
          { status: 400 },
        ),
      ),
    );
    renderWithRouter(<VerifyEmailConfirmPage onLogin={noop} />, {
      route: '/verify-email/confirm?token=abc123abc123abc123',
    });
    expect(await screen.findByText(/Verification failed/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Send a new link/i })).toBeInTheDocument();
  });
});
