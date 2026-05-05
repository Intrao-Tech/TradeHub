// TEST-JOBS-004 — MSW v2 handlers for the Jobs surface.
//
// Default-permissive handlers for every endpoint the Jobs UI calls. Tests
// that need a specific failure case (e.g., 409 ALREADY_APPLIED, 403
// EMAIL_NOT_VERIFIED) call `server.use(...)` to layer a per-test override
// on top — same per-test override pattern as `tests-profiles`.

import { http, HttpResponse } from 'msw';
import {
  mockJobApplication,
  mockJobPost,
  mockSpecialisationCatalog,
  mockTagCatalog,
} from '../factories';

const API = 'http://localhost:8081/api';

export const jobsHandlers = [
  // ── Catalogs (JOBS-022) ────────────────────────────────────────
  http.get(`${API}/specialisations`, () =>
    HttpResponse.json(mockSpecialisationCatalog()),
  ),
  http.get(`${API}/tags`, () => HttpResponse.json(mockTagCatalog())),

  // ── Job posts (public) ─────────────────────────────────────────
  http.get(`${API}/job-posts`, () =>
    HttpResponse.json({
      items: [mockJobPost()],
      total: 1,
      page: 1,
      limit: 20,
    }),
  ),
  http.get(`${API}/job-posts/:id`, ({ params }) =>
    HttpResponse.json(mockJobPost({ id: String(params.id) })),
  ),

  // ── Job posts (authed) ─────────────────────────────────────────
  http.get(`${API}/job-posts/me`, () =>
    HttpResponse.json({
      items: [mockJobPost()],
      total: 1,
      page: 1,
      limit: 20,
    }),
  ),
  http.post(`${API}/job-posts`, async ({ request }) => {
    const body = (await request.json()) as { title?: string };
    return HttpResponse.json(
      mockJobPost({ id: '9999', title: body.title ?? 'New job' }),
      { status: 201 },
    );
  }),
  http.patch(`${API}/job-posts/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Partial<{ title: string }>;
    return HttpResponse.json(
      mockJobPost({ id: String(params.id), ...body }),
    );
  }),
  http.delete(`${API}/job-posts/:id`, () => new HttpResponse(null, { status: 204 })),

  // ── Job applications ───────────────────────────────────────────
  http.post(
    `${API}/job-applications/jobs/:jobPostId/apply`,
    async ({ params }) =>
      HttpResponse.json(
        mockJobApplication({ job_post_id: String(params.jobPostId) }),
        { status: 201 },
      ),
  ),
  http.post(
    `${API}/job-applications/jobs/:jobPostId/invite`,
    async ({ params }) =>
      HttpResponse.json(
        mockJobApplication({
          job_post_id: String(params.jobPostId),
          initiated_by: 'EMPLOYER',
        }),
        { status: 201 },
      ),
  ),
  http.get(`${API}/job-applications/me`, () =>
    HttpResponse.json({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    }),
  ),
  http.get(`${API}/job-applications/jobs/:jobPostId`, ({ params }) =>
    HttpResponse.json({
      items: [mockJobApplication({ job_post_id: String(params.jobPostId) })],
      total: 1,
      page: 1,
      limit: 20,
    }),
  ),
  http.patch(
    `${API}/job-applications/:id/status`,
    async ({ params, request }) => {
      const body = (await request.json()) as { status: string };
      return HttpResponse.json(
        mockJobApplication({
          id: String(params.id),
          status: body.status as 'PENDING',
        }),
      );
    },
  ),
  http.post(`${API}/job-applications/:id/to-collaboration`, () =>
    HttpResponse.json({ id: '7000' }, { status: 201 }),
  ),
];

/** Helper for tests that want a clean apply-error fixture. */
export function applyErrorBody(code: string, status: number, message?: string) {
  return HttpResponse.json(
    { code, message: message ?? `${code} error`, statusCode: status },
    { status },
  );
}
