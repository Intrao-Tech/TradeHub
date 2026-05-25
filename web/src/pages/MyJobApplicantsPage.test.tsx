// TEST-JOBS-160 / 161 — MyJobApplicantsPage role gate + status tabs
// (JOBS-033 / 035). The optimistic-UI flow (TEST-JOBS-163) and the
// ACCEPT → Convert flow (TEST-JOBS-202) are exercised by Playwright
// where a real backend round-trip can drive the badge flip.

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProfile, screen, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import {
  mockAccountMe,
  mockJobApplication,
  mockJobPost,
} from '@/test/factories';
import MyJobApplicantsPage from './MyJobApplicantsPage';

const API = 'http://localhost:8081/api';

const employerProfile = {
  id: '900',
  company_name: 'Acme',
  company_number: null,
  team_size: null,
  rating_avg: '0',
  rating_count: 0,
};

const employerAccount = mockAccountMe({
  clientProfile: { worker_profile: null, employer_profile: employerProfile },
});

async function asEmployer() {
  const { setTokens } = await import('@/api');
  setTokens('t', 'r');
}

function withRoute() {
  return (
    <Routes>
      <Route
        path="/my-jobs/:id/applicants"
        element={<MyJobApplicantsPage />}
      />
      <Route path="/profile" element={<div>PROFILE-FALLBACK</div>} />
    </Routes>
  );
}

describe('TEST-JOBS-160 MyJobApplicantsPage role gate (JOBS-033)', () => {
  test('JOBS-033 — non-employer is redirected to /profile', async () => {
    await asEmployer();
    renderWithProfile(withRoute(), {
      route: '/my-jobs/100/applicants',
      account: mockAccountMe(),
    });
    await waitFor(() =>
      expect(screen.getByText('PROFILE-FALLBACK')).toBeInTheDocument(),
    );
  });
});

describe('TEST-JOBS-161 MyJobApplicantsPage status tabs (JOBS-035)', () => {
  test('JOBS-035 — default tab is Pending; counts match the seed', async () => {
    await asEmployer();
    server.use(
      http.get(`${API}/job-posts/100`, () =>
        HttpResponse.json(
          mockJobPost({ id: '100', employer_id: '900', title: 'Wire flat' }),
        ),
      ),
      http.get(`${API}/job-applications/jobs/100`, () =>
        HttpResponse.json({
          items: [
            mockJobApplication({ id: '1', status: 'PENDING' }),
            mockJobApplication({ id: '2', status: 'PENDING' }),
            mockJobApplication({ id: '3', status: 'SHORTLISTED' }),
            mockJobApplication({ id: '4', status: 'REJECTED' }),
          ],
          total: 4,
          page: 1,
          limit: 200,
        }),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/my-jobs/100/applicants',
      account: employerAccount,
    });
    await waitFor(() =>
      expect(screen.getByText(/wire flat/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('tab', { name: /pending/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /pending/i })).toHaveTextContent(
      /2/,
    );
    expect(screen.getByRole('tab', { name: /shortlisted/i })).toHaveTextContent(
      /1/,
    );
    expect(screen.getByRole('tab', { name: /rejected/i })).toHaveTextContent(
      /1/,
    );
  });
});
