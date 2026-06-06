// TEST-REVIEW-160..165 — admin <ReviewsPublishQueueTab> (REVIEW-040..044).
//
// Locks the queue's row shape, the Publish optimistic-remove + rollback
// behaviour, pagination + empty-state.

import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  renderWithProfile,
  screen,
  userEvent,
  waitFor,
} from '@/test/render';
import { server } from '@/test/msw-server';
import {
  mockAccountMe,
  mockReviewDraft,
  mockReviewListResponse,
} from '@/test/factories';
import { reviewsErrorBody } from '@/test/handlers/reviews';
import { ReviewsPublishQueueTab } from './ReviewsPublishQueueTab';

const API = 'http://localhost:8081/api';

function asStaff() {
  return mockAccountMe({
    clientProfile: null,
    staff_member: { id: '1', staff_role: 'ADMIN' },
  });
}

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-160 — REVIEW-040 GET /reviews/unpublished on mount
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-160 — REVIEW-040 queue mount fetches /reviews/unpublished', () => {
  test('TEST-REVIEW-160 / REVIEW-040 — calls GET /reviews/unpublished?page=1&limit=20 and renders rows', async () => {
    let calledUrl = '';
    server.use(
      http.get(`${API}/reviews/unpublished`, ({ request }) => {
        calledUrl = request.url;
        return HttpResponse.json(
          mockReviewListResponse(
            [mockReviewDraft({ id: '700', overall_rating: 4 })],
            { limit: 20 },
          ),
        );
      }),
    );
    renderWithProfile(<ReviewsPublishQueueTab />, {
      route: '/admin',
      account: asStaff(),
    });
    await waitFor(() =>
      expect(screen.getByText(/Publish queue/i)).toBeInTheDocument(),
    );
    expect(calledUrl).toContain('page=1');
    expect(calledUrl).toContain('limit=20');
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-161 — REVIEW-041 row shape
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-161 — REVIEW-041 queue row shape', () => {
  test('TEST-REVIEW-161 / REVIEW-041 — renders reviewer-role badge, collab link, overall numeric, comment preview, View link, Publish button', async () => {
    server.use(
      http.get(`${API}/reviews/unpublished`, () =>
        HttpResponse.json(
          mockReviewListResponse(
            [
              mockReviewDraft({
                id: '700',
                reviewer_role: 'WORKER',
                overall_rating: 4,
                comment: 'short comment',
                collaboration: {
                  id: '501',
                  worker_id: '300',
                  employer_id: '400',
                  project_type: null,
                  started_at: null,
                  ended_at: null,
                },
              }),
            ],
            { limit: 20 },
          ),
        ),
      ),
    );
    renderWithProfile(<ReviewsPublishQueueTab />, {
      route: '/admin',
      account: asStaff(),
    });
    await waitFor(() =>
      expect(screen.getByText('WORKER')).toBeInTheDocument(),
    );
    expect(screen.getByText('4/5')).toBeInTheDocument();
    expect(screen.getByText(/short comment/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /#501/i })).toHaveAttribute(
      'href',
      '/collaborations/501',
    );
    expect(screen.getByRole('button', { name: /^Publish$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View/i })).toHaveAttribute(
      'href',
      '/reviews/700',
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-162 — REVIEW-042 Publish optimistic happy path
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-162 — REVIEW-042 Publish happy path', () => {
  test('TEST-REVIEW-162 / REVIEW-042 — Publish removes the row optimistically, fires PATCH, success toast', async () => {
    let patchCalled = false;
    server.use(
      http.get(`${API}/reviews/unpublished`, () =>
        HttpResponse.json(
          mockReviewListResponse(
            [mockReviewDraft({ id: '700' })],
            { limit: 20 },
          ),
        ),
      ),
      http.patch(`${API}/reviews/:id/publish`, () => {
        patchCalled = true;
        return HttpResponse.json({ id: '700', is_published: true });
      }),
    );
    renderWithProfile(<ReviewsPublishQueueTab />, {
      route: '/admin',
      account: asStaff(),
    });
    const publish = await screen.findByRole('button', { name: /^Publish$/i });
    const user = userEvent.setup();
    await user.click(publish);

    await waitFor(() => expect(patchCalled).toBe(true));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Publish$/i })).toBeNull(),
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-163 — REVIEW-042 Publish error rollback (REVIEW-050 parseApiError)
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-163 — REVIEW-042 Publish error rollback', () => {
  test('TEST-REVIEW-163 / REVIEW-042 / REVIEW-050 — error restores the row + inline alert from parseApiError', async () => {
    server.use(
      http.get(`${API}/reviews/unpublished`, () =>
        HttpResponse.json(
          mockReviewListResponse(
            [mockReviewDraft({ id: '700' })],
            { limit: 20 },
          ),
        ),
      ),
      http.patch(`${API}/reviews/:id/publish`, () =>
        reviewsErrorBody('INTERNAL', 500, 'Publish failed: db down'),
      ),
    );
    renderWithProfile(<ReviewsPublishQueueTab />, {
      route: '/admin',
      account: asStaff(),
    });
    const publish = await screen.findByRole('button', { name: /^Publish$/i });
    const user = userEvent.setup();
    await user.click(publish);

    // Inline alert with parseApiError-formatted message.
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Publish failed: db down/);
    // Row restored.
    expect(screen.getByRole('button', { name: /^Publish$/i })).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-164 — REVIEW-043 pagination
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-164 — REVIEW-043 pagination Previous / Next', () => {
  test('TEST-REVIEW-164 / REVIEW-043 — Previous disabled on page 1; Next enabled when totalPages > 1', async () => {
    server.use(
      http.get(`${API}/reviews/unpublished`, () =>
        HttpResponse.json(
          mockReviewListResponse(
            [mockReviewDraft({ id: '700' })],
            { total: 25, page: 1, limit: 20 },
          ),
        ),
      ),
    );
    renderWithProfile(<ReviewsPublishQueueTab />, {
      route: '/admin',
      account: asStaff(),
    });
    const prev = await screen.findByRole('button', { name: /Previous/i });
    expect(prev).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-REVIEW-165 — REVIEW-044 empty queue state
// ════════════════════════════════════════════════════════════════════

describe('TEST-REVIEW-165 — REVIEW-044 empty queue state', () => {
  test('TEST-REVIEW-165 / REVIEW-044 — total === 0 → "Queue clear"', async () => {
    server.use(
      http.get(`${API}/reviews/unpublished`, () =>
        HttpResponse.json(mockReviewListResponse([], { limit: 20 })),
      ),
    );
    renderWithProfile(<ReviewsPublishQueueTab />, {
      route: '/admin',
      account: asStaff(),
    });
    await waitFor(() =>
      expect(screen.getByText(/Queue clear/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/No reviews waiting/i)).toBeInTheDocument();
  });
});
