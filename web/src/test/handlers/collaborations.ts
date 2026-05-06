// TEST-COLLAB-004 — MSW v2 handlers for the Collaborations surface.
//
// Default-permissive handlers for the five collaboration endpoints the
// Collaborations Polish UI calls. Tests that need a specific failure case
// (e.g., 403 EMAIL_NOT_VERIFIED, 400 worker_id === employer_id) call
// `server.use(...)` to layer a per-test override on top — same per-test
// override pattern as `tests-jobs-applications`.

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

  // ── Create (COLLAB-030..COLLAB-033) ────────────────────────────────
  http.post(`${API}/collaborations`, async ({ request }) => {
    const body = (await request.json()) as {
      worker_id?: number;
      employer_id?: number;
      project_type?: string;
      site_postcode?: string;
      agreed_amount?: number;
      referral_id?: number;
    };
    return HttpResponse.json(
      mockCollaboration({
        id: '8001',
        initiated_by: body.employer_id != null ? 'WORKER' : 'EMPLOYER',
        project_type: body.project_type ?? null,
        site_postcode: body.site_postcode ?? null,
        agreed_amount:
          body.agreed_amount != null ? String(body.agreed_amount) : null,
      }),
      { status: 201 },
    );
  }),

  // ── Status transition (COLLAB-021) ─────────────────────────────────
  http.patch(
    `${API}/collaborations/:id/status`,
    async ({ params, request }) => {
      const body = (await request.json()) as { status: string };
      return HttpResponse.json(
        mockCollaboration({
          id: String(params.id),
          status: body.status as 'PENDING',
        }),
      );
    },
  ),

  // ── Flag (COLLAB-040..COLLAB-043) ──────────────────────────────────
  http.post(
    `${API}/collaborations/:id/flag`,
    async ({ params, request }) => {
      const body = (await request.json()) as { reason: string };
      return HttpResponse.json(
        mockCollaboration({
          id: String(params.id),
          flagged: true,
          flag_reason: body.reason,
        }),
      );
    },
  ),
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
