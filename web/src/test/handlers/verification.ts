// TEST-VER-004 — default MSW handlers for the Verification surface.
//
// Component tests override per-case with `server.use(http.<method>(...))`
// using the same handler factory the production SPA hits.

import { http, HttpResponse } from 'msw';
import {
  mockProviders,
  mockQueueResponse,
  mockVerificationLadder,
  mockVerificationLevels,
  mockVerificationMe,
} from '../factories';

const API = 'http://localhost:8081/api';

export const verificationHandlers = [
  http.get(`${API}/verification/me`, () =>
    HttpResponse.json(mockVerificationMe()),
  ),

  http.get(`${API}/verification/levels/:id`, () =>
    HttpResponse.json(mockVerificationLevels()),
  ),

  http.get(`${API}/verification/ladder/:id`, () =>
    HttpResponse.json(mockVerificationLadder()),
  ),

  http.get(`${API}/verification/queue`, () =>
    HttpResponse.json(mockQueueResponse({ items: [] })),
  ),

  http.get(`${API}/verification/queue/:id`, ({ params }) =>
    HttpResponse.json({
      document: {
        id: String(params.id),
        doc_type: 'CSCS_CARD',
        file_url: '/uploads/test.pdf',
        status: 'PENDING',
        rejection_reason: null,
        metadata: null,
        assigned_to: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
      },
      uploader: {
        id: '42',
        display_name: 'Mike Builder',
        role: 'WORKER',
        verification_level: 'BASIC',
      },
      assignee: null,
      reviewer: null,
      history: [],
    }),
  ),

  http.post(`${API}/verification/identity/start`, () =>
    HttpResponse.json(
      {
        verification_url: 'https://verify.stripe.com/test_session',
        session_id: 'vs_test_123',
        status: 'requires_input',
      },
      { status: 201 },
    ),
  ),

  http.get(`${API}/verification/identity/status`, () =>
    HttpResponse.json({ session_id: null, status: null }),
  ),

  http.post(
    `${API}/verification/documents/:id/review`,
    async ({ request, params }) => {
      const body = (await request.json()) as {
        decision?: string;
        reason?: string;
      };
      const status = body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      return HttpResponse.json({
        document: {
          id: String(params.id),
          doc_type: 'CSCS_CARD',
          file_url: '/uploads/test.pdf',
          status,
          rejection_reason: status === 'REJECTED' ? (body.reason ?? null) : null,
          metadata: null,
          assigned_to: null,
          reviewed_by: '1',
          reviewed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          client_profile_id: '42',
        },
        level_changed: null,
        milestones_written: [],
      });
    },
  ),

  http.post(`${API}/verification/documents/:id/assign`, () =>
    HttpResponse.json({ ok: true, assigned_to: '1' }),
  ),

  http.post(`${API}/verification/documents/:id/claim`, () =>
    HttpResponse.json({ ok: true, assigned_to: '1' }),
  ),

  http.post(`${API}/verification/employer/companies-house-verify`, () =>
    HttpResponse.json({
      matched: true,
      milestone_id: '500',
      registry_company_name: 'Acme Limited',
    }),
  ),

  http.get(`${API}/verification/providers`, () =>
    HttpResponse.json(mockProviders()),
  ),

  http.post(`${API}/staff/me/duty`, () =>
    HttpResponse.json({ ok: true, on_duty: true, reassigned_count: 0 }),
  ),
];
