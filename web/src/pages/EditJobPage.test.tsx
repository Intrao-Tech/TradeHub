// TEST-JOBS-130 / 131 — EditJobPage (JOBS-019 / JOBS-020).
//
// Covers the ownership gate (JOBS-020) — non-owner is redirected to
// /jobs/:id, non-employer to /profile — and the soft-freeze policy
// (JOBS-019): when applications_count > 0, structural pay/location/
// specialisation inputs are disabled while title / description / urgency
// stay editable.

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProfile, screen, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { mockAccountMe, mockJobPost } from '@/test/factories';
import EditJobPage from './EditJobPage';

const API = 'http://localhost:8081/api';

function withRoute() {
  return (
    <Routes>
      <Route path="/my-jobs/:id/edit" element={<EditJobPage />} />
      <Route path="/jobs/:id" element={<div>JOB-DETAIL-FALLBACK</div>} />
      <Route path="/profile" element={<div>PROFILE-FALLBACK</div>} />
    </Routes>
  );
}

const employerProfile = {
  id: '900',
  company_name: 'Acme',
  company_number: null,
  team_size: null,
  rating_avg: '0',
  rating_count: 0,
};

async function setupAsEmployer() {
  const { setTokens } = await import('@/api');
  setTokens('t', 'r');
  return mockAccountMe({
    clientProfile: { worker_profile: null, employer_profile: employerProfile },
  });
}

describe('TEST-JOBS-130 EditJobPage ownership gate (JOBS-020)', () => {
  test('JOBS-020 — non-employer is redirected to /profile', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');
    server.use(
      http.get(`${API}/job-posts/100`, () =>
        HttpResponse.json(mockJobPost({ id: '100', employer_id: '900' })),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/my-jobs/100/edit',
      account: mockAccountMe(),
    });
    await waitFor(() =>
      expect(screen.getByText('PROFILE-FALLBACK')).toBeInTheDocument(),
    );
  });

  test('JOBS-020 — non-owner employer is redirected to /jobs/:id', async () => {
    const account = await setupAsEmployer();
    server.use(
      http.get(`${API}/job-posts/100`, () =>
        HttpResponse.json(
          mockJobPost({ id: '100', employer_id: '777' }), // owned by someone else
        ),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/my-jobs/100/edit',
      account,
    });
    await waitFor(() =>
      expect(screen.getByText('JOB-DETAIL-FALLBACK')).toBeInTheDocument(),
    );
  });

  test('JOBS-018 — owner sees the Edit form pre-filled with the post title', async () => {
    const account = await setupAsEmployer();
    server.use(
      http.get(`${API}/job-posts/100`, () =>
        HttpResponse.json(
          mockJobPost({
            id: '100',
            employer_id: '900',
            title: 'Wire two-bed flat',
          }),
        ),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/my-jobs/100/edit',
      account,
    });
    await waitFor(() =>
      expect(screen.getByText(/edit job/i)).toBeInTheDocument(),
    );
    const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
    expect(titleInput.value).toBe('Wire two-bed flat');
  });
});

describe('TEST-JOBS-131 EditJobPage soft-freeze (JOBS-019)', () => {
  async function renderForApps(applicationsCount: number) {
    const account = await setupAsEmployer();
    server.use(
      http.get(`${API}/job-posts/100`, () =>
        HttpResponse.json({
          ...mockJobPost({
            id: '100',
            employer_id: '900',
            title: 'Wire two-bed flat',
          }),
          _count: { applications: applicationsCount },
        }),
      ),
    );
    return renderWithProfile(withRoute(), {
      route: '/my-jobs/100/edit',
      account,
    });
  }

  test('JOBS-019 — applications_count = 0 → structural inputs are NOT disabled', async () => {
    await renderForApps(0);
    await waitFor(() =>
      expect(screen.getByText(/edit job/i)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/title/i)).toBeEnabled();
    // postcode is editable on a freshly-applied-for job.
    expect(screen.getByLabelText(/postcode area/i)).toBeEnabled();
    // No locked banner.
    expect(
      screen.queryByText(/applications are locked|are locked/i),
    ).toBeNull();
  });

  test('JOBS-019 — applications_count >= 1 → pay, postcode, specialisations are disabled; title editable', async () => {
    await renderForApps(2);
    await waitFor(() =>
      expect(screen.getByText(/edit job/i)).toBeInTheDocument(),
    );
    // Frozen banner shown.
    expect(
      screen.getByText(
        /this job has 2 applications.*pay, location, and specialisations are locked/i,
      ),
    ).toBeInTheDocument();
    // Frozen fields are disabled.
    expect(screen.getByLabelText(/pay type/i)).toBeDisabled();
    expect(screen.getByLabelText(/postcode area/i)).toBeDisabled();
    // Editable: title + urgency + description
    expect(screen.getByLabelText(/title/i)).toBeEnabled();
    expect(screen.getByLabelText(/description/i)).toBeEnabled();
  });
});
