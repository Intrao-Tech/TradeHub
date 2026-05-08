// TEST-REVIEW-004 — MSW v2 handlers for the Reviews surface.
//
// Default-permissive handlers for the seven review endpoints the Reviews
// frontend calls. Tests override per-case via `server.use(...)` — same
// per-test override pattern as `tests-collaborations-polish`.

import { http, HttpResponse } from 'msw';
import { mockReview, mockReviewListResponse } from '../factories';

const API = 'http://localhost:8081/api';

export const reviewsHandlers = [
  // ── POST /reviews/collaboration/:collaborationId (REVIEW-013) ─────
  http.post(
    `${API}/reviews/collaboration/:collaborationId`,
    async ({ params, request }) => {
      const body = (await request.json().catch(() => ({}))) as {
        overall_rating?: number;
        comment?: string;
      };
      return HttpResponse.json(
        mockReview({
          id: '500',
          collaboration_id: String(params.collaborationId),
          reviewer_role: 'WORKER',
          is_published: false,
          published_at: null,
          overall_rating: body.overall_rating ?? 5,
          comment: body.comment ?? null,
        }),
        { status: 201 },
      );
    },
  ),

  // ── GET /reviews/collaboration/:collaborationId ───────────────────
  http.get(`${API}/reviews/collaboration/:collaborationId`, ({ params }) =>
    HttpResponse.json([
      mockReview({
        id: '510',
        collaboration_id: String(params.collaborationId),
        reviewer_role: 'WORKER',
      }),
      mockReview({
        id: '511',
        collaboration_id: String(params.collaborationId),
        reviewer_role: 'EMPLOYER',
      }),
    ]),
  ),

  // ── GET /reviews/worker/:workerId (REVIEW-020) ────────────────────
  http.get(`${API}/reviews/worker/:workerId`, () =>
    HttpResponse.json(mockReviewListResponse([])),
  ),

  // ── GET /reviews/employer/:employerId (REVIEW-020) ────────────────
  http.get(`${API}/reviews/employer/:employerId`, () =>
    HttpResponse.json(mockReviewListResponse([])),
  ),

  // ── GET /reviews/unpublished (REVIEW-046) ─────────────────────────
  http.get(`${API}/reviews/unpublished`, () =>
    HttpResponse.json(mockReviewListResponse([], { limit: 20 })),
  ),

  // ── GET /reviews/:id (REVIEW-032) ─────────────────────────────────
  http.get(`${API}/reviews/:id`, ({ params }) =>
    HttpResponse.json(mockReview({ id: String(params.id) })),
  ),

  // ── PATCH /reviews/:id/publish (REVIEW-042) ───────────────────────
  http.patch(`${API}/reviews/:id/publish`, ({ params }) =>
    HttpResponse.json(
      mockReview({ id: String(params.id), is_published: true }),
    ),
  ),
];

/** Helper: error body that matches the API filter contract. */
export function reviewsErrorBody(
  code: string,
  status: number,
  message?: string,
) {
  return HttpResponse.json(
    { code, message: message ?? `${code} error`, statusCode: status },
    { status },
  );
}
