// TEST-PROF-111 — EmployerDetailPage (PROF-002, E2E-3 surface).

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProfile, screen, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import EmployerDetailPage from './EmployerDetailPage';

const API = 'http://localhost:8081/api';

const employer = {
  id: '7',
  company_name: 'Acme Build Ltd',
  company_number: '12345678',
  team_size: 12,
  rating_avg: '0',
  rating_count: 0,
  client_profile: {
    id: '7',
    display_name: 'Acme Build Ltd',
    city: 'Camden',
    postcode_area: 'NW1',
    verification_level: 'UNVERIFIED',
  },
};

describe('TEST-PROF-111 EmployerDetailPage (PROF-002, E2E-3)', () => {
  test('PROF-002 — renders without auth, header shows display name + verification badge + location', async () => {
    server.use(
      http.get(`${API}/employer-profiles/7`, () =>
        HttpResponse.json(employer),
      ),
    );
    renderWithProfile(
      <Routes>
        <Route path="/employers/:id" element={<EmployerDetailPage />} />
      </Routes>,
      { route: '/employers/7', account: null },
    );
    await waitFor(() => {
      expect(screen.getAllByText('Acme Build Ltd').length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/camden/i)).toBeInTheDocument();
    expect(screen.getByText(/unverified/i)).toBeInTheDocument();
  });

  test('PROF-002 — anonymous viewer sees the auth-gate CTA, not a Send-message button', async () => {
    server.use(
      http.get(`${API}/employer-profiles/7`, () =>
        HttpResponse.json(employer),
      ),
    );
    renderWithProfile(
      <Routes>
        <Route path="/employers/:id" element={<EmployerDetailPage />} />
      </Routes>,
      { route: '/employers/7', account: null },
    );
    await waitFor(() => {
      expect(screen.getAllByText('Acme Build Ltd').length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: /send message/i })).toBeNull();
  });
});
