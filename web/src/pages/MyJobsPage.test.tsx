// TEST-JOBS-150..153 — MyJobsPage (JOBS-026 / 028 / 029 / 031 / 032).

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProfile, screen, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { mockAccountMe, mockJobPost } from '@/test/factories';
import MyJobsPage from './MyJobsPage';

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
      <Route path="/my-jobs" element={<MyJobsPage />} />
      <Route path="/profile" element={<div>PROFILE-FALLBACK</div>} />
    </Routes>
  );
}

describe('TEST-JOBS-150 MyJobsPage role gate (JOBS-026)', () => {
  test('JOBS-026 — non-employer is redirected to /profile', async () => {
    await asEmployer();
    renderWithProfile(withRoute(), {
      route: '/my-jobs',
      account: mockAccountMe(),
    });
    await waitFor(() =>
      expect(screen.getByText('PROFILE-FALLBACK')).toBeInTheDocument(),
    );
  });
});

describe('TEST-JOBS-151 MyJobsPage status tabs + counts (JOBS-028)', () => {
  test('JOBS-028 — each tab shows the correct count from the seed', async () => {
    await asEmployer();
    server.use(
      http.get(`${API}/job-posts/me`, () =>
        HttpResponse.json({
          items: [
            mockJobPost({ id: '1', status: 'OPEN' }),
            mockJobPost({ id: '2', status: 'OPEN' }),
            mockJobPost({ id: '3', status: 'CLOSED' }),
            mockJobPost({ id: '4', status: 'FILLED' }),
          ],
          total: 4,
          page: 1,
          limit: 100,
        }),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/my-jobs',
      account: employerAccount,
    });
    await waitFor(() =>
      expect(screen.getByText(/my jobs/i)).toBeInTheDocument(),
    );
    // Tabs render as `<TabsTrigger>{label}<Badge>{count}</Badge></TabsTrigger>`
    const allTab = screen.getByRole('tab', { name: /all/i });
    expect(allTab).toHaveTextContent(/4/);
    const openTab = screen.getByRole('tab', { name: /open/i });
    expect(openTab).toHaveTextContent(/2/);
    const closedTab = screen.getByRole('tab', { name: /closed/i });
    expect(closedTab).toHaveTextContent(/1/);
    const filledTab = screen.getByRole('tab', { name: /filled/i });
    expect(filledTab).toHaveTextContent(/1/);
  });
});

describe('TEST-JOBS-153 MyJobsPage empty state (JOBS-032)', () => {
  test('JOBS-032 — no posts → empty state + "Post a job" CTA', async () => {
    await asEmployer();
    server.use(
      http.get(`${API}/job-posts/me`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/my-jobs',
      account: employerAccount,
    });
    await waitFor(() =>
      expect(
        screen.getByText(/you haven't posted any jobs yet/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getAllByRole('button', { name: /post a job/i }).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
