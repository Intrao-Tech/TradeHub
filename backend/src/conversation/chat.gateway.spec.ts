// TEST-CHAT-030..032 — ChatGateway unit specs.
//
// Drives the gateway with a stubbed Server / Socket — covers behaviour
// that does not require a real handshake. Real-handshake assertions
// (CHAT-020 silent rejection on `join_conversation`, CHAT-022 state
// guard) live in `backend/test/chat.gateway.e2e-spec.ts`.

import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { ChatGateway } from './chat.gateway';
import { ConversationService } from './conversation.service';
import { PrismaService } from '../prisma/prisma.service';

type FakeSocket = {
  id: string;
  data: { accountId?: string; sendTimestamps?: number[] };
  emit: jest.Mock;
  join: jest.Mock;
  to: jest.Mock<{ emit: jest.Mock }>;
  disconnect: jest.Mock;
  handshake: { auth?: { token?: string }; headers: Record<string, string> };
};

function fakeSocket(accountId: string, id = `s-${Math.random()}`): FakeSocket {
  const toEmit = { emit: jest.fn() };
  return {
    id,
    data: { accountId, sendTimestamps: [] },
    emit: jest.fn(),
    join: jest.fn(),
    to: jest.fn().mockReturnValue(toEmit),
    disconnect: jest.fn(),
    handshake: { headers: {} },
  };
}

function build(): {
  gateway: ChatGateway;
  prisma: DeepMockProxy<PrismaService>;
  conversation: DeepMockProxy<ConversationService>;
  jwt: DeepMockProxy<JwtService>;
  config: DeepMockProxy<ConfigService>;
  server: { to: jest.Mock<{ emit: jest.Mock }>; fetchSockets: jest.Mock };
} {
  const prisma = mockDeep<PrismaService>();
  const conversation = mockDeep<ConversationService>();
  const jwt = mockDeep<JwtService>();
  const config = mockDeep<ConfigService>();
  const server = {
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    fetchSockets: jest.fn().mockResolvedValue([]),
  };
  const gateway = new ChatGateway(jwt, config, prisma, conversation);
  // @ts-expect-error — assign the @WebSocketServer-decorated property.
  gateway.server = server;
  return { gateway, prisma, conversation, jwt, config, server };
}

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-030 — Rate limit (CHAT-021)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-030 ChatGateway rate-limit token bucket — CHAT-021', () => {
  test('TEST-CHAT-030 / CHAT-021 — 10 messages within 10 s are accepted; 11th rejected with RATE_LIMITED', async () => {
    const { gateway, conversation } = build();
    const sock = fakeSocket('11');
    conversation.sendMessage.mockResolvedValue({} as never);
    for (let i = 0; i < 10; i++) {
      await gateway.handleSendMessage(sock as never, {
        conversation_id: 1,
        content: `m${i}`,
        client_id: `c${i}`,
      });
    }
    expect(conversation.sendMessage).toHaveBeenCalledTimes(10);
    expect(sock.emit).not.toHaveBeenCalled();

    await gateway.handleSendMessage(sock as never, {
      conversation_id: 1,
      content: 'm10',
      client_id: 'c10',
    });
    expect(conversation.sendMessage).toHaveBeenCalledTimes(10);
    expect(sock.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'RATE_LIMITED' }),
    );
  });

  test('TEST-CHAT-030 / CHAT-021 — bucket refills after 10 s of no events', async () => {
    jest.useFakeTimers();
    try {
      const { gateway, conversation } = build();
      const sock = fakeSocket('11');
      conversation.sendMessage.mockResolvedValue({} as never);
      for (let i = 0; i < 10; i++) {
        await gateway.handleSendMessage(sock as never, {
          conversation_id: 1,
          content: `m${i}`,
        });
      }
      jest.advanceTimersByTime(10_001);
      // Use real timers for the await so the resolved value lands.
      jest.useRealTimers();
      // Re-set the wall clock past the window manually; the bucket is
      // wall-clock based.
      const realNow = Date.now;
      const past = realNow() + 11_000;
      jest.spyOn(Date, 'now').mockReturnValue(past);
      await gateway.handleSendMessage(sock as never, {
        conversation_id: 1,
        content: 'fresh',
      });
      expect(conversation.sendMessage).toHaveBeenCalledTimes(11);
    } finally {
      jest.useRealTimers();
      (Date.now as unknown as jest.SpyInstance).mockRestore?.();
    }
  });

  test('TEST-CHAT-030 / CHAT-021 — per-socket isolation: A bursting does not stop B', async () => {
    const { gateway, conversation } = build();
    const a = fakeSocket('11', 'A');
    const b = fakeSocket('22', 'B');
    conversation.sendMessage.mockResolvedValue({} as never);
    for (let i = 0; i < 10; i++) {
      await gateway.handleSendMessage(a as never, {
        conversation_id: 1,
        content: `${i}`,
      });
    }
    await gateway.handleSendMessage(a as never, {
      conversation_id: 1,
      content: 'over',
    });
    expect(a.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'RATE_LIMITED' }),
    );
    // B is unaffected.
    await gateway.handleSendMessage(b as never, {
      conversation_id: 1,
      content: 'fresh',
    });
    expect(b.emit).not.toHaveBeenCalled();
  });

  test('TEST-CHAT-030 — empty content → INVALID_INPUT before rate-limit consumes a token', async () => {
    const { gateway, conversation } = build();
    const sock = fakeSocket('11');
    await gateway.handleSendMessage(sock as never, {
      conversation_id: 1,
      content: '   ',
    });
    expect(conversation.sendMessage).not.toHaveBeenCalled();
    expect(sock.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-031 — Room name composition
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-031 ChatGateway room composition', () => {
  test('TEST-CHAT-031 — emitNewMessage targets `conv:<id>`', () => {
    const { gateway, server } = build();
    gateway.emitNewMessage(42n, { id: 1, content: 'hi' });
    expect(server.to).toHaveBeenCalledWith('conv:42');
  });

  test('TEST-CHAT-031 — emitMessageRead targets `conv:<id>` and stringifies bigints', () => {
    const { gateway, server } = build();
    const lastReadAt = new Date('2026-05-01T00:00:00Z');
    gateway.emitMessageRead(42n, 11n, lastReadAt);
    expect(server.to).toHaveBeenCalledWith('conv:42');
    const emitMock = (server.to.mock.results[0].value as { emit: jest.Mock })
      .emit;
    expect(emitMock).toHaveBeenCalledWith('message_read', {
      conversation_id: '42',
      account_id: '11',
      last_read_at: lastReadAt,
    });
  });

  test('TEST-CHAT-031 — emitNewMessage strips bigint values from payload (Redis-adapter safety)', () => {
    const { gateway, server } = build();
    gateway.emitNewMessage(42n, {
      id: 99n,
      sender_id: 11n,
      content: 'hi',
    });
    const emitMock = (server.to.mock.results[0].value as { emit: jest.Mock })
      .emit;
    const payload = emitMock.mock.calls[0][1] as Record<string, unknown>;
    // No bigint anywhere in the emitted object tree.
    function walk(v: unknown): void {
      if (typeof v === 'bigint') {
        throw new Error('payload contains a raw bigint');
      }
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    }
    expect(() => walk(payload)).not.toThrow();
    expect(payload.id).toBe('99');
    expect(payload.sender_id).toBe('11');
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-032 — accountToSockets map / multi-tab
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-032 ChatGateway accountToSockets map', () => {
  test('TEST-CHAT-032 — handleDisconnect removes the socket id; deletes set when empty', () => {
    const { gateway } = build();
    // Reach inside via private map for the assertion. ChatGateway exposes
    // no public accessor today, so we type the field as `unknown` and cast.
    const map = (
      gateway as unknown as {
        accountToSockets: Map<string, Set<string>>;
      }
    ).accountToSockets;
    map.set('11', new Set(['s1', 's2']));
    gateway.handleDisconnect({
      data: { accountId: '11' },
      id: 's1',
    } as never);
    expect(map.get('11')).toEqual(new Set(['s2']));
    gateway.handleDisconnect({
      data: { accountId: '11' },
      id: 's2',
    } as never);
    expect(map.has('11')).toBe(false);
  });
});
