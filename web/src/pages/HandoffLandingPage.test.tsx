// TEST-HANDOFF-040..043 — HandoffLandingPage component tests.
//
// The landing page is the recipient's view of a job handoff. It must work
// logged-out (prompt to sign in) and, for an eligible logged-in worker,
// surface a "Take this job" action. Terminal states show a closed message.

import { afterEach, describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter, screen, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { clearTokens, setTokens } from '@/api';
import HandoffLandingPage from './HandoffLandingPage';

const API = 'http://localhost:8081/api';
const TOKEN = 'tok-123';

function baseHandoff(over: Record<string, unknown> = {}) {
  return {
    id: '1',
    token: TOKEN,
    link: `http://localhost:3000/handoff/${TOKEN}`,
    status: 'PENDING',
    message: null,
    earn_commission: true,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: new Date().toISOString(),
    job_post: {
      id: '50',
      title: 'Rewire a flat',
      postcode_area: 'E1',
      pay_type: 'DAY_RATE',
      day_rate_min: null,
      day_rate_max: null,
      fixed_price: null,
      status: 'OPEN',
      employer_name: 'ACME Build',
    },
    from_worker: { id: '10', display_name: 'Mike' },
    to_worker: null,
    claimed_by_id: null,
    viewer: {
      is_worker: false,
      is_hander: false,
      can_claim: false,
      target_mismatch: false,
    },
    ...over,
  };
}

function renderAt() {
  return renderWithRouter(
    <Routes>
      <Route path="/handoff/:token" element={<HandoffLandingPage />} />
    </Routes>,
    { route: `/handoff/${TOKEN}` },
  );
}

afterEach(() => clearTokens());

describe('TEST-HANDOFF-040..043 HandoffLandingPage', () => {
  test('TEST-HANDOFF-040 — shows the hander, job + employer', async () => {
    server.use(
      http.get(`${API}/handoffs/by-token/${TOKEN}`, () =>
        HttpResponse.json(baseHandoff()),
      ),
    );
    renderAt();
    await waitFor(() =>
      expect(screen.getByText('Rewire a flat')).toBeInTheDocument(),
    );
    expect(screen.getByText('Mike')).toBeInTheDocument();
    expect(screen.getByText('ACME Build')).toBeInTheDocument();
  });

  test('TEST-HANDOFF-041 — logged out → prompts to log in / sign up, no take button', async () => {
    server.use(
      http.get(`${API}/handoffs/by-token/${TOKEN}`, () =>
        HttpResponse.json(baseHandoff()),
      ),
    );
    renderAt();
    await waitFor(() =>
      expect(screen.getByText('Log in')).toBeInTheDocument(),
    );
    expect(screen.getByText('Sign up')).toBeInTheDocument();
    expect(screen.queryByText('Take this job')).not.toBeInTheDocument();
  });

  test('TEST-HANDOFF-042 — eligible worker → shows "Take this job"', async () => {
    setTokens('test', 'test');
    server.use(
      http.get(`${API}/handoffs/by-token/${TOKEN}`, () =>
        HttpResponse.json(
          baseHandoff({
            viewer: {
              is_worker: true,
              is_hander: false,
              can_claim: true,
              target_mismatch: false,
            },
          }),
        ),
      ),
    );
    renderAt();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /take this job/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /pass/i })).toBeInTheDocument();
  });

  test('TEST-HANDOFF-043 — a consumed handoff shows a terminal message', async () => {
    setTokens('test', 'test');
    server.use(
      http.get(`${API}/handoffs/by-token/${TOKEN}`, () =>
        HttpResponse.json(baseHandoff({ status: 'APPLIED' })),
      ),
    );
    renderAt();
    await waitFor(() =>
      expect(
        screen.getByText(/already been taken/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('Take this job')).not.toBeInTheDocument();
  });
});
