// TEST-REVIEW-150..156 — <ReviewDetailPage> (REVIEW-030..033).

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import {
  renderWithProfile,
  screen,
  waitFor,
  within,
} from '@/test/render';
import { server } from '@/test/msw-server';
import {
  mockAccountMe,
  mockClientProfile,
  mockReview,
  mockReviewDraft,
} from '@/test/factories';
import { reviewsErrorBody } from '@/test/handlers/reviews';
import ReviewDetailPage from './ReviewDetailPage';

const API = 'http://localhost:8081/api';

function withRoute() {
  return (
    <Routes>
      <Route path="/reviews/:id" element={<ReviewDetailPage />} />
      <Route path="/admin" element={<div>ADMIN-FALLBACK</div>} />
      <Route path="/" element={<div>HOME-FALLBACK</div>} />
      <Route path="/workers/:id" element={<div>WORKER-FALLBACK</div>} />
      <Route path="/employers/:id" element={<div>EMPLOYER-FALLBACK</div>} />
      <Route
        path="/collaborations/:id"
        element={<div>COLLAB-FALLBACK</div>}
      />
    </Routes>
  );
}

function setReferrer(url: string) {
  Object.defineProperty(document, 'referrer', {
    value: url,
    configurable: true,
  });
}

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-150 — REVIEW-031 published, anonymous viewer
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-150 — REVIEW-031 published review (anonymous)', () => {
  test('TEST-REVIEW-150 / REVIEW-031 — 200 published renders page with counterparty chip; no draft banner', async () => {
    setReferrer('');
    server.use(
      http.get(`${API}/reviews/:id`, ({ params }) =>
        HttpResponse.json(
          mockReview({
            id: String(params.id),
            reviewer_role: 'EMPLOYER',
            collaboration: {
              id: '7000',
              worker_id: '300',
              employer_id: '400',
              project_type: 'Kitchen refit',
              started_at: null,
              ended_at: null,
            },
          }),
        ),
      ),
      http.get(`${API}/worker-profiles/:id`, () =>
        HttpResponse.json({
          id: '300',
          client_profile: { id: '300', display_name: 'Mike B.' },
        }),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/reviews/500',
      account: null,
    });
    await waitFor(() => expect(screen.getByText(/Mike B\./i)).toBeInTheDocument());
    expect(screen.queryByText(/not public yet/i)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-151 — REVIEW-032 draft, author viewer (sticky banner)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-151 — REVIEW-032 draft (author viewer)', () => {
  test('TEST-REVIEW-151 / REVIEW-032 — draft banner shown + collab-link visible to the author', async () => {
    setReferrer('');
    const collab = {
      id: '7000',
      worker_id: '300',
      employer_id: '400',
      project_type: null,
      started_at: null,
      ended_at: null,
    };
    server.use(
      http.get(`${API}/reviews/:id`, ({ params }) =>
        HttpResponse.json(
          mockReviewDraft({
            id: String(params.id),
            reviewer_role: 'EMPLOYER',
            collaboration: collab,
          }),
        ),
      ),
      http.get(`${API}/worker-profiles/:id`, () =>
        HttpResponse.json({
          id: '300',
          client_profile: { id: '300', display_name: 'Mike B.' },
        }),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/reviews/500',
      account: mockAccountMe({
        clientProfile: mockClientProfile({ id: '400' }),
      }),
    });
    await waitFor(() =>
      expect(screen.getByText(/not public yet/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: /View collaboration #7000/i }),
    ).toHaveAttribute('href', '/collaborations/7000');
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-152 — REVIEW-032 draft, staff viewer
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-152 — REVIEW-032 draft (staff viewer)', () => {
  test('TEST-REVIEW-152 / REVIEW-032 — staff sees the draft banner + the collab link', async () => {
    setReferrer('');
    server.use(
      http.get(`${API}/reviews/:id`, ({ params }) =>
        HttpResponse.json(
          mockReviewDraft({
            id: String(params.id),
            reviewer_role: 'EMPLOYER',
          }),
        ),
      ),
      http.get(`${API}/worker-profiles/:id`, () =>
        HttpResponse.json({
          id: '300',
          client_profile: { id: '300', display_name: 'Mike B.' },
        }),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/reviews/500',
      account: mockAccountMe({
        clientProfile: null,
        staff_member: { id: '99', staff_role: 'ADMIN' },
      }),
    });
    await waitFor(() =>
      expect(screen.getByText(/not public yet/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('link', { name: /View collaboration/i }),
    ).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-153 — REVIEW-032 403 for stranger on a draft
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-153 — REVIEW-032 forbidden draft', () => {
  test('TEST-REVIEW-153 / REVIEW-032 — 403 → "Review not available" empty state', async () => {
    setReferrer('');
    server.use(
      http.get(`${API}/reviews/:id`, () =>
        reviewsErrorBody('FORBIDDEN', 403, 'This review is not published'),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/reviews/500',
      account: null,
    });
    await waitFor(() =>
      expect(screen.getByText(/Review not available/i)).toBeInTheDocument(),
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-154 — REVIEW-032 404
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-154 — REVIEW-032 missing review', () => {
  test('TEST-REVIEW-154 / REVIEW-032 — 404 → "Review not found" empty state', async () => {
    setReferrer('');
    server.use(
      http.get(`${API}/reviews/:id`, () =>
        reviewsErrorBody('NOT_FOUND', 404, 'Review not found'),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/reviews/500',
      account: null,
    });
    await waitFor(() =>
      expect(screen.getByText(/Review not found/i)).toBeInTheDocument(),
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-155 — REVIEW-030 counterparty chip parallel fetch
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-155 — REVIEW-030 counterparty chip', () => {
  test('TEST-REVIEW-155 / REVIEW-030 — EMPLOYER reviewer → /worker-profiles/:id is fetched', async () => {
    setReferrer('');
    let workerProfileCalled = false;
    server.use(
      http.get(`${API}/reviews/:id`, ({ params }) =>
        HttpResponse.json(
          mockReview({
            id: String(params.id),
            reviewer_role: 'EMPLOYER',
            collaboration: {
              id: '7000',
              worker_id: '300',
              employer_id: '400',
              project_type: null,
              started_at: null,
              ended_at: null,
            },
          }),
        ),
      ),
      http.get(`${API}/worker-profiles/:id`, ({ params }) => {
        workerProfileCalled = true;
        return HttpResponse.json({
          id: String(params.id),
          client_profile: { id: '300', display_name: 'Mike B.' },
        });
      }),
    );
    renderWithProfile(withRoute(), {
      route: '/reviews/500',
      account: null,
    });
    await waitFor(() => expect(workerProfileCalled).toBe(true));
  });

  test('TEST-REVIEW-155 / REVIEW-030 — WORKER reviewer → /employer-profiles/:id is fetched', async () => {
    setReferrer('');
    let employerProfileCalled = false;
    server.use(
      http.get(`${API}/reviews/:id`, ({ params }) =>
        HttpResponse.json(
          mockReview({
            id: String(params.id),
            reviewer_role: 'WORKER',
            collaboration: {
              id: '7000',
              worker_id: '300',
              employer_id: '400',
              project_type: null,
              started_at: null,
              ended_at: null,
            },
          }),
        ),
      ),
      http.get(`${API}/employer-profiles/:id`, ({ params }) => {
        employerProfileCalled = true;
        return HttpResponse.json({
          id: String(params.id),
          client_profile: { id: '400', display_name: 'Acme' },
        });
      }),
    );
    renderWithProfile(withRoute(), {
      route: '/reviews/500',
      account: null,
    });
    await waitFor(() => expect(employerProfileCalled).toBe(true));
  });

  test('TEST-REVIEW-155 / REVIEW-030 — counterparty 404 → fallback to "Worker #<id>" with initials', async () => {
    setReferrer('');
    server.use(
      http.get(`${API}/reviews/:id`, ({ params }) =>
        HttpResponse.json(
          mockReview({
            id: String(params.id),
            reviewer_role: 'EMPLOYER',
            collaboration: {
              id: '7000',
              worker_id: '300',
              employer_id: '400',
              project_type: null,
              started_at: null,
              ended_at: null,
            },
          }),
        ),
      ),
      http.get(`${API}/worker-profiles/:id`, () =>
        reviewsErrorBody('NOT_FOUND', 404, 'Worker not found'),
      ),
    );
    renderWithProfile(withRoute(), {
      route: '/reviews/500',
      account: null,
    });
    await waitFor(() =>
      expect(screen.getByText(/Worker #300/)).toBeInTheDocument(),
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-156 — REVIEW-033 back-link priority
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-156 — REVIEW-033 back-link priority', () => {
  function setupReview(role: 'EMPLOYER' | 'WORKER' = 'EMPLOYER') {
    server.use(
      http.get(`${API}/reviews/:id`, ({ params }) =>
        HttpResponse.json(
          mockReview({
            id: String(params.id),
            reviewer_role: role,
            collaboration: {
              id: '7000',
              worker_id: '300',
              employer_id: '400',
              project_type: null,
              started_at: null,
              ended_at: null,
            },
          }),
        ),
      ),
      http.get(`${API}/worker-profiles/:id`, ({ params }) =>
        HttpResponse.json({
          id: String(params.id),
          client_profile: { id: '300', display_name: 'Mike B.' },
        }),
      ),
      http.get(`${API}/employer-profiles/:id`, ({ params }) =>
        HttpResponse.json({
          id: String(params.id),
          client_profile: { id: '400', display_name: 'Acme' },
        }),
      ),
    );
  }

  test('TEST-REVIEW-156 / REVIEW-033 — admin referrer + staff viewer → "Back to publish queue" → /admin?tab=reviews', async () => {
    setReferrer('http://localhost:3000/admin?tab=reviews');
    setupReview('EMPLOYER');
    renderWithProfile(withRoute(), {
      route: '/reviews/500',
      account: mockAccountMe({
        clientProfile: null,
        staff_member: { id: '99', staff_role: 'ADMIN' },
      }),
    });
    const link = await screen.findByRole('link', {
      name: /Back to publish queue/i,
    });
    expect(link).toHaveAttribute('href', '/admin?tab=reviews');
  });

  test('TEST-REVIEW-156 / REVIEW-033 — admin referrer + non-staff viewer → no admin leak', async () => {
    setReferrer('http://localhost:3000/admin');
    setupReview('EMPLOYER');
    renderWithProfile(withRoute(), {
      route: '/reviews/500',
      account: mockAccountMe({ clientProfile: mockClientProfile({ id: '7' }) }),
    });
    await waitFor(() => expect(screen.getByText(/Mike B\./)).toBeInTheDocument());
    expect(
      screen.queryByRole('link', { name: /Back to publish queue/i }),
    ).toBeNull();
  });

  test('TEST-REVIEW-156 / REVIEW-033 — /workers/:id referrer where the id matches the counterparty → "Back to <name>\'s reviews"', async () => {
    setReferrer('http://localhost:3000/workers/300');
    setupReview('EMPLOYER');
    renderWithProfile(withRoute(), {
      route: '/reviews/500',
      account: null,
    });
    const link = await screen.findByRole('link', {
      name: /Back to Mike B\.'s reviews/i,
    });
    expect(link).toHaveAttribute('href', '/workers/300');
  });

  test('TEST-REVIEW-156 / REVIEW-033 — /employers/:id referrer (WORKER reviewer) → analogous', async () => {
    setReferrer('http://localhost:3000/employers/400');
    setupReview('WORKER');
    renderWithProfile(withRoute(), {
      route: '/reviews/500',
      account: null,
    });
    const link = await screen.findByRole('link', {
      name: /Back to Acme's reviews/i,
    });
    expect(link).toHaveAttribute('href', '/employers/400');
  });

  test('TEST-REVIEW-156 / REVIEW-033 — empty referrer → "Back" button (no <Link>)', async () => {
    setReferrer('');
    setupReview('EMPLOYER');
    renderWithProfile(withRoute(), {
      route: '/reviews/500',
      account: null,
    });
    await waitFor(() => expect(screen.getByText(/Mike B\./)).toBeInTheDocument());
    // Generic Back button (not a link) renders.
    const back = screen.getByRole('button', { name: /^Back$/i });
    expect(back.tagName.toLowerCase()).toBe('button');
  });
});
