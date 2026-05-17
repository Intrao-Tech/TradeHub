// MSW v2 handlers for the Conversations endpoints the Chat surface calls.
//
// Post-2026-05: a conversation is a strict 1:1 with a collaboration (shared
// PK). There is no `POST /conversations` start endpoint and no attachment
// upload — file messages carry their file inline. Default-permissive
// shapes; per-test overrides layer on via `server.use(...)`.

import { http, HttpResponse } from 'msw';
import { mockConversation, mockInboxItem, mockMessage } from '../factories';

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

  // ── Send message (REST fallback path — CHAT-030) ────────────────
  http.post(
    `${API}/conversations/:id/messages`,
    async ({ params, request }) => {
      await request.json().catch(() => ({}));
      return HttpResponse.json(
        mockConversation({
          id: String(params.id),
          lastMessageAt: new Date().toISOString(),
        }),
        { status: 201 },
      );
    },
  ),

  // ── Mark read (CHAT-032) ────────────────────────────────────────
  http.patch(`${API}/conversations/:id/read`, () =>
    HttpResponse.json({ ok: true, last_read_at: new Date().toISOString() }),
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
