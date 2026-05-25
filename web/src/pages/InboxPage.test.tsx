// TEST-CHAT-100..104 — InboxPage frontend unit tests.
//
// Locks the rebuilt inbox surface against the parent-feature legacy
// debug DNA (`<pre>{JSON.stringify}</pre>`, recipient-id input, mark-read
// button) and verifies the new collab-pill / unread-badge / empty-state
// behaviour. Drives the REST surface via the default conversations MSW
// handlers + per-test override pattern.

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { server } from '@/test/msw-server';
import { renderWithProfile, screen, waitFor } from '@/test/render';
import {
  installSocketMock,
  makeMockChatSocketHook,
  restoreSocketMock,
} from '@/test/socket-mock';
import { mockInboxItem, mockMessage } from '@/test/factories';
import InboxPage from './InboxPage';

const API = 'http://localhost:8081/api';

vi.mock('@/components/chat/useChatSocket', () => ({
  useChatSocket: () => makeMockChatSocketHook(),
  __resetChatSocketForTests: () => {},
}));

beforeEach(() => {
  installSocketMock();
});

afterEach(() => {
  restoreSocketMock();
});

function renderInbox(route = '/inbox') {
  return renderWithProfile(
    <Routes>
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="/inbox/:conversationId" element={<InboxPage />} />
    </Routes>,
    { route },
  );
}

describe('TEST-CHAT-100 InboxPage — no legacy debug DNA (CHAT-053)', () => {
  test('TEST-CHAT-100 / CHAT-053 — no <pre>{JSON.stringify}</pre> anywhere', async () => {
    server.use(
      http.get(`${API}/conversations`, () =>
        HttpResponse.json({
          items: [mockInboxItem({ unread_count: 2 })],
          total: 1,
          page: 1,
          limit: 50,
        }),
      ),
    );
    const { container } = renderInbox();
    await waitFor(() =>
      expect(screen.queryAllByText(/no conversations/i)).toHaveLength(0),
    );
    expect(container.querySelector('pre')).toBeNull();
    expect(screen.queryByText(/JSON/i)).toBeNull();
    expect(screen.queryByText(/Last action response/i)).toBeNull();
  });

  test('TEST-CHAT-100 / CHAT-053 — empty inbox renders no <pre> either', async () => {
    const { container } = renderInbox();
    await waitFor(() =>
      expect(screen.getByText(/No conversations yet/i)).toBeInTheDocument(),
    );
    expect(container.querySelector('pre')).toBeNull();
  });
});

describe('TEST-CHAT-101 InboxPage — no Recipient-id form (CHAT-052)', () => {
  test('TEST-CHAT-101 / CHAT-052 — no "Recipient account ID" input or "Start conversation" button', async () => {
    renderInbox();
    await waitFor(() =>
      expect(screen.getByText(/No conversations yet/i)).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/Recipient account ID/i)).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Start.*conversation/i }),
    ).toBeNull();
    // Manual "Mark read" button (CHAT-032 deletes it).
    expect(screen.queryByRole('button', { name: /^Mark read$/i })).toBeNull();
  });
});

describe('TEST-CHAT-102 InboxPage — list rendering (CHAT-050)', () => {
  test('TEST-CHAT-102 / CHAT-050 — renders one row per inbox item', async () => {
    server.use(
      http.get(`${API}/conversations`, () =>
        HttpResponse.json({
          items: [
            mockInboxItem({
              conversation: {
                id: '1',
                collaboration_id: '1',
                last_message_at: '2026-05-07T12:00:00Z',
                created_at: '2026-05-07T12:00:00Z',
              },
              other_participant: {
                account_id: '202',
                client_profile_id: '202',
                display_name: 'Acme Build',
                avatar_url: null,
                verification_level: 'BASIC',
              },
              unread_count: 3,
            }),
            mockInboxItem({
              conversation: {
                id: '2',
                collaboration_id: '2',
                last_message_at: '2026-05-07T11:00:00Z',
                created_at: '2026-05-07T11:00:00Z',
              },
              other_participant: {
                account_id: '303',
                client_profile_id: '303',
                display_name: 'Bob Worker',
                avatar_url: null,
                verification_level: null,
              },
              last_message: mockMessage({
                conversation_id: '2',
                content: 'hi there',
              }),
              unread_count: 0,
            }),
          ],
          total: 2,
          page: 1,
          limit: 50,
        }),
      ),
    );
    renderInbox();
    await waitFor(() =>
      expect(screen.getByText('Acme Build')).toBeInTheDocument(),
    );
    expect(screen.getByText('Bob Worker')).toBeInTheDocument();
  });
});

describe('TEST-CHAT-103 InboxPage — empty state (CHAT-051)', () => {
  test('TEST-CHAT-103 / CHAT-051 — empty list renders the EmptyState copy', async () => {
    renderInbox();
    await waitFor(() =>
      expect(screen.getByText(/No conversations yet/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        /Once you confirm a collaboration, the chat with your counterparty appears here/i,
      ),
    ).toBeInTheDocument();
  });
});

describe('TEST-CHAT-104 InboxPage — sort order (CHAT-051)', () => {
  test('TEST-CHAT-104 / CHAT-051 — rows render in last_message_at desc order as returned by the server', async () => {
    server.use(
      http.get(`${API}/conversations`, () =>
        HttpResponse.json({
          items: [
            mockInboxItem({
              conversation: {
                id: '1',
                collaboration_id: null,
                last_message_at: '2026-05-07T12:00:00Z',
                created_at: '2026-05-07T12:00:00Z',
              },
              other_participant: {
                account_id: '1',
                client_profile_id: '1',
                display_name: 'Newest',
                avatar_url: null,
                verification_level: null,
              },
            }),
            mockInboxItem({
              conversation: {
                id: '2',
                collaboration_id: null,
                last_message_at: '2026-05-06T12:00:00Z',
                created_at: '2026-05-06T12:00:00Z',
              },
              other_participant: {
                account_id: '2',
                client_profile_id: '2',
                display_name: 'Middle',
                avatar_url: null,
                verification_level: null,
              },
            }),
            mockInboxItem({
              conversation: {
                id: '3',
                collaboration_id: null,
                last_message_at: '2026-05-05T12:00:00Z',
                created_at: '2026-05-05T12:00:00Z',
              },
              other_participant: {
                account_id: '3',
                client_profile_id: '3',
                display_name: 'Oldest',
                avatar_url: null,
                verification_level: null,
              },
            }),
          ],
          total: 3,
          page: 1,
          limit: 50,
        }),
      ),
    );
    renderInbox();
    await waitFor(() =>
      expect(screen.getByText('Newest')).toBeInTheDocument(),
    );
    const order = screen.getAllByText(/Newest|Middle|Oldest/).map(
      (n) => n.textContent,
    );
    expect(order).toEqual(['Newest', 'Middle', 'Oldest']);
  });
});
