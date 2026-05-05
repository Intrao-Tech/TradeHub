// TEST-JOBS-170..175 — MyApplicationsPage (JOBS-041 / 042 / 043 / 044 / 045 / 046).

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProfile, screen, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { mockAccountMe, mockJobApplication, mockJobPost } from '@/test/factories';
import MyApplicationsPage from './MyApplicationsPage';

const API = 'http://localhost:8081/api';

function withRoute() {
  return (
    <Routes>
      <Route path="/my-applications" element={<MyApplicationsPage />} />
    </Routes>
  );
}

async function asWorker() {
  const { setTokens } = await import('@/api');
  setTokens('t', 'r');
  return mockAccountMe();
}

describe('TEST-JOBS-170 MyApplicationsPage zero JSON dumps (JOBS-048)', () => {
  test('JOBS-048 — no <pre>{JSON.stringify(...)}</pre> block on the page', async () => {
    const account = await asWorker();
    server.use(
      http.get(`${API}/job-applications/me`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 200 }),
      ),
    );
    const { container } = renderWithProfile(withRoute(), {
      route: '/my-applications',
      account,
    });
    await waitFor(() =>
      expect(screen.getByText(/my applications/i)).toBeInTheDocument(),
    );
    expect(container.querySelectorAll('pre').length).toBe(0);
  });
});

describe('TEST-JOBS-171 MyApplicationsPage role gate (JOBS-041)', () => {
  test('JOBS-041 — non-worker sees a worker-only empty state, not the worker dashboard', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');
    renderWithProfile(withRoute(), {
      route: '/my-applications',
      account: mockAccountMe({
        clientProfile: {
          worker_profile: null,
          employer_profile: {
            id: '900',
            company_name: 'Acme',
            company_number: null,
            team_size: null,
            rating_avg: '0',
            rating_count: 0,
          },
        },
      }),
    });
    await waitFor(() =>
      expect(
        screen.getByText(/only worker accounts can apply to jobs/i),
      ).toBeInTheDocument(),
    );
  });
});

describe('TEST-JOBS-172 MyApplicationsPage status tabs (JOBS-042)', () => {
  test('JOBS-042 — tab counts match the seed; default tab is All', async () => {
    const account = await asWorker();
    const post = mockJobPost();
    server.use(
      http.get(`${API}/job-applications/me`, () =>
        HttpResponse.json({
          items: [
            mockJobApplication({ id: '1', status: 'PENDING', job_post: post }),
            mockJobApplication({ id: '2', status: 'PENDING', job_post: post }),
            mockJobApplication({ id: '3', status: 'ACCEPTED', job_post: post }),
            mockJobApplication({
              id: '4',
              status: 'WITHDRAWN',
              job_post: post,
            }),
          ],
          total: 4,
          page: 1,
          limit: 200,
        }),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/my-applications',
      account,
    });
    // Counts derive from the /job-applications/me fetch, which only fires
    // once useAccountMe settles — wait on the data-dependent assertion, not
    // just the always-rendered heading.
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /pending/i })).toHaveTextContent(
        /2/,
      ),
    );
    expect(screen.getByRole('tab', { name: /all/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /accepted/i })).toHaveTextContent(
      /1/,
    );
    expect(screen.getByRole('tab', { name: /withdrawn/i })).toHaveTextContent(
      /1/,
    );
  });
});

describe('TEST-JOBS-173 MyApplicationsPage withdraw eligibility (JOBS-043 / JOBS-044)', () => {
  test('JOBS-044 — Withdraw button only appears for PENDING / REVIEWED / SHORTLISTED rows', async () => {
    const account = await asWorker();
    server.use(
      http.get(`${API}/job-applications/me`, () =>
        HttpResponse.json({
          items: [
            mockJobApplication({ id: '1', status: 'PENDING' }),
            mockJobApplication({ id: '2', status: 'WITHDRAWN' }),
            mockJobApplication({ id: '3', status: 'ACCEPTED' }),
          ],
          total: 3,
          page: 1,
          limit: 200,
        }),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/my-applications',
      account,
    });
    await waitFor(() =>
      expect(screen.getByText(/my applications/i)).toBeInTheDocument(),
    );
    const withdrawButtons = screen.getAllByRole('button', {
      name: /withdraw/i,
    });
    // Exactly one Withdraw button — only the PENDING row qualifies.
    expect(withdrawButtons.length).toBe(1);
  });
});

describe('TEST-JOBS-174 MyApplicationsPage invitations section (JOBS-046)', () => {
  test('JOBS-046 — initiated_by=EMPLOYER rows render in a separate "Invitations" section', async () => {
    const account = await asWorker();
    server.use(
      http.get(`${API}/job-applications/me`, () =>
        HttpResponse.json({
          items: [
            mockJobApplication({
              id: '1',
              status: 'PENDING',
              initiated_by: 'EMPLOYER',
            }),
            mockJobApplication({
              id: '2',
              status: 'PENDING',
              initiated_by: 'WORKER',
            }),
          ],
          total: 2,
          page: 1,
          limit: 200,
        }),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/my-applications',
      account,
    });
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /invitations/i }),
      ).toBeInTheDocument(),
    );
  });
});

describe('TEST-JOBS-175 MyApplicationsPage empty state (JOBS-045)', () => {
  test('JOBS-045 — no applications → empty state + "Browse jobs" CTA', async () => {
    const account = await asWorker();
    server.use(
      http.get(`${API}/job-applications/me`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 200 }),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/my-applications',
      account,
    });
    await waitFor(() =>
      expect(screen.getByText(/no applications yet/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: /browse jobs/i }),
    ).toBeInTheDocument();
  });
});
