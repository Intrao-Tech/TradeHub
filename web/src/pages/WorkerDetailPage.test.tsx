// TEST-PROF-110 — WorkerDetailPage (PROF-001, PROF-006, PROF-007, PROF-008).

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProfile, screen, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import WorkerDetailPage from './WorkerDetailPage';

const API = 'http://localhost:8081/api';

function workerFixture() {
  return {
    id: '42',
    years_experience: 7,
    day_rate_min: '200.00',
    day_rate_max: '350.00',
    is_available: true,
    rating_avg: '4.6',
    rating_count: 12,
    languages: ['en'],
    client_profile: {
      id: '42',
      display_name: 'Mike Builder',
      bio: 'Carpenter with 7 years experience.',
      city: 'Camden',
      postcode_area: 'NW1',
      avatar_url: null,
      verification_level: 'BASIC',
    },
    portfolio_items: [
      { id: '1', item_type: 'CERTIFICATION', title: 'CSCS', verified: true },
      { id: '2', item_type: 'PROJECT', title: 'Loft conversion', verified: false },
    ],
    worker_specialisations: [
      { specialisation: { id: 1, name: 'Carpentry' } },
    ],
  };
}

describe('TEST-PROF-110 WorkerDetailPage (PROF-001, PROF-006, PROF-007, PROF-008)', () => {
  test('PROF-001 / PROF-007 — renders header (avatar fallback, name, location, badge, rating) without auth', async () => {
    server.use(
      http.get(`${API}/worker-profiles/42`, () =>
        HttpResponse.json(workerFixture()),
      ),
    );
    renderWithProfile(
      <Routes>
        <Route path="/workers/:id" element={<WorkerDetailPage />} />
      </Routes>,
      { route: '/workers/42', account: null },
    );
    await waitFor(() => {
      expect(screen.getByText('Mike Builder')).toBeInTheDocument();
    });
    expect(screen.getByText(/camden/i)).toBeInTheDocument();
    expect(screen.getByText(/id verified/i)).toBeInTheDocument();
  });

  test('PROF-008 — tabs render: About / Portfolio / Certifications / Reviews placeholder', async () => {
    server.use(
      http.get(`${API}/worker-profiles/42`, () =>
        HttpResponse.json(workerFixture()),
      ),
    );
    renderWithProfile(
      <Routes>
        <Route path="/workers/:id" element={<WorkerDetailPage />} />
      </Routes>,
      { route: '/workers/42', account: null },
    );
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /about/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: /portfolio/i })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /certifications/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /reviews/i })).toBeInTheDocument();
  });

  test('PROF-006 — anonymous viewer sees the auth-gated CTA, not a Send-message button', async () => {
    server.use(
      http.get(`${API}/worker-profiles/42`, () =>
        HttpResponse.json(workerFixture()),
      ),
    );
    renderWithProfile(
      <Routes>
        <Route path="/workers/:id" element={<WorkerDetailPage />} />
      </Routes>,
      { route: '/workers/42', account: null },
    );
    await waitFor(() => {
      expect(screen.getByText('Mike Builder')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /send message/i })).toBeNull();
    // Auth-gate CTA in place.
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  });
});
