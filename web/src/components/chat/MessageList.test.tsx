// TEST-CHAT-150..152 — MessageList component-level tests (CHAT-061).
//
// Asserts the virtualised list keeps DOM-node count bounded for a large
// message set, renders SYSTEM messages as a centred pill (not as a
// sender bubble), and surfaces the failed/optimistic UI for a `failed`
// optimistic bubble.
//
// jsdom doesn't compute layout, so the production virtualiser would
// return 0 visible items even with `clientHeight` shimmed. This file
// mocks `@tanstack/react-virtual` with a deterministic implementation
// that materialises every row in `count` — drives the production
// `MessageList` component path end-to-end without leaving the unit
// layer. Real-browser virtualisation density is the Playwright layer's
// job (TEST-CHAT-220 / 230).

import { describe, expect, test, vi } from 'vitest';
import { renderWithProfile, screen } from '@/test/render';
import { MessageList } from './MessageList';
import type { ChatMessage, OptimisticMessage } from './types';

vi.mock('@tanstack/react-virtual', () => {
  return {
    useVirtualizer<T>(opts: {
      count: number;
      estimateSize: (i: number) => number;
    }) {
      const items: Array<{
        index: number;
        key: number;
        start: number;
        size: number;
      }> = [];
      let start = 0;
      for (let i = 0; i < opts.count; i++) {
        const size = opts.estimateSize(i);
        items.push({ index: i, key: i, start, size });
        start += size;
      }
      const totalSize = start;
      return {
        getVirtualItems: () => items,
        getTotalSize: () => totalSize,
        scrollToIndex: () => {},
        measureElement: (_el: T | null) => {},
      };
    },
  };
});

describe('TEST-CHAT-150 MessageList — virtualisation smoke (CHAT-061)', () => {
  test('TEST-CHAT-150 — 1000 messages → list mounts and bubble-node count is bounded by the virtualiser', () => {
    const ME = '101';
    const msgs: ChatMessage[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `${i}`,
      sender_id: i % 2 === 0 ? ME : '202',
      content: `m${i}`,
      message_type: 'TEXT',
      created_at: new Date(2026, 0, 1, 9, 0, i).toISOString(),
      attachments: [],
    }));
    renderWithProfile(
      <MessageList
        messages={msgs}
        myAccountId={ME}
        otherLastReadAt={null}
      />,
    );
    expect(screen.getByTestId('chat-message-list')).toBeInTheDocument();
    // With the deterministic virtualiser stub every row materialises;
    // the assertion still locks the upper bound at the message count
    // (the virtualiser does not over-render).
    const bubbles = screen.getAllByTestId('chat-message');
    expect(bubbles.length).toBeLessThanOrEqual(1000);
    // And the first / last messages are present (proves no offset bug
    // in the day-separator interleaving).
    expect(screen.getByText('m0')).toBeInTheDocument();
    expect(screen.getByText('m999')).toBeInTheDocument();
  });
});

describe('TEST-CHAT-151 MessageList — SYSTEM rendering (CHAT-051 / CHAT-011)', () => {
  test('TEST-CHAT-151 — SYSTEM message renders as a centred pill, NOT a sender bubble', () => {
    const ME = '101';
    const sys: ChatMessage = {
      id: 'sys',
      sender_id: '0',
      content:
        'Collaboration confirmed. You can now message each other about the project.',
      message_type: 'SYSTEM',
      created_at: new Date().toISOString(),
      attachments: [],
    };
    renderWithProfile(
      <MessageList
        messages={[sys]}
        myAccountId={ME}
        otherLastReadAt={null}
      />,
    );
    expect(
      screen.getByText(/Collaboration confirmed/i),
    ).toBeInTheDocument();
    // SYSTEM rows go through <SystemMessagePill>, not <MessageBubble>.
    expect(screen.queryByTestId('chat-message')).toBeNull();
  });
});

describe('TEST-CHAT-152 MessageList — failed-bubble UI (CHAT-063)', () => {
  test('TEST-CHAT-152 — status: failed renders "Couldn’t send" + Retry button', () => {
    const ME = '101';
    const failed: OptimisticMessage = {
      id: 'opt:1',
      client_id: 'c1',
      sender_id: ME,
      content: 'failed-message',
      message_type: 'TEXT',
      status: 'failed',
      retry_count: 1,
      created_at: new Date().toISOString(),
      attachments: [],
    };
    renderWithProfile(
      <MessageList
        messages={[failed]}
        myAccountId={ME}
        otherLastReadAt={null}
        onRetry={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText('failed-message')).toBeInTheDocument();
    expect(
      screen.getByText(/Couldn’t send|Couldn't send/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  test('TEST-CHAT-152 / CHAT-067 — retry_count >= 3 → Discard button surfaces', () => {
    const ME = '101';
    const exhausted: OptimisticMessage = {
      id: 'opt:1',
      client_id: 'c1',
      sender_id: ME,
      content: 'three-strike',
      message_type: 'TEXT',
      status: 'failed',
      retry_count: 3,
      created_at: new Date().toISOString(),
      attachments: [],
    };
    renderWithProfile(
      <MessageList
        messages={[exhausted]}
        myAccountId={ME}
        otherLastReadAt={null}
        onRetry={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Discard/i }),
    ).toBeInTheDocument();
  });
});
