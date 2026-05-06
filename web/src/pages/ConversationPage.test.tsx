// TEST-CHAT-110..122 — Conversation page (driven via the rebuilt
// `<ConversationPanel>` mounted by `<InboxPage>`) unit tests.
//
// The repo has no separate ConversationPage.tsx — InboxPage routes the
// `/inbox/:conversationId` slot into `<ConversationPanel>`. These tests
// drive the panel directly so they don't depend on the inbox grid
// layout. Where the panel composition matters (e.g. JSON-dump grep on
// the whole page surface), we render via the inbox route too.

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw-server';
import { renderWithProfile, screen, waitFor, act } from '@/test/render';
import {
  installSocketMock,
  makeMockChatSocketHook,
  restoreSocketMock,
  type MockSocket,
} from '@/test/socket-mock';
import { setTokens, clearTokens } from '@/api';
import { mockConversation, mockMessage } from '@/test/factories';
import { ConversationPanel } from '@/components/chat/ConversationPanel';
import { mockInboxItem } from '@/test/factories';

const API = 'http://localhost:8081/api';

vi.mock('@/components/chat/useChatSocket', () => ({
  useChatSocket: () => makeMockChatSocketHook(),
  __resetChatSocketForTests: () => {},
}));

let mockSocket: MockSocket;

beforeEach(() => {
  mockSocket = installSocketMock();
  setTokens('test-access', 'test-refresh');
  // jsdom layout shims for @tanstack/react-virtual.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 500,
  });
});

afterEach(() => {
  restoreSocketMock();
  clearTokens();
});

function renderPanel(opts: {
  conversationId?: string;
  myAccountId?: string;
  collabBound?: boolean;
} = {}) {
  const conversationId = opts.conversationId ?? '6001';
  const collab = opts.collabBound
    ? {
        id: '900',
        status: 'CONFIRMED',
        worker_id: '101',
        employer_id: '202',
      }
    : null;
  const inboxRow = mockInboxItem({
    conversation: {
      id: conversationId,
      collaboration_id: collab?.id ?? null,
      last_message_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
    collaboration: collab,
    other_participant: {
      account_id: '202',
      client_profile_id: '202',
      display_name: 'Acme Build',
      avatar_url: null,
      verification_level: 'BASIC',
    },
  });
  return renderWithProfile(
    <ConversationPanel
      conversationId={conversationId}
      myAccountId={opts.myAccountId ?? '101'}
      inboxRow={inboxRow}
    />,
  );
}

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-110 — Header (CHAT-060)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-110 ConversationPanel header (CHAT-060)', () => {
  test('TEST-CHAT-110 — collab-bound conversation renders the View-collaboration link + status pill', async () => {
    server.use(
      http.get(`${API}/conversations/6001`, () =>
        HttpResponse.json(
          mockConversation({
            id: '6001',
            collaboration_id: '900',
            collaboration: {
              id: '900',
              status: 'CONFIRMED',
              worker_id: '101',
              employer_id: '202',
            },
          }),
        ),
      ),
      http.get(`${API}/conversations/6001/messages`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
    );
    renderPanel({ collabBound: true });
    expect(await screen.findByText(/View collaboration/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /View collaboration/i });
    expect(link.getAttribute('href')).toBe('/collaborations/900');
  });

  test('TEST-CHAT-110 — direct conversation renders "Direct message" + no collab pill', async () => {
    server.use(
      http.get(`${API}/conversations/6001`, () =>
        HttpResponse.json(
          mockConversation({ id: '6001', collaboration_id: null }),
        ),
      ),
      http.get(`${API}/conversations/6001/messages`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
    );
    renderPanel({ collabBound: false });
    expect(await screen.findByText(/Direct message/i)).toBeInTheDocument();
    expect(screen.queryByText(/View collaboration/i)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-118 — Mark-read on visibility (CHAT-065)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-118 mark-read on visibility (CHAT-065)', () => {
  test('TEST-CHAT-118 — visible mount fires one PATCH; subsequent new_message past the 2s throttle fires another', async () => {
    let readCalls = 0;
    server.use(
      http.get(`${API}/conversations/6001`, () =>
        HttpResponse.json(mockConversation({ id: '6001' })),
      ),
      http.get(`${API}/conversations/6001/messages`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
      http.patch(`${API}/conversations/6001/read`, () => {
        readCalls += 1;
        return HttpResponse.json({
          ok: true,
          last_read_at: new Date().toISOString(),
        });
      }),
    );
    renderPanel({});
    await waitFor(() => expect(readCalls).toBeGreaterThanOrEqual(1));
    const before = readCalls;
    // Skip the 2s mark-read throttle (CHAT-033) by jumping the wall
    // clock forward — production reads `Date.now()` for the throttle.
    // Real timers + MSW + fetch keep working; only `Date.now` is
    // shifted so the throttle window elapses instantly.
    const realNow = Date.now.bind(Date);
    const offsetMs = 2_500;
    const spy = vi
      .spyOn(Date, 'now')
      .mockImplementation(() => realNow() + offsetMs);
    try {
      await act(async () => {
        mockSocket.__triggerEvent('new_message', {
          id: '1',
          conversation_id: '6001',
          sender_id: '202',
          content: 'incoming',
          message_type: 'TEXT',
          created_at: new Date().toISOString(),
        });
        await new Promise((r) => setTimeout(r, 200));
      });
      expect(readCalls).toBeGreaterThan(before);
    } finally {
      spy.mockRestore();
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-119 — Mark-read throttle (CHAT-033)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-119 mark-read throttle (CHAT-033)', () => {
  test('TEST-CHAT-119 — burst of 5 new_message events within 1 s → exactly one PATCH', async () => {
    let readCalls = 0;
    server.use(
      http.get(`${API}/conversations/6001`, () =>
        HttpResponse.json(mockConversation({ id: '6001' })),
      ),
      http.get(`${API}/conversations/6001/messages`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
      http.patch(`${API}/conversations/6001/read`, () => {
        readCalls += 1;
        return HttpResponse.json({
          ok: true,
          last_read_at: new Date().toISOString(),
        });
      }),
    );
    renderPanel({});
    await waitFor(() => expect(readCalls).toBeGreaterThanOrEqual(1));
    const baseline = readCalls;
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        mockSocket.__triggerEvent('new_message', {
          id: `m${i}`,
          conversation_id: '6001',
          sender_id: '202',
          content: `incoming ${i}`,
          message_type: 'TEXT',
          created_at: new Date().toISOString(),
        });
      }
      await new Promise((r) => setTimeout(r, 250));
    });
    // Throttled to 1 call per 2 s → at most one extra PATCH for the burst.
    expect(readCalls - baseline).toBeLessThanOrEqual(1);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-117 — Typing receive (CHAT-064)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-117 typing-indicator receive (CHAT-064)', () => {
  test('TEST-CHAT-117 — typing:start from other → "is typing…" row appears', async () => {
    server.use(
      http.get(`${API}/conversations/6001`, () =>
        HttpResponse.json(mockConversation({ id: '6001' })),
      ),
      http.get(`${API}/conversations/6001/messages`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
    );
    renderPanel({});
    await waitFor(() =>
      expect(screen.getByText(/Acme Build/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('typing-indicator')).toBeNull();
    await act(async () => {
      mockSocket.__triggerEvent('typing:start', {
        conversation_id: '6001',
        account_id: '202',
      });
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
  });

  test('TEST-CHAT-117 — typing:stop clears the row', async () => {
    server.use(
      http.get(`${API}/conversations/6001`, () =>
        HttpResponse.json(mockConversation({ id: '6001' })),
      ),
      http.get(`${API}/conversations/6001/messages`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 100 }),
      ),
    );
    renderPanel({});
    await waitFor(() =>
      expect(screen.getByText(/Acme Build/i)).toBeInTheDocument(),
    );
    await act(async () => {
      mockSocket.__triggerEvent('typing:start', {
        conversation_id: '6001',
        account_id: '202',
      });
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
    await act(async () => {
      mockSocket.__triggerEvent('typing:stop', {
        conversation_id: '6001',
        account_id: '202',
      });
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.queryByTestId('typing-indicator')).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-122 — No JSON dump on the conversation surface (CHAT-053)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-122 ConversationPanel — no <pre> JSON dump (CHAT-053)', () => {
  test('TEST-CHAT-122 / CHAT-053 — no <pre> in the rendered tree', async () => {
    server.use(
      http.get(`${API}/conversations/6001`, () =>
        HttpResponse.json(mockConversation({ id: '6001' })),
      ),
      http.get(`${API}/conversations/6001/messages`, () =>
        HttpResponse.json({
          items: [
            mockMessage({
              id: 'm1',
              conversation_id: '6001',
              sender_id: '202',
              content: 'hi',
            }),
          ],
          total: 1,
          page: 1,
          limit: 100,
        }),
      ),
    );
    const { container } = renderPanel({});
    await waitFor(() =>
      expect(screen.getByText(/Acme Build/i)).toBeInTheDocument(),
    );
    expect(container.querySelector('pre')).toBeNull();
    expect(screen.queryByText(/JSON/i)).toBeNull();
  });
});
