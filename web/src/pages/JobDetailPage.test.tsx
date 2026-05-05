// TEST-JOBS-110..115 — JobDetailPage (JOBS-008..JOBS-013).
//
// Covers route render, role-aware CTA branches (the privilege-escalation
// surface), already-applied state, and AuthBanner reuse for pending
// verification. The Apply happy path + error mapping are covered by the
// Playwright suite (TEST-JOBS-200 / 207) which exercises the real Apply
// sheet against the real backend; this unit suite focuses on the CTA-bar
// state machine that drives the six branches in JOBS-011.

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProfile, screen, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { mockAccountMe, mockJobPost } from '@/test/factories';
import JobDetailPage from './JobDetailPage';

const API = 'http://localhost:8081/api';

function withRoute() {
  return (
    <Routes>
      <Route path="/jobs/:id" element={<JobDetailPage />} />
    </Routes>
  );
}

describe('TEST-JOBS-110 JobDetailPage route render (JOBS-008 / 009)', () => {
  test('JOBS-008 — /jobs/:id mounts, calls GET /job-posts/:id, renders title + employer chip', async () => {
    server.use(
      http.get(`${API}/job-posts/123`, () =>
        HttpResponse.json(
          mockJobPost({ id: '123', title: 'Need sparks for SW19' }),
        ),
      ),
    );
    renderWithProfile(withRoute(), { route: '/jobs/123', account: null });
    await waitFor(() =>
      expect(screen.getByText('Need sparks for SW19')).toBeInTheDocument(),
    );
    expect(screen.getByText(/acme build/i)).toBeInTheDocument();
  });

  test('JOBS-008 — 404 → "Job not found" empty state, no JSON dump', async () => {
    server.use(
      http.get(
        `${API}/job-posts/999`,
        () =>
          new HttpResponse(JSON.stringify({ statusCode: 404 }), {
            status: 404,
          }),
      ),
    );
    const { container } = renderWithProfile(withRoute(), {
      route: '/jobs/999',
      account: null,
    });
    await waitFor(() =>
      expect(screen.getByText(/job not found/i)).toBeInTheDocument(),
    );
    expect(container.querySelectorAll('pre').length).toBe(0);
  });
});

describe('TEST-JOBS-111 JobDetailPage role-aware CTA (JOBS-011)', () => {
  function setupPost(overrides = {}) {
    server.use(
      http.get(`${API}/job-posts/100`, () =>
        HttpResponse.json(mockJobPost({ id: '100', ...overrides })),
      ),
      http.get(`${API}/job-applications/me`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
    );
  }

  test('JOBS-011 anon — "Sign in to apply" links to /login?next=/jobs/100', async () => {
    setupPost();
    renderWithProfile(withRoute(), { route: '/jobs/100', account: null });
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /sign in to apply/i }),
      ).toBeInTheDocument(),
    );
    const link = screen.getByRole('link', { name: /sign in to apply/i });
    expect(link).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent('/jobs/100')}`,
    );
  });

  test('JOBS-011 worker active not-applied — "Apply" button is enabled', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');
    setupPost();
    renderWithProfile(withRoute(), {
      route: '/jobs/100',
      account: mockAccountMe(),
    });
    const btn = await screen.findByRole('button', { name: /^apply$/i });
    expect(btn).toBeEnabled();
  });

  test('JOBS-011 employer-other — no CTA bar', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');
    setupPost(); // post owned by employer id 900 (default)
    renderWithProfile(withRoute(), {
      route: '/jobs/100',
      account: mockAccountMe({
        clientProfile: {
          worker_profile: null,
          employer_profile: {
            id: '777', // a DIFFERENT employer
            company_name: 'Other Co',
            company_number: null,
            team_size: null,
            rating_avg: '0',
            rating_count: 0,
          },
        },
      }),
    });
    await waitFor(() =>
      expect(screen.getByText(/wire two-bed flat/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /^apply$/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /sign in to apply/i })).toBeNull();
  });

  test('JOBS-011 employer-own — "Edit" + "View applicants" links replace Apply', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');
    setupPost();
    renderWithProfile(withRoute(), {
      route: '/jobs/100',
      account: mockAccountMe({
        clientProfile: {
          worker_profile: null,
          employer_profile: {
            id: '900', // matches default mockJobPost employer id
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
        screen.getByRole('link', { name: /^edit$/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: /view applicants/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^apply$/i })).toBeNull();
  });

  test('JOBS-011 worker pending-verification — disabled Apply + AuthBanner', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');
    setupPost();
    renderWithProfile(withRoute(), {
      route: '/jobs/100',
      account: mockAccountMe({ status: 'PENDING_EMAIL_VERIFICATION' }),
    });
    const btn = await screen.findByRole('button', { name: /^apply$/i });
    expect(btn).toBeDisabled();
    // TEST-JOBS-115: reuses Auth's <AuthBanner>, not a parallel banner.
    expect(
      screen.getByText(/verify your email to apply/i),
    ).toBeInTheDocument();
  });
});

describe('TEST-JOBS-112 JobDetailPage already-applied state (JOBS-011)', () => {
  test('JOBS-011 — myApp on the post → CTA reads "Application submitted · View status"', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');
    server.use(
      http.get(`${API}/job-posts/100`, () =>
        HttpResponse.json(mockJobPost({ id: '100' })),
      ),
      http.get(`${API}/job-applications/me`, () =>
        HttpResponse.json({
          items: [
            {
              id: '5001',
              status: 'PENDING',
              job_post: { id: '100' },
            },
          ],
          total: 1,
          page: 1,
          limit: 100,
        }),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/jobs/100',
      account: mockAccountMe(),
    });
    await waitFor(() =>
      expect(
        screen.getByRole('link', {
          name: /application submitted · view status/i,
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /^apply$/i })).toBeNull();
  });

  test('JOBS-OQ-3 — withdrawn application → "Application withdrawn" disabled, no re-apply CTA', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');
    server.use(
      http.get(`${API}/job-posts/100`, () =>
        HttpResponse.json(mockJobPost({ id: '100' })),
      ),
      http.get(`${API}/job-applications/me`, () =>
        HttpResponse.json({
          items: [
            {
              id: '5001',
              status: 'WITHDRAWN',
              job_post: { id: '100' },
            },
          ],
          total: 1,
          page: 1,
          limit: 100,
        }),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/jobs/100',
      account: mockAccountMe(),
    });
    const btn = await screen.findByRole('button', {
      name: /application withdrawn/i,
    });
    expect(btn).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^apply$/i })).toBeNull();
  });
});
