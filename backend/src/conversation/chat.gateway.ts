import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { ConversationService } from './conversation.service';
import { ConversationService as ConversationServiceClass } from './conversation.service';

// Per-socket token bucket for `send_message`. CHAT-021: 10 messages / 10 s.
const RATE_LIMIT_BUCKET_SIZE = 10;
const RATE_LIMIT_WINDOW_MS = 10_000;
const TYPING_AUTO_STOP_MS = 3_000;

type SocketData = {
  accountId?: string;
  // Timestamps of recent send_message events; entries older than the window
  // are dropped on each access.
  sendTimestamps?: number[];
};

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly accountToSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ConversationServiceClass))
    private readonly conversationService: ConversationService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const auth = client.handshake.auth as { token?: string } | undefined;
      const token =
        auth?.token ??
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        void client.disconnect();
        return;
      }

      const payload = this.jwt.verify<{ sub: string | number }>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      const accountId = String(payload.sub);

      // CHAT-022 — handshake state guard.
      const account = await this.prisma.account.findUnique({
        where: { id: BigInt(accountId) },
        select: { status: true, email_verified_at: true },
      });
      if (
        !account ||
        account.status !== 'ACTIVE' ||
        account.email_verified_at == null
      ) {
        client.emit('error', {
          code:
            !account
              ? 'ACCOUNT_NOT_FOUND'
              : account.status !== 'ACTIVE'
                ? 'ACCOUNT_NOT_ACTIVE'
                : 'EMAIL_NOT_VERIFIED',
          message: 'Cannot connect to chat in current account state.',
        });
        void client.disconnect();
        return;
      }

      const data = client.data as SocketData;
      data.accountId = accountId;
      data.sendTimestamps = [];

      if (!this.accountToSockets.has(accountId)) {
        this.accountToSockets.set(accountId, new Set());
      }
      this.accountToSockets.get(accountId)!.add(client.id);

      const conversations = await this.prisma.conversationParticipant.findMany({
        where: { account_id: BigInt(accountId) },
        select: { conversation_id: true },
      });

      for (const c of conversations) {
        void client.join(`conv:${c.conversation_id}`);
      }

      this.logger.log(
        `Connected: account=${accountId} socket=${client.id} rooms=${conversations.length}`,
      );
    } catch {
      void client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const accountId = (client.data as SocketData).accountId;
    if (accountId) {
      const sockets = this.accountToSockets.get(accountId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.accountToSockets.delete(accountId);
      }
    }
  }

  // CHAT-020 — silent participant check (no error emit, avoids id enumeration).
  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversation_id: string | number },
  ) {
    const accountId = (client.data as SocketData).accountId;
    if (!accountId) return;
    let conversationId: bigint;
    try {
      conversationId = BigInt(data.conversation_id);
    } catch {
      return;
    }
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversation_id_account_id: {
          conversation_id: conversationId,
          account_id: BigInt(accountId),
        },
      },
      select: { account_id: true },
    });
    if (!participant) return;
    void client.join(`conv:${conversationId}`);
  }

  // CHAT-030 — WS send path (mirrors REST POST /conversations/:id/messages).
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: {
      conversation_id: string | number;
      content: string;
      client_id?: string;
      attachment_ids?: number[];
      message_type?: string;
    },
  ) {
    const data = client.data as SocketData;
    const accountId = data.accountId;
    if (!accountId) {
      client.emit('error', { code: 'UNAUTHENTICATED' });
      return;
    }
    if (!this.consumeRateToken(client)) {
      client.emit('error', {
        code: 'RATE_LIMITED',
        message: 'Slow down a moment — too many messages.',
        client_id: body.client_id,
      });
      return;
    }
    if (typeof body?.content !== 'string' || body.content.trim().length === 0) {
      client.emit('error', {
        code: 'INVALID_INPUT',
        message: 'Message content is required.',
        client_id: body?.client_id,
      });
      return;
    }
    let conversationId: bigint;
    try {
      conversationId = BigInt(body.conversation_id);
    } catch {
      client.emit('error', {
        code: 'INVALID_INPUT',
        message: 'Invalid conversation_id.',
        client_id: body.client_id,
      });
      return;
    }

    try {
      await this.conversationService.sendMessage(
        conversationId,
        BigInt(accountId),
        {
          content: body.content,
          message_type: body.message_type,
          client_id: body.client_id,
          attachment_ids: body.attachment_ids,
        },
      );
      // The service emits `new_message` to the room — no extra emit here.
    } catch (err) {
      const code = errorCode(err) ?? 'SEND_FAILED';
      client.emit('error', {
        code,
        message: errorMessage(err) ?? 'Could not send message.',
        client_id: body.client_id,
      });
    }
  }

  // CHAT-031 — typing indicators. No persistence; broadcast to the room
  // (excluding sender). Auto-stop on the server side after 3 s in case the
  // client crashes mid-typing.
  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversation_id: string | number },
  ) {
    await this.broadcastTyping(client, body, 'typing:start');
    const accountId = (client.data as SocketData).accountId;
    if (!accountId) return;
    // Auto-stop watchdog: if the client never sends `typing:stop`, send one
    // ourselves so the receiver doesn't see a stuck indicator.
    setTimeout(() => {
      this.broadcastTyping(client, body, 'typing:stop').catch(() => {});
    }, TYPING_AUTO_STOP_MS);
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversation_id: string | number },
  ) {
    await this.broadcastTyping(client, body, 'typing:stop');
  }

  private async broadcastTyping(
    client: Socket,
    body: { conversation_id: string | number },
    event: 'typing:start' | 'typing:stop',
  ) {
    const accountId = (client.data as SocketData).accountId;
    if (!accountId) return;
    let conversationId: bigint;
    try {
      conversationId = BigInt(body.conversation_id);
    } catch {
      return;
    }
    // Verify participant first to avoid leaking presence to non-participants.
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversation_id_account_id: {
          conversation_id: conversationId,
          account_id: BigInt(accountId),
        },
      },
      select: { account_id: true },
    });
    if (!participant) return;
    client.to(`conv:${conversationId}`).emit(event, {
      conversation_id: String(conversationId),
      account_id: accountId,
    });
  }

  private consumeRateToken(client: Socket): boolean {
    const data = client.data as SocketData;
    const now = Date.now();
    const stamps = (data.sendTimestamps ??= []);
    while (stamps.length > 0 && now - stamps[0] > RATE_LIMIT_WINDOW_MS) {
      stamps.shift();
    }
    if (stamps.length >= RATE_LIMIT_BUCKET_SIZE) return false;
    stamps.push(now);
    return true;
  }

  emitNewMessage(conversationId: bigint, message: Record<string, unknown>) {
    this.server
      .to(`conv:${conversationId}`)
      .emit('new_message', { conversation_id: conversationId, ...message });
  }

  emitMessageRead(conversationId: bigint, accountId: bigint, lastReadAt: Date) {
    this.server.to(`conv:${conversationId}`).emit('message_read', {
      conversation_id: conversationId,
      account_id: accountId,
      last_read_at: lastReadAt,
    });
  }

  emitConversationCreated(
    conversationId: bigint,
    accountIds: bigint[],
    payload: Record<string, unknown> = {},
  ) {
    for (const accountId of accountIds) {
      const sockets = this.accountToSockets.get(String(accountId));
      if (!sockets) continue;
      for (const socketId of sockets) {
        this.server.to(socketId).emit('conversation_created', {
          conversation_id: String(conversationId),
          ...payload,
        });
      }
    }
  }

  async joinConversationRoom(accountId: bigint, conversationId: bigint) {
    const sockets = this.accountToSockets.get(String(accountId));
    if (!sockets) return;
    const allSockets = await this.server.fetchSockets();
    const socketMap = new Map(allSockets.map((s) => [s.id, s]));
    for (const socketId of sockets) {
      const socket = socketMap.get(socketId);
      if (socket) socket.join(`conv:${conversationId}`);
    }
  }
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object') {
    const r = err as {
      response?: { code?: string };
      code?: string;
    };
    if (typeof r.response?.code === 'string') return r.response.code;
    if (typeof r.code === 'string') return r.code;
  }
  return undefined;
}

function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const r = err as {
      response?: { message?: string };
      message?: string;
    };
    if (typeof r.response?.message === 'string') return r.response.message;
    if (typeof r.message === 'string') return r.message;
  }
  return undefined;
}
