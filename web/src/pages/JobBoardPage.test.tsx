// TEST-JOBS-100..104 — JobBoardPage dispatcher (JOBS-001 / 002 / 003 / 005 / 006 / 014 / 017).
//
// JobBoardPage dispatches between PublicJobBoardPage (guest) and
// AuthJobBoardPage (logged in) based on the auth token. Tests below cover both
// surfaces through the dispatcher to match real user experience.

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProfile, screen, waitFor } from '@/test/render';
import { server } from '@/test/msw-server';
import { mockAccountMe, mockJobPost } from '@/test/factories';
import JobBoardPage from './JobBoardPage';

const API = 'http://localhost:8081/api';

describe('TEST-JOBS-100 JobBoardPage zero JSON dumps (JOBS-001 / JOBS-048)', () => {
  test('JOBS-001 — no <pre>{JSON.stringify(...)}</pre> rendered on the page', async () => {
    const { container } = renderWithProfile(<JobBoardPage />, {
      route: '/jobs',
      account: null,
    });
    await waitFor(() => {
      expect(screen.getByText(/find your next trade job/i)).toBeInTheDocument();
    });

    expect(container.querySelectorAll('pre').length).toBe(0);
    // Defensive: catch a future regression where someone dumps the raw list.
    expect(screen.queryByText(/JSON\.stringify/i)).toBeNull();
  });
});

describe('TEST-JOBS-101 JobBoardPage filter inputs (JOBS-003)', () => {
  test('JOBS-003 — pre-fills inputs from URL params and submitting refetches with the new query', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');

    const urls: string[] = [];
    server.use(
      http.get(`${API}/job-posts`, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({
          items: [mockJobPost()],
          total: 1,
          page: 1,
          limit: 20,
        });
      }),
    );

    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();

    renderWithProfile(<JobBoardPage />, {
      route: '/jobs?search=plumber&postcode_area=SW19',
      account: mockAccountMe({
        clientProfile: { worker_profile: undefined as never, employer_profile: null },
      }),
    });
    await waitFor(() =>
      expect(screen.getByText(/job board/i)).toBeInTheDocument(),
    );

    // URL params hydrate both the controlled inputs and the request.
    await waitFor(() => {
      expect(urls[urls.length - 1]).toContain('search=plumber');
      expect(urls[urls.length - 1]).toContain('postcode_area=SW19');
    });
    expect(
      (screen.getByLabelText(/search title/i) as HTMLInputElement).value,
    ).toBe('plumber');

    // Submitting the form drops the search and refetches with status=OPEN
    // still applied (form-driven, not type-driven).
    await user.clear(screen.getByLabelText(/search title/i));
    await user.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() => {
      expect(urls[urls.length - 1]).not.toContain('search=plumber');
    });
  });

  test('JOBS-002 — default request includes status=OPEN', async () => {
    let lastUrl = '';
    server.use(
      http.get(`${API}/job-posts`, ({ request }) => {
        lastUrl = request.url;
        return HttpResponse.json({
          items: [],
          total: 0,
          page: 1,
          limit: 20,
        });
      }),
    );
    renderWithProfile(<JobBoardPage />, { route: '/jobs', account: null });
    await waitFor(() => {
      expect(lastUrl).toContain('status=OPEN');
    });
  });

  test('JOBS-005 — default request uses limit=20 (spec-defined page size)', async () => {
    let lastUrl = '';
    server.use(
      http.get(`${API}/job-posts`, ({ request }) => {
        lastUrl = request.url;
        return HttpResponse.json({
          items: [],
          total: 0,
          page: 1,
          limit: 20,
        });
      }),
    );
    renderWithProfile(<JobBoardPage />, { route: '/jobs', account: null });
    await waitFor(() => {
      expect(lastUrl).toContain('limit=20');
      expect(lastUrl).toContain('page=1');
    });
  });

  test('JOBS-005 — total > page size shows the prev/next paginator and Next advances ?page=', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');

    const urls: string[] = [];
    server.use(
      http.get(`${API}/job-posts`, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json({
          items: Array.from({ length: 20 }, (_, i) =>
            mockJobPost({ id: `p${i}` }),
          ),
          total: 45,
          page: Number(new URL(request.url).searchParams.get('page') ?? '1'),
          limit: 20,
        });
      }),
    );

    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    renderWithProfile(<JobBoardPage />, {
      route: '/jobs',
      account: mockAccountMe({
        clientProfile: { worker_profile: undefined as never, employer_profile: null },
      }),
    });

    const next = await screen.findByRole('button', { name: /next/i });
    expect(next).toBeEnabled();
    await user.click(next);
    await waitFor(() => {
      expect(urls[urls.length - 1]).toContain('page=2');
    });
  });

  test('JOBS-003 — specialisation_id in URL pre-selects the chip filter', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');

    let lastUrl = '';
    server.use(
      http.get(`${API}/job-posts`, ({ request }) => {
        lastUrl = request.url;
        return HttpResponse.json({
          items: [],
          total: 0,
          page: 1,
          limit: 20,
        });
      }),
    );
    renderWithProfile(<JobBoardPage />, {
      route: '/jobs?specialisation_id=2',
      account: mockAccountMe({
        clientProfile: { worker_profile: undefined as never, employer_profile: null },
      }),
    });
    await waitFor(() => {
      expect(lastUrl).toContain('specialisation_id=2');
    });
    // The selected chip renders inside the multiselect frame.
    expect(await screen.findByText(/electrical/i)).toBeInTheDocument();
  });
});

describe('TEST-JOBS-102 PublicJobBoardPage empty state (JOBS-006)', () => {
  test('JOBS-006 — guest with no jobs sees empty-state copy and hero CTAs', async () => {
    server.use(
      http.get(`${API}/job-posts`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 20 }),
      ),
    );
    renderWithProfile(<JobBoardPage />, { route: '/jobs', account: null });

    await waitFor(() =>
      expect(screen.getByText(/no jobs yet/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/check back soon/i)).toBeInTheDocument();
    // Guest hero exposes the register-to-apply and register-to-post entry points.
    expect(
      screen.getByRole('link', { name: /^apply$/i }),
    ).toHaveAttribute('href', '/register?next=/jobs');
    expect(
      screen.getByRole('link', { name: /hiring\? post a job/i }),
    ).toHaveAttribute('href', '/register?next=/my-jobs');
  });
});

describe('TEST-JOBS-104 JobBoardPage Post-a-job role gate (JOBS-014 / 017)', () => {
  test('JOBS-017 — anonymous user sees no "Post a job" CTA', async () => {
    renderWithProfile(<JobBoardPage />, { route: '/jobs', account: null });
    await waitFor(() =>
      expect(screen.getByText(/find your next trade job/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /post a job/i })).toBeNull();
  });

  test('JOBS-017 — worker (active) sees no "Post a job" CTA', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');
    renderWithProfile(<JobBoardPage />, {
      route: '/jobs',
      account: mockAccountMe({
        clientProfile: { worker_profile: undefined as never, employer_profile: null },
      }),
    });
    await waitFor(() =>
      expect(screen.getByText(/job board/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /post a job/i })).toBeNull();
  });

  test('JOBS-017 — pending-verification employer sees the verify-email banner and no CTA', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');
    renderWithProfile(<JobBoardPage />, {
      route: '/jobs',
      account: mockAccountMe({
        status: 'PENDING_EMAIL_VERIFICATION',
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
        screen.getByText(/verify your email to post jobs/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /post a job/i })).toBeNull();
  });

  test('JOBS-014 / 017 — verified employer sees the "Post a job" CTA', async () => {
    const { setTokens } = await import('@/api');
    setTokens('t', 'r');
    renderWithProfile(<JobBoardPage />, {
      route: '/jobs',
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
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /post a job/i }),
      ).toBeInTheDocument();
    });
  });
});
