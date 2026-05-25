// TEST-CHAT-010..015 / 040 — ConversationService unit specs.
//
// Pure-logic tests with deep-mocked Prisma + a stubbed ChatGateway.
//
// Post-2026-05 schema rework: a conversation is a strict 1:1 with a
// collaboration (shared PK). There is no participant table — the two
// participants are always the collaboration's worker + employer, and per-
// party read tracking lives in two columns on the conversation row.
// Ad-hoc / direct conversations no longer exist.

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { ConversationService } from './conversation.service';
import { ChatGateway } from './chat.gateway';
import { PrismaService } from '../prisma/prisma.service';

type MockedDeps = {
  service: ConversationService;
  prisma: DeepMockProxy<PrismaService>;
  gateway: DeepMockProxy<ChatGateway>;
};

function build(): MockedDeps {
  const prisma = mockDeep<PrismaService>();
  const gateway = mockDeep<ChatGateway>();
  // sendMessage runs `prisma.$transaction(cb)` — run the callback against
  // the deep-mocked client so the assertions see the inner writes.
  prisma.$transaction.mockImplementation(((cb: unknown) => {
    if (typeof cb === 'function') {
      return Promise.resolve((cb as (tx: typeof prisma) => unknown)(prisma));
    }
    return Promise.resolve(cb);
  }) as unknown as typeof prisma.$transaction);
  const service = new ConversationService(prisma, gateway);
  return { service, prisma, gateway };
}

const WORKER_ID = 11n;
const EMPLOYER_ID = 22n;
const OUTSIDER_ID = 99n;
const CONV_ID = 7n; // conversation.id === collaboration.id

/** A collaboration row as `requireParticipant` selects it. */
function collabParties() {
  return { worker_id: WORKER_ID, employer_id: EMPLOYER_ID };
}

/** A full conversation payload (collaboration + last message). */
function fakeConvPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID,
    last_message_at: new Date(),
    worker_last_read_at: null,
    employer_last_read_at: null,
    created_at: new Date(),
    collaboration: {
      id: CONV_ID,
      worker_id: WORKER_ID,
      employer_id: EMPLOYER_ID,
      worker: {
        client_profile: {
          id: WORKER_ID,
          display_name: 'Wendy Worker',
          avatar_url: null,
          verification_level: 'VERIFIED',
        },
      },
      employer: {
        client_profile: {
          id: EMPLOYER_ID,
          display_name: 'Ed Employer',
          avatar_url: null,
          verification_level: 'UNVERIFIED',
        },
      },
    },
    messages: [],
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-040 — ensureCollaborationConversation()
// ════════════════════════════════════════════════════════════════════
describe('TEST-CHAT-040 ConversationService.ensureCollaborationConversation()', () => {
  test('creates the conversation (shared PK) + a SYSTEM welcome message', async () => {
    const { service, prisma } = build();
    prisma.conversation.findUnique.mockResolvedValueOnce(null as never);
    prisma.conversation.create.mockResolvedValueOnce({ id: CONV_ID } as never);
    prisma.message.create.mockResolvedValueOnce({ id: 1n } as never);

    const id = await service.ensureCollaborationConversation(prisma, CONV_ID);

    expect(id).toBe(CONV_ID);
    // conversation.id is the collaboration id (shared PK).
    const createArgs = prisma.conversation.create.mock.calls[0][0] as {
      data: { id: bigint };
    };
    expect(createArgs.data.id).toBe(CONV_ID);
    const msgArgs = prisma.message.create.mock.calls[0][0] as {
      data: {
        conversation_id: bigint;
        sender_id: bigint | null;
        message_type: string;
      };
    };
    expect(msgArgs.data.conversation_id).toBe(CONV_ID);
    expect(msgArgs.data.sender_id).toBeNull();
    expect(msgArgs.data.message_type).toBe('SYSTEM');
  });

  test('idempotent — existing conversation returns null, no create', async () => {
    const { service, prisma } = build();
    prisma.conversation.findUnique.mockResolvedValueOnce({
      id: CONV_ID,
    } as never);

    const id = await service.ensureCollaborationConversation(prisma, CONV_ID);

    expect(id).toBeNull();
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-040b — announceConversationCreated()
// ════════════════════════════════════════════════════════════════════
describe('TEST-CHAT-040b ConversationService.announceConversationCreated()', () => {
  test('joins each account socket room and emits conversation_created', () => {
    const { service, gateway } = build();
    service.announceConversationCreated(CONV_ID, [WORKER_ID, EMPLOYER_ID]);
    expect(gateway.joinConversationRoom).toHaveBeenCalledWith(
      WORKER_ID,
      CONV_ID,
    );
    expect(gateway.joinConversationRoom).toHaveBeenCalledWith(
      EMPLOYER_ID,
      CONV_ID,
    );
    expect(gateway.emitConversationCreated).toHaveBeenCalledWith(CONV_ID, [
      WORKER_ID,
      EMPLOYER_ID,
    ]);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-041 — postSystemMessageForCollaboration()
// ════════════════════════════════════════════════════════════════════
describe('TEST-CHAT-041 ConversationService.postSystemMessageForCollaboration()', () => {
  test('posts a SYSTEM message (null sender) + bumps last_message_at', async () => {
    const { service, prisma } = build();
    prisma.conversation.findUnique.mockResolvedValueOnce({
      id: CONV_ID,
    } as never);
    prisma.message.create.mockResolvedValueOnce({
      id: 5n,
      created_at: new Date(),
    } as never);

    const id = await service.postSystemMessageForCollaboration(
      CONV_ID,
      'Milestone funded',
    );

    expect(id).toBe(5n);
    const msgArgs = prisma.message.create.mock.calls[0][0] as {
      data: { sender_id: bigint | null; message_type: string };
    };
    expect(msgArgs.data.sender_id).toBeNull();
    expect(msgArgs.data.message_type).toBe('SYSTEM');
    expect(prisma.conversation.update).toHaveBeenCalled();
  });

  test('no-op (returns null) when the collaboration has no conversation', async () => {
    const { service, prisma } = build();
    prisma.conversation.findUnique.mockResolvedValueOnce(null as never);

    const id = await service.postSystemMessageForCollaboration(
      CONV_ID,
      'whatever',
    );

    expect(id).toBeNull();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-011 — getInbox()
// ════════════════════════════════════════════════════════════════════
describe('TEST-CHAT-011 ConversationService.getInbox()', () => {
  test('returns one item per conversation with the other party + unread count', async () => {
    const { service, prisma } = build();
    prisma.conversation.findMany.mockResolvedValueOnce([
      fakeConvPayload(),
    ] as never);
    prisma.conversation.count.mockResolvedValueOnce(1 as never);
    prisma.message.count.mockResolvedValue(3 as never);

    const out = await service.getInbox(WORKER_ID, {});

    expect(out.total).toBe(1);
    expect(out.items).toHaveLength(1);
    // The worker's "other party" is the employer.
    expect(out.items[0].other_participant.display_name).toBe('Ed Employer');
    expect(out.items[0].unread_count).toBe(3);
  });

  test('orders by last_message_at desc and round-trips pagination', async () => {
    const { service, prisma } = build();
    prisma.conversation.findMany.mockResolvedValueOnce([] as never);
    prisma.conversation.count.mockResolvedValueOnce(0 as never);

    const out = await service.getInbox(WORKER_ID, { page: 2, limit: 10 });

    const args = prisma.conversation.findMany.mock.calls[0][0] as {
      orderBy: { last_message_at: string };
      skip: number;
      take: number;
    };
    expect(args.orderBy).toEqual({ last_message_at: 'desc' });
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(out.page).toBe(2);
    expect(out.limit).toBe(10);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-012 — getMessages()
// ════════════════════════════════════════════════════════════════════
describe('TEST-CHAT-012 ConversationService.getMessages()', () => {
  test('non-participant → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(
      collabParties() as never,
    );
    await expect(
      service.getMessages(CONV_ID, OUTSIDER_ID, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('missing conversation → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(null as never);
    await expect(
      service.getMessages(CONV_ID, WORKER_ID, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('participant → returns messages and marks the thread read for the role', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(
      collabParties() as never,
    );
    prisma.message.findMany.mockResolvedValueOnce([
      { id: 1n, content: 'hi' },
    ] as never);
    prisma.message.count.mockResolvedValueOnce(1 as never);

    const out = await service.getMessages(CONV_ID, WORKER_ID, {});

    expect(out.items).toHaveLength(1);
    // Worker opened the thread → worker_last_read_at is stamped.
    const updateArgs = prisma.conversation.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(updateArgs.data)).toEqual(['worker_last_read_at']);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-013 — sendMessage()
// ════════════════════════════════════════════════════════════════════
describe('TEST-CHAT-013 ConversationService.sendMessage()', () => {
  test('non-participant → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(
      collabParties() as never,
    );
    await expect(
      service.sendMessage(CONV_ID, OUTSIDER_ID, { content: 'hi' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('persists the message, bumps last_message_at, emits new_message once', async () => {
    const { service, prisma, gateway } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(
      collabParties() as never,
    );
    prisma.message.create.mockResolvedValueOnce({
      id: 50n,
      content: 'hello',
    } as never);
    prisma.conversation.findUnique.mockResolvedValueOnce(
      fakeConvPayload() as never,
    );

    await service.sendMessage(CONV_ID, WORKER_ID, { content: 'hello' });

    const msgArgs = prisma.message.create.mock.calls[0][0] as {
      data: { conversation_id: bigint; sender_id: bigint; content: string };
    };
    expect(msgArgs.data.conversation_id).toBe(CONV_ID);
    expect(msgArgs.data.sender_id).toBe(WORKER_ID);
    expect(prisma.conversation.update).toHaveBeenCalled();
    expect(gateway.emitNewMessage).toHaveBeenCalledTimes(1);
  });

  test('client_id round-trips into metadata for echo-back reconciliation', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(
      collabParties() as never,
    );
    prisma.message.create.mockResolvedValueOnce({ id: 51n } as never);
    prisma.conversation.findUnique.mockResolvedValueOnce(
      fakeConvPayload() as never,
    );

    await service.sendMessage(CONV_ID, EMPLOYER_ID, {
      content: 'with id',
      client_id: 'abc-123',
    });

    const msgArgs = prisma.message.create.mock.calls[0][0] as {
      data: { metadata: { client_id?: string } };
    };
    expect(msgArgs.data.metadata.client_id).toBe('abc-123');
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-014 — markRead()
// ════════════════════════════════════════════════════════════════════
describe('TEST-CHAT-014 ConversationService.markRead()', () => {
  test('updates the role read column and emits message_read', async () => {
    const { service, prisma, gateway } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(
      collabParties() as never,
    );

    const out = await service.markRead(CONV_ID, EMPLOYER_ID);

    expect(out.ok).toBe(true);
    const updateArgs = prisma.conversation.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    // Employer marked read → employer_last_read_at column.
    expect(Object.keys(updateArgs.data)).toEqual(['employer_last_read_at']);
    expect(gateway.emitMessageRead).toHaveBeenCalled();
  });

  test('non-participant → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.collaboration.findUnique.mockResolvedValueOnce(
      collabParties() as never,
    );
    await expect(service.markRead(CONV_ID, OUTSIDER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-015 — getUnreadCount()
// ════════════════════════════════════════════════════════════════════
describe('TEST-CHAT-015 ConversationService.getUnreadCount()', () => {
  test('sums unread across every conversation the user is a party of', async () => {
    const { service, prisma } = build();
    prisma.conversation.findMany.mockResolvedValueOnce([
      {
        id: 1n,
        worker_last_read_at: null,
        employer_last_read_at: null,
        collaboration: { worker_id: WORKER_ID },
      },
      {
        id: 2n,
        worker_last_read_at: null,
        employer_last_read_at: null,
        collaboration: { worker_id: WORKER_ID },
      },
    ] as never);
    prisma.message.count.mockResolvedValueOnce(2 as never);
    prisma.message.count.mockResolvedValueOnce(5 as never);

    const out = await service.getUnreadCount(WORKER_ID);

    expect(out.total).toBe(7);
  });

  test('empty conversation list → total 0', async () => {
    const { service, prisma } = build();
    prisma.conversation.findMany.mockResolvedValueOnce([] as never);
    const out = await service.getUnreadCount(WORKER_ID);
    expect(out.total).toBe(0);
  });
});
