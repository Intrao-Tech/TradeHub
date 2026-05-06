// TEST-CHAT-010..015 — ConversationService unit specs.
//
// Pure-logic tests with deep-mocked Prisma + a stubbed ChatGateway.
// Each test cites the CHAT-NNN clause from `tasks/done/chat/spec.md`
// it guards. Scope: the service-layer contract for direct conversations,
// inbox shape, message pagination + read state, and unread totals.
// REST + WS surfaces are covered by the e2e suites.

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { ConversationService } from './conversation.service';
import { ChatGateway } from './chat.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { MessageAttachmentService } from '../message-attachment/message-attachment.service';

type MockedDeps = {
  service: ConversationService;
  prisma: DeepMockProxy<PrismaService>;
  gateway: DeepMockProxy<ChatGateway>;
  attachments: DeepMockProxy<MessageAttachmentService>;
};

function build(): MockedDeps {
  const prisma = mockDeep<PrismaService>();
  const gateway = mockDeep<ChatGateway>();
  const attachments = mockDeep<MessageAttachmentService>();
  // sendMessage runs `prisma.$transaction(cb)` — mirror the collab-service
  // test pattern so the callback runs against the deep-mocked client.
  prisma.$transaction.mockImplementation(((cb: unknown) => {
    if (typeof cb === 'function') {
      return Promise.resolve((cb as (tx: typeof prisma) => unknown)(prisma));
    }
    return Promise.resolve(cb);
  }) as unknown as typeof prisma.$transaction);
  attachments.wireOrphans.mockResolvedValue(undefined);
  const service = new ConversationService(prisma, gateway, attachments);
  return { service, prisma, gateway, attachments };
}

const SENDER_ID = 11n;
const RECIPIENT_ID = 22n;
const OUTSIDER_ID = 99n;

function fakeConvWithIncludes(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? 7n,
    collaboration_id: overrides.collaboration_id ?? null,
    last_message_at: overrides.last_message_at ?? new Date(),
    created_at: new Date(),
    participants: overrides.participants ?? [],
    messages: overrides.messages ?? [],
    collaboration: overrides.collaboration ?? null,
  };
}

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-010 — startConversation()
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-010 ConversationService.startConversation() — CHAT-030', () => {
  test('TEST-CHAT-010 / CHAT-030 — sender === recipient → BadRequestException', async () => {
    const { service } = build();
    await expect(
      service.startConversation(SENDER_ID, {
        recipient_id: Number(SENDER_ID),
        message: 'hi',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('TEST-CHAT-010 / CHAT-030 — recipient missing → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.account.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.startConversation(SENDER_ID, {
        recipient_id: Number(RECIPIENT_ID),
        message: 'hi',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('TEST-CHAT-010 / CHAT-030 — happy path: creates conversation + 2 participants + first message + bumps last_message_at', async () => {
    const { service, prisma, gateway } = build();
    prisma.account.findUnique.mockResolvedValueOnce({
      id: RECIPIENT_ID,
    } as never);
    prisma.conversation.findFirst.mockResolvedValueOnce(null); // no existing direct
    prisma.conversation.create.mockResolvedValueOnce({ id: 1n } as never);
    prisma.conversationParticipant.createMany.mockResolvedValueOnce({
      count: 2,
    } as never);
    const persisted = {
      id: 100n,
      conversation_id: 1n,
      sender_id: SENDER_ID,
      content: 'hi',
      created_at: new Date(),
      attachments: [],
    };
    prisma.message.create.mockResolvedValueOnce(persisted as never);
    prisma.conversation.update.mockResolvedValueOnce(
      fakeConvWithIncludes({ id: 1n }) as never,
    );

    await service.startConversation(SENDER_ID, {
      recipient_id: Number(RECIPIENT_ID),
      message: 'hi',
    });

    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
    expect(prisma.conversationParticipant.createMany).toHaveBeenCalledTimes(1);
    const partArgs =
      prisma.conversationParticipant.createMany.mock.calls[0][0]?.data;
    expect(Array.isArray(partArgs) ? partArgs : [partArgs]).toHaveLength(2);
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    const msgArgs = prisma.message.create.mock.calls[0][0] as {
      data: { content: string; message_type: string };
    };
    expect(msgArgs.data.content).toBe('hi');
    expect(msgArgs.data.message_type).toBe('TEXT');
    // Bumps last_message_at on the conversation.
    expect(prisma.conversation.update).toHaveBeenCalled();
    // Emits new_message via the gateway.
    expect(gateway.emitNewMessage).toHaveBeenCalledTimes(1);
  });

  test('TEST-CHAT-010 / CHAT-030 — existing direct conversation reused; appends message; no new participants', async () => {
    const { service, prisma } = build();
    prisma.account.findUnique.mockResolvedValueOnce({
      id: RECIPIENT_ID,
    } as never);
    prisma.conversation.findFirst.mockResolvedValueOnce({ id: 5n } as never);
    prisma.message.create.mockResolvedValueOnce({
      id: 200n,
      created_at: new Date(),
      attachments: [],
    } as never);
    prisma.conversation.update.mockResolvedValueOnce({} as never);
    prisma.conversation.findUnique.mockResolvedValueOnce(
      fakeConvWithIncludes({ id: 5n }) as never,
    );
    await service.startConversation(SENDER_ID, {
      recipient_id: Number(RECIPIENT_ID),
      message: 'second',
    });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(prisma.conversationParticipant.createMany).not.toHaveBeenCalled();
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });

  test('TEST-CHAT-010 / CHAT-030 — message_type defaults to TEXT', async () => {
    const { service, prisma } = build();
    prisma.account.findUnique.mockResolvedValueOnce({
      id: RECIPIENT_ID,
    } as never);
    prisma.conversation.findFirst.mockResolvedValueOnce({ id: 5n } as never);
    prisma.message.create.mockResolvedValueOnce({
      id: 1n,
      attachments: [],
    } as never);
    prisma.conversation.update.mockResolvedValueOnce({} as never);
    prisma.conversation.findUnique.mockResolvedValueOnce(
      fakeConvWithIncludes() as never,
    );
    await service.startConversation(SENDER_ID, {
      recipient_id: Number(RECIPIENT_ID),
      message: 'x',
    });
    const args = prisma.message.create.mock.calls[0][0] as {
      data: { message_type: string };
    };
    expect(args.data.message_type).toBe('TEXT');
  });

  test('TEST-CHAT-010 / CHAT-030 — metadata round-trips as InputJsonValue', async () => {
    const { service, prisma } = build();
    prisma.account.findUnique.mockResolvedValueOnce({
      id: RECIPIENT_ID,
    } as never);
    prisma.conversation.findFirst.mockResolvedValueOnce({ id: 5n } as never);
    prisma.message.create.mockResolvedValueOnce({
      id: 1n,
      attachments: [],
    } as never);
    prisma.conversation.update.mockResolvedValueOnce({} as never);
    prisma.conversation.findUnique.mockResolvedValueOnce(
      fakeConvWithIncludes() as never,
    );
    await service.startConversation(SENDER_ID, {
      recipient_id: Number(RECIPIENT_ID),
      message: 'x',
      metadata: { job_post_id: 123 },
    });
    const args = prisma.message.create.mock.calls[0][0] as {
      data: { metadata: Record<string, unknown> };
    };
    expect(args.data.metadata).toMatchObject({ job_post_id: 123 });
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-011 — getInbox()
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-011 ConversationService.getInbox() — CHAT-050 / CHAT-051', () => {
  function inboxRow(overrides: Record<string, unknown> = {}) {
    return {
      conversation_id: overrides.conversation_id ?? 1n,
      account_id: SENDER_ID,
      last_read_at: overrides.last_read_at ?? null,
      conversation: {
        id: overrides.conversation_id ?? 1n,
        collaboration_id: null,
        last_message_at: overrides.last_message_at ?? new Date(),
        created_at: new Date(),
        participants: overrides.participants ?? [
          { account_id: SENDER_ID, account: { client_profile: null } },
          {
            account_id: RECIPIENT_ID,
            account: {
              client_profile: {
                id: RECIPIENT_ID,
                display_name: 'Other',
                avatar_url: null,
                verification_level: 'BASIC',
              },
            },
          },
        ],
        messages: overrides.messages ?? [],
        collaboration: null,
      },
    };
  }

  test('TEST-CHAT-011 / CHAT-051 — orderBy last_message_at desc passed to Prisma', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findMany.mockResolvedValueOnce([] as never);
    prisma.conversationParticipant.count.mockResolvedValueOnce(0 as never);
    await service.getInbox(SENDER_ID, {});
    const args = prisma.conversationParticipant.findMany.mock.calls[0][0] as {
      orderBy: { conversation: { last_message_at: 'desc' } };
    };
    expect(args.orderBy.conversation.last_message_at).toBe('desc');
  });

  test('TEST-CHAT-011 — unread_count uses last_read_at; null counts every message', async () => {
    const { service, prisma } = build();
    const row = inboxRow();
    prisma.conversationParticipant.findMany.mockResolvedValueOnce([
      row,
    ] as never);
    prisma.conversationParticipant.count.mockResolvedValueOnce(1 as never);
    prisma.message.count.mockResolvedValueOnce(7 as never);
    const out = await service.getInbox(SENDER_ID, {});
    expect(out.items).toHaveLength(1);
    expect(out.items[0].unread_count).toBe(7);
    const where = prisma.message.count.mock.calls[0][0]?.where as {
      conversation_id: bigint;
      created_at?: { gt: Date };
    };
    expect(where.conversation_id).toBe(1n);
    expect(where.created_at).toBeUndefined();
  });

  test('TEST-CHAT-011 — last_read_at set → only messages newer than that count', async () => {
    const { service, prisma } = build();
    const cursor = new Date('2026-01-01T00:00:00Z');
    prisma.conversationParticipant.findMany.mockResolvedValueOnce([
      inboxRow({ last_read_at: cursor }),
    ] as never);
    prisma.conversationParticipant.count.mockResolvedValueOnce(1 as never);
    prisma.message.count.mockResolvedValueOnce(2 as never);
    await service.getInbox(SENDER_ID, {});
    const where = prisma.message.count.mock.calls[0][0]?.where as {
      created_at?: { gt: Date };
    };
    expect(where.created_at?.gt).toEqual(cursor);
  });

  test('TEST-CHAT-011 — pagination defaults page=1 limit=20', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findMany.mockResolvedValueOnce([] as never);
    prisma.conversationParticipant.count.mockResolvedValueOnce(0 as never);
    await service.getInbox(SENDER_ID, {});
    const args = prisma.conversationParticipant.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(0);
    expect(args.take).toBe(20);
  });

  test('TEST-CHAT-011 — page/limit propagate to skip/take and round-trip on response', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findMany.mockResolvedValueOnce([] as never);
    prisma.conversationParticipant.count.mockResolvedValueOnce(0 as never);
    const out = await service.getInbox(SENDER_ID, { page: 3, limit: 10 });
    const args = prisma.conversationParticipant.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
    expect(out.page).toBe(3);
    expect(out.limit).toBe(10);
  });

  test('TEST-CHAT-011 — other_participant is the sole non-self participant', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findMany.mockResolvedValueOnce([
      inboxRow(),
    ] as never);
    prisma.conversationParticipant.count.mockResolvedValueOnce(1 as never);
    prisma.message.count.mockResolvedValueOnce(0 as never);
    const out = await service.getInbox(SENDER_ID, {});
    expect(out.items[0].other_participant?.account_id).toBe(RECIPIENT_ID);
    expect(out.items[0].other_participant?.display_name).toBe('Other');
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-012 — getMessages()
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-012 ConversationService.getMessages() — CHAT-061 / CHAT-032', () => {
  test('TEST-CHAT-012 — non-participant → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.getMessages(1n, OUTSIDER_ID, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('TEST-CHAT-012 — `before` cursor filters strictly older messages', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
      account_id: SENDER_ID,
    } as never);
    prisma.message.findMany.mockResolvedValueOnce([] as never);
    prisma.message.count.mockResolvedValueOnce(0 as never);
    prisma.conversationParticipant.update.mockResolvedValueOnce({} as never);
    await service.getMessages(1n, SENDER_ID, {
      before: '2026-04-01T00:00:00Z',
    });
    const args = prisma.message.findMany.mock.calls[0][0] as {
      where: { created_at?: { lt: Date } };
    };
    expect(args.where.created_at?.lt).toEqual(new Date('2026-04-01T00:00:00Z'));
  });

  test('TEST-CHAT-012 / CHAT-032 — mark-read updates last_read_at on the participant row to now()', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
      account_id: SENDER_ID,
    } as never);
    prisma.message.findMany.mockResolvedValueOnce([] as never);
    prisma.message.count.mockResolvedValueOnce(0 as never);
    prisma.conversationParticipant.update.mockResolvedValueOnce({} as never);
    const before = Date.now();
    await service.getMessages(1n, SENDER_ID, {});
    const after = Date.now();
    expect(prisma.conversationParticipant.update).toHaveBeenCalledTimes(1);
    const args = prisma.conversationParticipant.update.mock.calls[0][0] as {
      data: { last_read_at: Date };
    };
    const ts = args.data.last_read_at.getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 1);
  });

  test('TEST-CHAT-012 — pagination defaults page=1 limit=50', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
      account_id: SENDER_ID,
    } as never);
    prisma.message.findMany.mockResolvedValueOnce([] as never);
    prisma.message.count.mockResolvedValueOnce(0 as never);
    prisma.conversationParticipant.update.mockResolvedValueOnce({} as never);
    await service.getMessages(1n, SENDER_ID, {});
    const args = prisma.message.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(0);
    expect(args.take).toBe(50);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-013 — sendMessage()
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-013 ConversationService.sendMessage() — CHAT-030', () => {
  test('TEST-CHAT-013 — non-participant → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.sendMessage(1n, OUTSIDER_ID, { content: 'hi' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('TEST-CHAT-013 — REJECTED collab → ForbiddenException(COLLABORATION_REJECTED)', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
      account_id: SENDER_ID,
    } as never);
    prisma.conversation.findUnique.mockResolvedValueOnce({
      collaboration: { status: 'REJECTED' },
    } as never);
    const promise = service.sendMessage(1n, SENDER_ID, { content: 'hi' });
    await expect(promise).rejects.toBeInstanceOf(ForbiddenException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'COLLABORATION_REJECTED' },
    });
  });

  test('TEST-CHAT-013 — happy path persists message + bumps last_message_at + emits new_message exactly once', async () => {
    const { service, prisma, gateway } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
      account_id: SENDER_ID,
    } as never);
    prisma.conversation.findUnique
      .mockResolvedValueOnce({
        collaboration: { status: 'CONFIRMED' },
      } as never)
      .mockResolvedValueOnce(fakeConvWithIncludes() as never);
    prisma.message.create.mockResolvedValueOnce({
      id: 11n,
      conversation_id: 1n,
      sender_id: SENDER_ID,
      created_at: new Date(),
    } as never);
    prisma.message.findUnique.mockResolvedValueOnce({
      id: 11n,
      attachments: [],
    } as never);
    prisma.conversation.update.mockResolvedValueOnce({} as never);

    await service.sendMessage(1n, SENDER_ID, { content: 'hi' });
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.update).toHaveBeenCalledTimes(1);
    expect(gateway.emitNewMessage).toHaveBeenCalledTimes(1);
  });

  test('TEST-CHAT-013 — client_id round-trips into metadata for echo-back reconciliation', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
      account_id: SENDER_ID,
    } as never);
    prisma.conversation.findUnique
      .mockResolvedValueOnce({ collaboration: null } as never)
      .mockResolvedValueOnce(fakeConvWithIncludes() as never);
    prisma.message.create.mockResolvedValueOnce({ id: 1n } as never);
    prisma.message.findUnique.mockResolvedValueOnce({
      id: 1n,
      attachments: [],
    } as never);
    prisma.conversation.update.mockResolvedValueOnce({} as never);
    await service.sendMessage(1n, SENDER_ID, {
      content: 'x',
      client_id: 'uuid-1',
    });
    const args = prisma.message.create.mock.calls[0][0] as {
      data: { metadata: { client_id?: string } };
    };
    expect(args.data.metadata.client_id).toBe('uuid-1');
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-014 — markRead()
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-014 ConversationService.markRead() — CHAT-032', () => {
  test('TEST-CHAT-014 — updates last_read_at to now() and emits message_read', async () => {
    const { service, prisma, gateway } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
      account_id: SENDER_ID,
    } as never);
    prisma.conversationParticipant.update.mockResolvedValueOnce({} as never);
    const before = Date.now();
    const out = await service.markRead(7n, SENDER_ID);
    const after = Date.now();
    expect(prisma.conversationParticipant.update).toHaveBeenCalledTimes(1);
    expect(gateway.emitMessageRead).toHaveBeenCalledWith(
      7n,
      SENDER_ID,
      expect.any(Date),
    );
    expect(out.ok).toBe(true);
    expect(out.last_read_at.getTime()).toBeGreaterThanOrEqual(before);
    expect(out.last_read_at.getTime()).toBeLessThanOrEqual(after + 1);
  });

  test('TEST-CHAT-014 — non-participant → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce(null);
    await expect(service.markRead(7n, OUTSIDER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-015 — getUnreadCount()
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-015 ConversationService.getUnreadCount() — CHAT-070', () => {
  test('TEST-CHAT-015 — sum across all participant rows', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findMany.mockResolvedValueOnce([
      { conversation_id: 1n, last_read_at: null },
      { conversation_id: 2n, last_read_at: new Date('2026-01-01') },
    ] as never);
    prisma.message.count
      .mockResolvedValueOnce(3 as never)
      .mockResolvedValueOnce(2 as never);
    const out = await service.getUnreadCount(SENDER_ID);
    expect(out.total).toBe(5);
  });

  test('TEST-CHAT-015 — last_read_at === null counts every message', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findMany.mockResolvedValueOnce([
      { conversation_id: 1n, last_read_at: null },
    ] as never);
    prisma.message.count.mockResolvedValueOnce(99 as never);
    await service.getUnreadCount(SENDER_ID);
    const where = prisma.message.count.mock.calls[0][0]?.where as {
      created_at?: { gt: Date };
    };
    expect(where.created_at).toBeUndefined();
  });

  test('TEST-CHAT-015 — empty participant list → total 0', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findMany.mockResolvedValueOnce([] as never);
    const out = await service.getUnreadCount(SENDER_ID);
    expect(out.total).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-040 — ensureCollaborationConversation() (CHAT-010..013)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-040 ConversationService.ensureCollaborationConversation() — CHAT-010..013', () => {
  function txStub() {
    const tx = mockDeep<PrismaService>();
    return tx;
  }

  test('TEST-CHAT-040 / CHAT-010 — creates conversation + 2 participants + SYSTEM message', async () => {
    const { service } = build();
    const tx = txStub();
    tx.conversation.findUnique.mockResolvedValueOnce(null);
    tx.conversation.create.mockResolvedValueOnce({ id: 5n } as never);
    tx.message.create.mockResolvedValueOnce({} as never);

    const id = await service.ensureCollaborationConversation(
      tx,
      99n, // collab id
      11n, // worker
      22n, // employer
      11n, // triggered by
    );

    expect(id).toBe(5n);
    const create = tx.conversation.create.mock.calls[0][0] as {
      data: {
        collaboration_id: bigint;
        participants: { create: Array<{ account_id: bigint }> };
      };
    };
    expect(create.data.collaboration_id).toBe(99n);
    expect(create.data.participants.create.map((p) => p.account_id)).toEqual([
      11n,
      22n,
    ]);
    const msg = tx.message.create.mock.calls[0][0] as {
      data: { message_type: string; sender_id: bigint; content: string };
    };
    expect(msg.data.message_type).toBe('SYSTEM');
    expect(msg.data.sender_id).toBe(11n);
    expect(msg.data.content).toMatch(/Collaboration confirmed/);
  });

  test('TEST-CHAT-040 / CHAT-010 — idempotent: existing row returns null, no create', async () => {
    const { service } = build();
    const tx = txStub();
    tx.conversation.findUnique.mockResolvedValueOnce({ id: 5n } as never);
    const id = await service.ensureCollaborationConversation(
      tx,
      99n,
      11n,
      22n,
      22n,
    );
    expect(id).toBeNull();
    expect(tx.conversation.create).not.toHaveBeenCalled();
    expect(tx.message.create).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-040b — announceConversationCreated()
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-040b ConversationService.announceConversationCreated() — CHAT-013', () => {
  test('TEST-CHAT-040b / CHAT-013 — joins each account socket and emits conversation_created', () => {
    const { service, gateway } = build();
    service.announceConversationCreated(7n, [11n, 22n]);
    expect(gateway.joinConversationRoom).toHaveBeenCalledTimes(2);
    expect(gateway.emitConversationCreated).toHaveBeenCalledWith(7n, [
      11n,
      22n,
    ]);
  });
});
