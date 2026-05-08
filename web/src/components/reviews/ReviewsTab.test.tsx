// TEST-REVIEW-130..135 — <ReviewsTab> (REVIEW-020..024).
//
// The Reviews tab body shared by `WorkerDetailPage` and `EmployerDetailPage`.

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  renderWithProfile,
  screen,
  waitFor,
  within,
} from '@/test/render';
import { server } from '@/test/msw-server';
import { mockReview, mockReviewListResponse } from '@/test/factories';
import { reviewsErrorBody } from '@/test/handlers/reviews';
import { ReviewsTab } from './ReviewsTab';

const API = 'http://localhost:8081/api';

describe('TEST-REVIEW-130 — REVIEW-020 worker tab fetches /reviews/worker/:id', () => {
  test('TEST-REVIEW-130 / REVIEW-020 — calls GET /reviews/worker/:id?page=1&limit=10 and renders <ReviewCard>s', async () => {
    let calledUrl = '';
    server.use(
      http.get(`${API}/reviews/worker/:id`, ({ request }) => {
        calledUrl = request.url;
        return HttpResponse.json(
          mockReviewListResponse(
            [
              mockReview({ id: '1' }),
              mockReview({ id: '2' }),
            ],
            { limit: 10 },
          ),
        );
      }),
    );
    renderWithProfile(
      <ReviewsTab subjectId="300" subjectKind="worker" subjectName="Mike" />,
      { route: '/' },
    );
    await waitFor(() =>
      expect(screen.getAllByText(/From an employer/i).length).toBeGreaterThan(0),
    );
    expect(calledUrl).toContain('/reviews/worker/300');
    expect(calledUrl).toContain('page=1');
    expect(calledUrl).toContain('limit=10');
  });

  test('TEST-REVIEW-130 / REVIEW-020 — fetch error → inline alert + Retry button', async () => {
    server.use(
      http.get(`${API}/reviews/worker/:id`, () =>
        reviewsErrorBody('INTERNAL', 500, 'oops'),
      ),
    );
    renderWithProfile(
      <ReviewsTab subjectId="300" subjectKind="worker" />,
      { route: '/' },
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/oops/);
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });
});

describe('TEST-REVIEW-131 — REVIEW-022 pagination Previous / Next + footer', () => {
  test('TEST-REVIEW-131 / REVIEW-022 — Previous disabled on page 1, Next disabled on last page', async () => {
    server.use(
      http.get(`${API}/reviews/worker/:id`, () =>
        HttpResponse.json(
          mockReviewListResponse([mockReview({ id: '1' })], {
            total: 1,
            page: 1,
            limit: 10,
          }),
        ),
      ),
    );
    renderWithProfile(
      <ReviewsTab subjectId="300" subjectKind="worker" />,
      { route: '/' },
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Previous/i })).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    expect(screen.getByText(/Page 1 of 1/i)).toBeInTheDocument();
    expect(screen.getByText(/1 review/i)).toBeInTheDocument();
  });
});

describe('TEST-REVIEW-132 — REVIEW-023 empty state when total === 0', () => {
  test('TEST-REVIEW-132 / REVIEW-023 — empty list → "No reviews yet"', async () => {
    server.use(
      http.get(`${API}/reviews/worker/:id`, () =>
        HttpResponse.json(mockReviewListResponse([], { limit: 10 })),
      ),
    );
    renderWithProfile(
      <ReviewsTab subjectId="300" subjectKind="worker" subjectName="Mike" />,
      { route: '/' },
    );
    await waitFor(() =>
      expect(screen.getByText(/No reviews yet/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Mike's first review/i)).toBeInTheDocument();
  });
});

describe('TEST-REVIEW-133 — REVIEW-024 skeleton on first load', () => {
  test('TEST-REVIEW-133 / REVIEW-024 — skeleton placeholder cards render while in flight', async () => {
    server.use(
      http.get(`${API}/reviews/worker/:id`, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(mockReviewListResponse([], { limit: 10 }));
      }),
    );
    const { container } = renderWithProfile(
      <ReviewsTab subjectId="300" subjectKind="worker" />,
      { route: '/' },
    );
    // Skeleton elements present before the response lands.
    expect(
      container.querySelectorAll('[data-slot="skeleton"], .animate-pulse')
        .length,
    ).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.getByText(/No reviews yet/i)).toBeInTheDocument(),
    );
  });
});

describe('TEST-REVIEW-134 — REVIEW-021 cards wrapped in <Link to="/reviews/:id">', () => {
  test('TEST-REVIEW-134 / REVIEW-021 — each card wraps in a permalink anchor', async () => {
    server.use(
      http.get(`${API}/reviews/worker/:id`, () =>
        HttpResponse.json(
          mockReviewListResponse(
            [mockReview({ id: '1' }), mockReview({ id: '2' })],
            { limit: 10 },
          ),
        ),
      ),
    );
    const { container } = renderWithProfile(
      <ReviewsTab subjectId="300" subjectKind="worker" />,
      { route: '/' },
    );
    await waitFor(() =>
      expect(container.querySelector('a[href="/reviews/1"]')).not.toBeNull(),
    );
    expect(container.querySelector('a[href="/reviews/2"]')).not.toBeNull();
  });
});

describe('TEST-REVIEW-135 — REVIEW-020 employer mirror', () => {
  test('TEST-REVIEW-135 / REVIEW-020 — subjectKind=employer hits /reviews/employer/:id', async () => {
    let calledUrl = '';
    server.use(
      http.get(`${API}/reviews/employer/:id`, ({ request }) => {
        calledUrl = request.url;
        return HttpResponse.json(
          mockReviewListResponse(
            [mockReview({ id: '5', reviewer_role: 'WORKER' })],
            { limit: 10 },
          ),
        );
      }),
    );
    renderWithProfile(
      <ReviewsTab subjectId="400" subjectKind="employer" />,
      { route: '/' },
    );
    await waitFor(() =>
      expect(screen.getByText(/From a worker/i)).toBeInTheDocument(),
    );
    expect(calledUrl).toContain('/reviews/employer/400');
  });
});
