import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: bigint, dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        account_id: accountId,
        type: dto.type,
        title: dto.title,
        body: dto.body ?? null,
        data: (dto.data ?? {}) as Prisma.InputJsonValue,
        channel: dto.channel ?? 'IN_APP',
      },
    });
  }

  async getByAccount(accountId: bigint, query: NotificationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      account_id: accountId,
      ...(query.unread_only === true ? { read_at: null } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { data: items, total, page, limit };
  }

  async markAsRead(id: bigint, accountId: bigint) {
    try {
      return await this.prisma.notification.update({
        where: { id, account_id: accountId },
        data: { read_at: new Date() },
      });
    } catch {
      throw new NotFoundException('Notification not found');
    }
  }

  async markAllAsRead(accountId: bigint) {
    const now = new Date();
    const result = await this.prisma.notification.updateMany({
      where: { account_id: accountId, read_at: null },
      data: { read_at: now },
    });
    return { updated: result.count };
  }

  async getUnreadCount(accountId: bigint) {
    return this.prisma.notification.count({
      where: { account_id: accountId, read_at: null },
    });
  }
}
