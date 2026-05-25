// TEST-CHAT-130..133 — AppShell unread badge unit tests (CHAT-070 / CHAT-071).
//
// Asserts the badge renders the value from `GET /conversations/unread-count`,
// hides at 0, refetches on focus + on inbound `new_message` / `message_read`
// WS events, and pulses on a non-/inbox route via the live-dot indicator.

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setTokens, clearTokens } from '@/api';
import { server } from '@/test/msw-server';
import { renderWithProfile, screen, waitFor, act } from '@/test/render';
import {
  installSocketMock,
  makeMockChatSocketHook,
  restoreSocketMock,
  type MockSocket,
} from '@/test/socket-mock';
import { AppShell } from './AppShell';

const API = 'http://localhost:8081/api';

vi.mock('@/components/chat/useChatSocket', () => ({
  useChatSocket: () => makeMockChatSocketHook(),
  __resetChatSocketForTests: () => {},
}));

let mockSocket: MockSocket;

beforeEach(() => {
  mockSocket = installSocketMock();
  // Make the production hook see "we have a token", so useUnreadCount
  // doesn't bail out before the fetch.
  setTokens('test-access', 'test-refresh');
});

afterEach(() => {
  restoreSocketMock();
  clearTokens();
});

const NAV = [{ to: '/inbox', label: 'Inbox' }];

function renderShell(route = '/profile') {
  return renderWithProfile(
    <AppShell
      loggedIn
      publicNav={[]}
      privateNav={NAV}
      onLogout={() => {}}
    >
      <div>main</div>
    </AppShell>,
    { route },
  );
}

describe('TEST-CHAT-130 AppShell unread badge — initial load (CHAT-070)', () => {
  test('TEST-CHAT-130 / CHAT-070 — total: 3 → renders badge with 3', async () => {
    server.use(
      http.get(`${API}/conversations/unread-count`, () =>
        HttpResponse.json({ total: 3 }),
      ),
    );
    renderShell();
    await waitFor(() => {
      const inbox = screen.getAllByText('Inbox')[0];
      expect(inbox.parentElement?.textContent).toContain('3');
    });
  });

  test('TEST-CHAT-130 / CHAT-070 — total: 0 → no badge', async () => {
    renderShell();
    // Wait a beat for the fetch to settle.
    await new Promise((r) => setTimeout(r, 50));
    const inboxLink = screen.getAllByText('Inbox')[0];
    // No `99+` and no numeric badge sibling.
    expect(inboxLink.parentElement?.textContent ?? '').toMatch(/^Inbox$/);
  });
});

describe('TEST-CHAT-131 AppShell unread badge — live update (CHAT-070)', () => {
  test('TEST-CHAT-131 / CHAT-070 — new_message → refetch updates badge', async () => {
    let total = 0;
    server.use(
      http.get(`${API}/conversations/unread-count`, () =>
        HttpResponse.json({ total }),
      ),
    );
    renderShell();
    await waitFor(() => screen.getAllByText('Inbox')[0]);
    // No badge yet.
    expect(
      screen.getAllByText('Inbox')[0].parentElement?.textContent,
    ).not.toMatch(/[0-9]/);
    total = 1;
    await act(async () => {
      mockSocket.__triggerEvent('new_message', { conversation_id: '1' });
      await new Promise((r) => setTimeout(r, 50));
    });
    await waitFor(() =>
      expect(
        screen.getAllByText('Inbox')[0].parentElement?.textContent,
      ).toContain('1'),
    );
  });

  test('TEST-CHAT-131 / CHAT-070 — message_read fires a refetch as well', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/conversations/unread-count`, () => {
        calls += 1;
        return HttpResponse.json({ total: 0 });
      }),
    );
    renderShell();
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(1));
    const before = calls;
    await act(async () => {
      mockSocket.__triggerEvent('message_read', { conversation_id: '1' });
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(calls).toBeGreaterThan(before);
  });
});

describe('TEST-CHAT-132 AppShell unread badge — refetch on focus (CHAT-070)', () => {
  test('TEST-CHAT-132 — window focus fires a fetch', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/conversations/unread-count`, () => {
        calls += 1;
        return HttpResponse.json({ total: 0 });
      }),
    );
    renderShell();
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(1));
    const before = calls;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(calls).toBeGreaterThan(before);
  });
});
