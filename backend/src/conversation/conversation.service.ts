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
import { StartConversationDto } from './dto/start-conversation.dto';

const conversationWithParticipantsAndLastMessage =
  Prisma.validator<Prisma.ConversationDefaultArgs>()({
    include: {
      participants: {
        include: { account: { include: { client_profile: true } } },
      },
      messages: { orderBy: { created_at: 'desc' }, take: 1 },
    },
  });

type ConversationWithParticipantsAndLastMessage = Prisma.ConversationGetPayload<
  typeof conversationWithParticipantsAndLastMessage
>;

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Direct (two-person) chat: both accounts participate and every participant is one of the two.
   */
  private async findDirectConversationId(
    a: bigint,
    b: bigint,
  ): Promise<bigint | null> {
    const row = await this.prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { account_id: a } } },
          { participants: { some: { account_id: b } } },
          {
            participants: {
              every: { account_id: { in: [a, b] } },
            },
          },
        ],
      },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  private async assertParticipant(conversationId: bigint, accountId: bigint) {
    const p = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversation_id_account_id: {
          conversation_id: conversationId,
          account_id: accountId,
        },
      },
    });
    if (!p) {
      throw new ForbiddenException('Not a participant in this conversation');
    }
    return p;
  }

  private toJson(
    meta: Record<string, unknown> | undefined,
  ): Prisma.InputJsonValue {
    return (meta ?? {}) as Prisma.InputJsonValue;
  }

  private async loadConversationPayload(
    id: bigint,
  ): Promise<ConversationWithParticipantsAndLastMessage> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      ...conversationWithParticipantsAndLastMessage,
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  async startConversation(senderId: bigint, dto: StartConversationDto) {
    const recipientId = BigInt(dto.recipient_id);
    if (recipientId === senderId) {
      throw new BadRequestException(
        'Cannot start a conversation with yourself',
      );
    }

    const recipient = await this.prisma.account.findUnique({
      where: { id: recipientId },
    });
    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    const messageType = dto.message_type ?? 'TEXT';
    const metadata = this.toJson(dto.metadata);
    const now = new Date();

    const existingId = await this.findDirectConversationId(
      senderId,
      recipientId,
    );

    if (existingId != null) {
      const msg = await this.prisma.$transaction(async (tx) => {
        const m = await tx.message.create({
          data: {
            conversation_id: existingId,
            sender_id: senderId,
            content: dto.message,
            message_type: messageType,
            metadata,
          },
        });
        await tx.conversation.update({
          where: { id: existingId },
          data: { last_message_at: now },
        });
        return m;
      });
      this.chatGateway.emitNewMessage(existingId, msg as any);
      return this.loadConversationPayload(existingId);
    }

    const { conv: created, msg } = await this.prisma.$transaction(
      async (tx) => {
        const conv = await tx.conversation.create({ data: {} });
        await tx.conversationParticipant.createMany({
          data: [
            { conversation_id: conv.id, account_id: senderId },
            { conversation_id: conv.id, account_id: recipientId },
          ],
        });
        const m = await tx.message.create({
          data: {
            conversation_id: conv.id,
            sender_id: senderId,
            content: dto.message,
            message_type: messageType,
            metadata,
          },
        });
        const updated = await tx.conversation.update({
          where: { id: conv.id },
          data: { last_message_at: now },
          ...conversationWithParticipantsAndLastMessage,
        });
        return { conv: updated, msg: m };
      },
    );

    this.chatGateway.joinConversationRoom(senderId, created.id);
    this.chatGateway.joinConversationRoom(recipientId, created.id);
    this.chatGateway.emitNewMessage(created.id, msg as any);

    return created;
  }

  private async unreadCountForParticipant(
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

  private otherParticipant(
    conv: ConversationWithParticipantsAndLastMessage,
    accountId: bigint,
  ) {
    return conv.participants.find((p) => p.account_id !== accountId);
  }

  async getInbox(accountId: bigint, query: ConversationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.conversationParticipant.findMany({
        where: { account_id: accountId },
        include: {
          conversation: {
            include: {
              participants: {
                include: { account: { include: { client_profile: true } } },
              },
              messages: { orderBy: { created_at: 'desc' }, take: 1 },
            },
          },
        },
        orderBy: { conversation: { last_message_at: 'desc' } },
        skip,
        take: limit,
      }),
      this.prisma.conversationParticipant.count({
        where: { account_id: accountId },
      }),
    ]);

    const unreadCounts = await Promise.all(
      rows.map((row) =>
        this.unreadCountForParticipant(row.conversation_id, row.last_read_at),
      ),
    );

    const items = rows.map((row, i) => {
      const conv = row.conversation;
      const other = this.otherParticipant(conv, accountId);
      return {
        conversation: {
          id: conv.id,
          last_message_at: conv.last_message_at,
          created_at: conv.created_at,
        },
        other_participant: other
          ? {
              account_id: other.account_id,
              display_name: other.account.client_profile?.display_name ?? null,
              avatar_url: other.account.client_profile?.avatar_url ?? null,
            }
          : null,
        last_message: conv.messages[0] ?? null,
        unread_count: unreadCounts[i] ?? 0,
      };
    });

    return { items, total, page, limit };
  }

  async getMessages(
    conversationId: bigint,
    accountId: bigint,
    query: MessageQueryDto,
  ) {
    await this.assertParticipant(conversationId, accountId);

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

    const now = new Date();
    await this.prisma.conversationParticipant.update({
      where: {
        conversation_id_account_id: {
          conversation_id: conversationId,
          account_id: accountId,
        },
      },
      data: { last_read_at: now },
    });

    return { items: messages, total, page, limit };
  }

  async sendMessage(
    conversationId: bigint,
    senderId: bigint,
    dto: SendMessageDto,
  ) {
    await this.assertParticipant(conversationId, senderId);

    const now = new Date();
    const messageType = dto.message_type ?? 'TEXT';
    const metadata = this.toJson(dto.metadata);

    const msg = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          conversation_id: conversationId,
          sender_id: senderId,
          content: dto.content,
          message_type: messageType,
          metadata,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: now },
      });
      return m;
    });

    this.chatGateway.emitNewMessage(conversationId, msg as any);
    return this.loadConversationPayload(conversationId);
  }

  async markRead(conversationId: bigint, accountId: bigint) {
    await this.assertParticipant(conversationId, accountId);
    const now = new Date();
    await this.prisma.conversationParticipant.update({
      where: {
        conversation_id_account_id: {
          conversation_id: conversationId,
          account_id: accountId,
        },
      },
      data: { last_read_at: now },
    });
    this.chatGateway.emitMessageRead(conversationId, accountId, now);
    return { ok: true as const, last_read_at: now };
  }

  async getUnreadCount(accountId: bigint): Promise<{ total: number }> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { account_id: accountId },
      select: { conversation_id: true, last_read_at: true },
    });

    const counts = await Promise.all(
      participants.map((p) =>
        this.unreadCountForParticipant(p.conversation_id, p.last_read_at),
      ),
    );

    const total = counts.reduce((a, b) => a + b, 0);
    return { total };
  }
}
