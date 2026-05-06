// TEST-CHAT-020 / TEST-CHAT-021 — Attachment upload + send-message
// binding contract (CHAT-040..CHAT-041).
//
// The spec says "ConversationService.uploadAttachment()" but the actual
// production code splits responsibilities: `MessageAttachmentService.
// uploadOrphan()` validates + persists the orphan row, and
// `ConversationService.sendMessage()` calls
// `MessageAttachmentService.wireOrphans()` to bind a list of orphan ids
// to the freshly-created message. Both seams are tested here so the
// `CHAT-040` / `CHAT-041` clauses fail loud if either side regresses.

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { ConversationService } from './conversation.service';
import { ChatGateway } from './chat.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { MessageAttachmentService } from '../message-attachment/message-attachment.service';

type Multer = Parameters<MessageAttachmentService['uploadOrphan']>[3];

type MockedDeps = {
  conversation: ConversationService;
  attachments: MessageAttachmentService;
  prisma: DeepMockProxy<PrismaService>;
  gateway: DeepMockProxy<ChatGateway>;
};

function build(): MockedDeps {
  const prisma = mockDeep<PrismaService>();
  const gateway = mockDeep<ChatGateway>();
  const attachments = new MessageAttachmentService(prisma);
  prisma.$transaction.mockImplementation(((cb: unknown) => {
    if (typeof cb === 'function') {
      return Promise.resolve(
        (cb as (tx: typeof prisma) => unknown)(prisma),
      );
    }
    return Promise.resolve(cb);
  }) as unknown as typeof prisma.$transaction);
  // Avoid the onModuleInit disk side-effect when constructed standalone.
  (attachments as { onModuleInit?: () => void }).onModuleInit = () => {};
  const conversation = new ConversationService(prisma, gateway, attachments);
  return { conversation, attachments, prisma, gateway };
}

const SENDER_ID = 11n;
const OTHER_ID = 22n;

function fakeFile(overrides: Partial<Record<string, unknown>> = {}): Multer {
  return {
    filename: (overrides.filename as string) ?? `f-${Math.random()}.png`,
    originalname: (overrides.originalname as string) ?? 'test.png',
    mimetype: (overrides.mimetype as string) ?? 'image/png',
    size: (overrides.size as number) ?? 12_345,
    fieldname: 'file',
    encoding: '7bit',
    destination: '/tmp',
    path: '/tmp/x.png',
    stream: undefined as never,
    buffer: Buffer.from(''),
  } as unknown as Multer;
}

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-020 — uploadOrphan() — CHAT-040 (MIME + size + state)
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-020 MessageAttachmentService.uploadOrphan() — CHAT-040', () => {
  beforeAll(() => {
    // Make tryUnlinkUpload's existsSync no-op without touching disk.
  });

  test('TEST-CHAT-020 / CHAT-040 — valid PNG persists row with message_id=null', async () => {
    const { attachments, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
      account_id: SENDER_ID,
    } as never);
    prisma.messageAttachment.count.mockResolvedValueOnce(0 as never);
    prisma.messageAttachment.create.mockResolvedValueOnce({
      id: 1n,
      message_id: null,
      uploaded_by_id: SENDER_ID,
      file_url: '/uploads/message-attachments/x.png',
      original_name: 'test.png',
      mime_type: 'image/png',
      size_bytes: 100,
      created_at: new Date(),
    } as never);
    const out = await attachments.uploadOrphan(
      1n,
      SENDER_ID,
      SENDER_ID,
      fakeFile({ size: 100, mimetype: 'image/png' }),
    );
    expect(prisma.messageAttachment.create).toHaveBeenCalledTimes(1);
    const args = prisma.messageAttachment.create.mock.calls[0][0] as {
      data: { message_id?: unknown };
    };
    expect(args.data.message_id).toBeUndefined();
    expect(out.id).toBe('1');
  });

  test('TEST-CHAT-020 / CHAT-040 — image > 10 MB → FILE_TOO_LARGE', async () => {
    const { attachments, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValue({
      account_id: SENDER_ID,
    } as never);
    const overImage = 11 * 1024 * 1024;
    const promise = attachments.uploadOrphan(
      1n,
      SENDER_ID,
      SENDER_ID,
      fakeFile({ size: overImage, mimetype: 'image/png' }),
    );
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'FILE_TOO_LARGE' },
    });
  });

  test('TEST-CHAT-020 / CHAT-040 — PDF > 25 MB → FILE_TOO_LARGE', async () => {
    const { attachments, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValue({
      account_id: SENDER_ID,
    } as never);
    const overPdf = 26 * 1024 * 1024;
    await expect(
      attachments.uploadOrphan(
        1n,
        SENDER_ID,
        SENDER_ID,
        fakeFile({ size: overPdf, mimetype: 'application/pdf' }),
      ),
    ).rejects.toMatchObject({ response: { code: 'FILE_TOO_LARGE' } });
  });

  test('TEST-CHAT-020 / CHAT-040 — application/zip → INVALID_MIME_TYPE', async () => {
    const { attachments } = build();
    await expect(
      attachments.uploadOrphan(
        1n,
        SENDER_ID,
        SENDER_ID,
        fakeFile({ mimetype: 'application/zip' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('TEST-CHAT-020 / CHAT-040 — text/html → INVALID_MIME_TYPE', async () => {
    const { attachments } = build();
    await expect(
      attachments.uploadOrphan(
        1n,
        SENDER_ID,
        SENDER_ID,
        fakeFile({ mimetype: 'text/html' }),
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_MIME_TYPE' } });
  });

  test('TEST-CHAT-020 / CHAT-040 — non-participant uploader → ForbiddenException', async () => {
    const { attachments, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce(null);
    await expect(
      attachments.uploadOrphan(
        1n,
        OTHER_ID,
        OTHER_ID,
        fakeFile({ size: 100, mimetype: 'image/png' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ════════════════════════════════════════════════════════════════════
// TEST-CHAT-021 — sendMessage() attachment binding — CHAT-041
// ════════════════════════════════════════════════════════════════════

describe('TEST-CHAT-021 ConversationService.sendMessage() attachment binding — CHAT-041', () => {
  test('TEST-CHAT-021 — attachment_ids: [] → wireOrphans is a no-op', async () => {
    const { conversation, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
      account_id: SENDER_ID,
    } as never);
    prisma.conversation.findUnique
      .mockResolvedValueOnce({ collaboration: null } as never)
      .mockResolvedValueOnce({
        id: 1n,
        participants: [],
        messages: [],
        collaboration: null,
      } as never);
    prisma.message.create.mockResolvedValueOnce({ id: 1n } as never);
    prisma.message.findUnique.mockResolvedValueOnce({
      id: 1n,
      attachments: [],
    } as never);
    prisma.conversation.update.mockResolvedValueOnce({} as never);
    // wireOrphans not called when attachment_ids is empty (or omitted).
    // wireOrphans not called when attachment_ids is empty.
    await conversation.sendMessage(1n, SENDER_ID, {
      content: 'x',
      attachment_ids: [],
    });
    expect(prisma.messageAttachment.updateMany).not.toHaveBeenCalled();
  });

  test('TEST-CHAT-021 / CHAT-041 — valid id owned by sender + message_id NULL → updateMany binds it', async () => {
    const { conversation, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
      account_id: SENDER_ID,
    } as never);
    prisma.conversation.findUnique
      .mockResolvedValueOnce({ collaboration: null } as never)
      .mockResolvedValueOnce({
        id: 1n,
        participants: [],
        messages: [],
        collaboration: null,
      } as never);
    prisma.message.create.mockResolvedValueOnce({ id: 99n } as never);
    prisma.messageAttachment.updateMany.mockResolvedValueOnce({
      count: 1,
    } as never);
    prisma.message.findUnique.mockResolvedValueOnce({
      id: 99n,
      attachments: [],
    } as never);
    prisma.conversation.update.mockResolvedValueOnce({} as never);

    await conversation.sendMessage(1n, SENDER_ID, {
      content: 'x',
      attachment_ids: [4001],
    });

    expect(prisma.messageAttachment.updateMany).toHaveBeenCalledTimes(1);
    const args = prisma.messageAttachment.updateMany.mock.calls[0][0] as {
      where: {
        id: { in: bigint[] };
        uploaded_by_id: bigint;
        message_id: null;
      };
      data: { message_id: bigint };
    };
    expect(args.where.id.in).toEqual([4001n]);
    expect(args.where.uploaded_by_id).toBe(SENDER_ID);
    expect(args.where.message_id).toBeNull();
    expect(args.data.message_id).toBe(99n);
  });

  test('TEST-CHAT-021 / CHAT-041 — id owned by another user (updateMany matches 0) → ForbiddenException(NOT_OWNER)', async () => {
    const { conversation, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
      account_id: SENDER_ID,
    } as never);
    prisma.conversation.findUnique.mockResolvedValueOnce({
      collaboration: null,
    } as never);
    prisma.message.create.mockResolvedValueOnce({ id: 1n } as never);
    prisma.messageAttachment.updateMany.mockResolvedValueOnce({
      count: 0,
    } as never);
    await expect(
      conversation.sendMessage(1n, SENDER_ID, {
        content: 'x',
        attachment_ids: [9999],
      }),
    ).rejects.toMatchObject({ response: { code: 'NOT_OWNER' } });
  });

  test('TEST-CHAT-021 / CHAT-041 — already-attached id (updateMany matches 0) → ForbiddenException(NOT_OWNER)', async () => {
    const { conversation, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValueOnce({
      account_id: SENDER_ID,
    } as never);
    prisma.conversation.findUnique.mockResolvedValueOnce({
      collaboration: null,
    } as never);
    prisma.message.create.mockResolvedValueOnce({ id: 1n } as never);
    prisma.messageAttachment.updateMany.mockResolvedValueOnce({
      count: 0,
    } as never);
    await expect(
      conversation.sendMessage(1n, SENDER_ID, {
        content: 'x',
        attachment_ids: [4001],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
