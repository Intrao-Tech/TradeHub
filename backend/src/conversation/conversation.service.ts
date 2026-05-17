import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { SendMessageDto } from './dto/send-message.dto';

const SYSTEM_MESSAGE_TYPE = 'SYSTEM';

type ParticipantRole = 'WORKER' | 'EMPLOYER';

// A conversation shares its primary key with its collaboration; the two
// "participants" are always the collaboration's worker + employer. Per-party
// read tracking lives on the conversation row itself.
const conversationPayload = Prisma.validator<Prisma.ConversationDefaultArgs>()({
  include: {
    collaboration: {
      include: {
        worker: { include: { client_profile: true } },
        employer: { include: { client_profile: true } },
      },
    },
    messages: {
      orderBy: { created_at: 'desc' },
      take: 1,
    },
  },
});

type ConversationPayload = Prisma.ConversationGetPayload<
  typeof conversationPayload
>;

type PartyProfile =
  ConversationPayload['collaboration']['worker']['client_profile'];

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  // ─────────────────── Participant helpers ───────────────────

  /**
   * Load the collaboration backing a conversation and assert the caller is
   * one of its two parties. Returns the caller's role + both party ids.
   * Throws 404 if the conversation/collaboration doesn't exist, 403 if the
   * caller is not a participant.
   */
  private async requireParticipant(
    conversationId: bigint,
    accountId: bigint,
  ): Promise<{
    role: ParticipantRole;
    workerId: bigint;
    employerId: bigint;
  }> {
    const collab = await this.prisma.collaboration.findUnique({
      where: { id: conversationId },
      select: { worker_id: true, employer_id: true },
    });
    if (!collab) throw new NotFoundException('Conversation not found');
    if (collab.worker_id === accountId) {
      return {
        role: 'WORKER',
        workerId: collab.worker_id,
        employerId: collab.employer_id,
      };
    }
    if (collab.employer_id === accountId) {
      return {
        role: 'EMPLOYER',
        workerId: collab.worker_id,
        employerId: collab.employer_id,
      };
    }
    throw new ForbiddenException('Not a participant in this conversation');
  }

  private toJson(
    meta: Record<string, unknown> | undefined,
  ): Prisma.InputJsonValue {
    return (meta ?? {}) as Prisma.InputJsonValue;
  }

  private describeParty(cp: PartyProfile) {
    return {
      // account_id === client_profile_id under the shared-PK model.
      account_id: cp.id,
      client_profile_id: cp.id,
      display_name: cp.display_name,
      avatar_url: cp.avatar_url,
      verification_level: cp.verification_level,
    };
  }

  private async loadConversationPayload(
    id: bigint,
  ): Promise<ConversationPayload> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      ...conversationPayload,
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  private async unreadCount(
    conversationId: bigint,
    lastReadAt: Date | null,
  ): Promise<number> {
    return this.prisma.message.count({
      where: {
        conversation_id: conversationId,
        ...(lastReadAt != null ? { created_at: { gt: lastReadAt } } : {}),
      },
    });
  }

  // ─────────────────── Collaboration-driven creation ───────────────────

  /**
   * CHAT-010..013 — Idempotently create the conversation for a collaboration.
   * The conversation shares the collaboration's primary key (1:1), so no
   * participant rows are needed — the parties are the collaboration's worker
   * + employer. Posts the auto-generated SYSTEM welcome message.
   *
   * Designed to run inside an outer Prisma transaction so a status-transition
   * rollback also rolls back the conversation.
   *
   * Returns the new conversation id, or `null` if one already existed. The
   * caller emits `conversation_created` after the outer transaction commits.
   */
  async ensureCollaborationConversation(
    tx: Prisma.TransactionClient,
    collaborationId: bigint,
  ): Promise<bigint | null> {
    const existing = await tx.conversation.findUnique({
      where: { id: collaborationId },
      select: { id: true },
    });
    if (existing) return null;

    const conv = await tx.conversation.create({
      data: { id: collaborationId, last_message_at: new Date() },
    });
    await tx.message.create({
      data: {
        conversation_id: conv.id,
        sender_id: null,
        content:
          'Collaboration confirmed. You can now message each other about the project.',
        message_type: SYSTEM_MESSAGE_TYPE,
      },
    });
    return conv.id;
  }

  /**
   * Post-commit broadcast for an auto-created collaboration conversation.
   * Call after `ensureCollaborationConversation` has returned a non-null id
   * (i.e., the outer transaction committed).
   */
  announceConversationCreated(conversationId: bigint, accountIds: bigint[]) {
    for (const accountId of accountIds) {
      void this.chatGateway.joinConversationRoom(accountId, conversationId);
    }
    this.chatGateway.emitConversationCreated(conversationId, accountIds);
  }

  /**
   * Post a SYSTEM message into a collaboration's conversation. Used by escrow
   * / contract lifecycle code to announce events ("Milestone funded", etc.).
   *
   * No-op (returns null) if the collaboration has no conversation yet.
   * SYSTEM messages carry `sender_id = NULL` — `message_type=SYSTEM` is what
   * marks the row as platform-issued. `_actorAccountId` is accepted for
   * call-site compatibility but no longer used (the schema allows null sender).
   */
  async postSystemMessageForCollaboration(
    collaborationId: bigint,
    content: string,
    _actorAccountId?: bigint | null,
  ): Promise<bigint | null> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: collaborationId },
      select: { id: true },
    });
    if (!conv) return null;

    const message = await this.prisma.message.create({
      data: {
        conversation_id: conv.id,
        sender_id: null,
        content,
        message_type: SYSTEM_MESSAGE_TYPE,
      },
    });
    await this.prisma.conversation.update({
      where: { id: conv.id },
      data: { last_message_at: message.created_at },
    });

    // Best-effort broadcast — gateway may not be available in tests.
    try {
      this.chatGateway.emitNewMessage(conv.id, {
        id: message.id,
        conversation_id: conv.id,
        sender_id: null,
        content,
        message_type: SYSTEM_MESSAGE_TYPE,
        created_at: message.created_at,
      });
    } catch {
      // ignore — broadcast is non-critical for escrow correctness
    }
    return message.id;
  }

  // ─────────────────── Read API ───────────────────

  async getInbox(accountId: bigint, query: ConversationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ConversationWhereInput = {
      collaboration: {
        OR: [{ worker_id: accountId }, { employer_id: accountId }],
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        ...conversationPayload,
        orderBy: { last_message_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    const items = await Promise.all(
      rows.map(async (conv) => {
        const isWorker = conv.collaboration.worker_id === accountId;
        const lastReadAt = isWorker
          ? conv.worker_last_read_at
          : conv.employer_last_read_at;
        const other = isWorker
          ? this.describeParty(conv.collaboration.employer.client_profile)
          : this.describeParty(conv.collaboration.worker.client_profile);
        return {
          conversation: {
            id: conv.id,
            collaboration_id: conv.id,
            last_message_at: conv.last_message_at,
            created_at: conv.created_at,
          },
          collaboration: {
            id: conv.collaboration.id,
            worker_id: conv.collaboration.worker_id,
            employer_id: conv.collaboration.employer_id,
          },
          other_participant: other,
          last_message: conv.messages[0] ?? null,
          unread_count: await this.unreadCount(conv.id, lastReadAt),
        };
      }),
    );

    return { items, total, page, limit };
  }

  async getMessages(
    conversationId: bigint,
    accountId: bigint,
    query: MessageQueryDto,
  ) {
    const { role } = await this.requireParticipant(conversationId, accountId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const beforeFilter =
      query.before != null && query.before !== ''
        ? { created_at: { lt: new Date(query.before) } as const }
        : {};

    const where: Prisma.MessageWhereInput = {
      conversation_id: conversationId,
      ...beforeFilter,
    };

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.message.count({ where }),
    ]);

    // Opening the thread marks it read for the caller's role.
    const now = new Date();
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data:
        role === 'WORKER'
          ? { worker_last_read_at: now }
          : { employer_last_read_at: now },
    });

    return { items: messages, total, page, limit };
  }

  async getById(conversationId: bigint, accountId: bigint) {
    await this.requireParticipant(conversationId, accountId);
    return this.loadConversationPayload(conversationId);
  }

  async sendMessage(
    conversationId: bigint,
    senderId: bigint,
    dto: SendMessageDto,
  ) {
    const content = typeof dto.content === 'string' ? dto.content : '';
    const hasFile =
      typeof dto.file_url === 'string' && dto.file_url.trim().length > 0;
    if (content.trim().length === 0 && !hasFile) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Message content or attachment is required.',
      });
    }

    await this.requireParticipant(conversationId, senderId);

    // Note: post-Contracts refactor, chat persists at relationship level
    // and is never read-only — even after a Contract ends, parties keep
    // talking (Upwork model). Read-only gating moved into Contract status.

    const now = new Date();
    const messageType = dto.message_type ?? (hasFile ? 'FILE' : 'TEXT');
    const baseMetadata: Record<string, unknown> = { ...(dto.metadata ?? {}) };
    if (dto.client_id) baseMetadata.client_id = dto.client_id;
    const metadata = this.toJson(baseMetadata);

    const msg = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          conversation_id: conversationId,
          sender_id: senderId,
          content: content.trim().length > 0 ? content : null,
          message_type: messageType,
          file_url: hasFile ? dto.file_url : null,
          original_name: hasFile ? (dto.original_name ?? null) : null,
          mime_type: hasFile ? (dto.mime_type ?? null) : null,
          size_bytes: hasFile ? (dto.size_bytes ?? null) : null,
          metadata,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: now },
      });
      return m;
    });

    this.chatGateway.emitNewMessage(
      conversationId,
      msg as unknown as Record<string, unknown>,
    );
    return this.loadConversationPayload(conversationId);
  }

  async markRead(conversationId: bigint, accountId: bigint) {
    const { role } = await this.requireParticipant(conversationId, accountId);
    const now = new Date();
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data:
        role === 'WORKER'
          ? { worker_last_read_at: now }
          : { employer_last_read_at: now },
    });
    this.chatGateway.emitMessageRead(conversationId, accountId, now);
    return { ok: true as const, last_read_at: now };
  }

  async getUnreadCount(accountId: bigint): Promise<{ total: number }> {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        collaboration: {
          OR: [{ worker_id: accountId }, { employer_id: accountId }],
        },
      },
      select: {
        id: true,
        worker_last_read_at: true,
        employer_last_read_at: true,
        collaboration: { select: { worker_id: true } },
      },
    });

    const counts = await Promise.all(
      conversations.map((c) => {
        const isWorker = c.collaboration.worker_id === accountId;
        return this.unreadCount(
          c.id,
          isWorker ? c.worker_last_read_at : c.employer_last_read_at,
        );
      }),
    );

    return { total: counts.reduce((a, b) => a + b, 0) };
  }
}
