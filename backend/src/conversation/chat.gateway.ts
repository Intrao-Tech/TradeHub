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
import { Injectable, Logger } from '@nestjs/common';

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
      (client.data as { accountId?: string }).accountId = accountId;

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
    const accountId = (client.data as { accountId?: string }).accountId;
    if (accountId) {
      const sockets = this.accountToSockets.get(accountId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.accountToSockets.delete(accountId);
      }
    }
  }

  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversation_id: string },
  ) {
    void client.join(`conv:${data.conversation_id}`);
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
