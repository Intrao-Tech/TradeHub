// TEST-CHAT-005 — MSW v2 handlers for the seven Conversations endpoints
// the Chat surface calls. Default-permissive shapes; tests that need a
// per-case override layer one on top via `server.use(http.<m>(...))`,
// matching the per-test override pattern used by `tests-collaborations-polish`.

import { http, HttpResponse } from 'msw';
import {
  mockConversation,
  mockInboxItem,
  mockMessage,
  mockMessageAttachment,
} from '../factories';

const API = 'http://localhost:8081/api';

export const conversationsHandlers = [
  // ── Inbox list (CHAT-050..CHAT-053) ─────────────────────────────
  http.get(`${API}/conversations`, () =>
    HttpResponse.json({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    }),
  ),

  // ── Unread total (CHAT-070) ─────────────────────────────────────
  http.get(`${API}/conversations/unread-count`, () =>
    HttpResponse.json({ total: 0 }),
  ),

  // ── Single conversation (CHAT-060) ──────────────────────────────
  http.get(`${API}/conversations/:id`, ({ params }) =>
    HttpResponse.json(mockConversation({ id: String(params.id) })),
  ),

  // ── Messages list (CHAT-061) ────────────────────────────────────
  http.get(`${API}/conversations/:id/messages`, ({ params }) =>
    HttpResponse.json({
      items: [
        mockMessage({
          id: '5001',
          conversation_id: String(params.id),
          sender_id: '202',
          content: 'hello there',
        }),
      ],
      total: 1,
      page: 1,
      limit: 100,
    }),
  ),

  // ── Start direct conversation (legacy entry point — should not be used
  //    on the new chat surface but covered for completeness)
  http.post(`${API}/conversations`, async () =>
    HttpResponse.json(mockConversation(), { status: 201 }),
  ),

  // ── Send message (REST fallback path — CHAT-030) ────────────────
  http.post(`${API}/conversations/:id/messages`, async ({ params, request }) => {
    await request.json().catch(() => ({}));
    return HttpResponse.json(
      mockConversation({
        id: String(params.id),
        last_message_at: new Date().toISOString(),
      }),
      { status: 201 },
    );
  }),

  // ── Mark read (CHAT-032) ────────────────────────────────────────
  http.patch(`${API}/conversations/:id/read`, () =>
    HttpResponse.json({ ok: true, last_read_at: new Date().toISOString() }),
  ),

  // ── Attachment upload (CHAT-040) ────────────────────────────────
  http.post(`${API}/conversations/:id/attachments`, () =>
    HttpResponse.json(mockMessageAttachment(), { status: 201 }),
  ),
];

/** Convenience builder mirroring `collaborationErrorBody`. */
export function conversationErrorBody(
  code: string,
  status: number,
  message?: string,
) {
  return HttpResponse.json(
    { code, message: message ?? `${code} error`, statusCode: status },
    { status },
  );
}

// Re-export so `mockInboxItem` is accessible from the same module path
// callers tend to use for handler files.
export { mockInboxItem };
