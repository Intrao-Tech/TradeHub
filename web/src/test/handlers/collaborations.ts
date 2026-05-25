// MSW v2 handlers for the Collaborations surface.
//
// Post-2026-05 / CR-003: a Collaboration is a relationship-only binding —
// its lifecycle moved onto Contract. There is no `PATCH /:id/status` and
// no `POST /:id/flag`. Default-permissive handlers; per-test overrides
// layer on via `server.use(...)`.

import { http, HttpResponse } from 'msw';
import { mockCollaboration } from '../factories';

const API = 'http://localhost:8081/api';

export const collaborationsHandlers = [
  // ── List (COLLAB-010..COLLAB-015) ─────────────────────────────────
  http.get(`${API}/collaborations/me`, () =>
    HttpResponse.json({
      items: [],
      total: 0,
      page: 1,
      limit: 100,
    }),
  ),

  // ── Detail (COLLAB-020..COLLAB-026) ────────────────────────────────
  http.get(`${API}/collaborations/:id`, ({ params }) =>
    HttpResponse.json(mockCollaboration({ id: String(params.id) })),
  ),

  // ── Create-or-find relationship (COLLAB-030..COLLAB-033) ───────────
  http.post(`${API}/collaborations`, async ({ request }) => {
    const body = (await request.json()) as {
      worker_id?: number;
      employer_id?: number;
    };
    return HttpResponse.json(
      mockCollaboration({
        id: '8001',
        worker_id: body.worker_id != null ? String(body.worker_id) : '101',
        employer_id:
          body.employer_id != null ? String(body.employer_id) : '202',
      }),
      { status: 201 },
    );
  }),
];

/** Helper for tests that want a clean error fixture matching the API filter. */
export function collaborationErrorBody(
  code: string,
  status: number,
  message?: string,
) {
  return HttpResponse.json(
    { code, message: message ?? `${code} error`, statusCode: status },
    { status },
  );
}
