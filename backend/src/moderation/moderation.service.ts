import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateModerationActionDto } from './dto/create-moderation-action.dto';
import { CreateModerationItemDto } from './dto/create-moderation-item.dto';
import { ModerationQueueQueryDto } from './dto/moderation-queue-query.dto';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async getQueue(query: ModerationQueueQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ModerationItemWhereInput = {
      ...(query.queue_type != null && query.queue_type !== ''
        ? { queue_type: query.queue_type }
        : {}),
      ...(query.status != null && query.status !== ''
        ? { status: query.status }
        : {}),
      ...(query.min_priority != null
        ? { priority: { gte: query.min_priority } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.moderationItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: 'asc' }, { created_at: 'asc' }],
        include: { document: true },
      }),
      this.prisma.moderationItem.count({ where }),
    ]);

    return { data: items, total, page, limit };
  }

  async getById(id: bigint) {
    const item = await this.prisma.moderationItem.findUnique({
      where: { id },
      include: {
        document: true,
        moderation_actions: {
          orderBy: { created_at: 'asc' },
          include: { staff_member: true },
        },
      },
    });
    if (!item) throw new NotFoundException('Moderation item not found');
    return item;
  }

  async createItem(dto: CreateModerationItemDto) {
    return this.prisma.moderationItem.create({
      data: {
        document_id: dto.document_id ?? null,
        entity_type: dto.entity_type,
        entity_id: dto.entity_id,
        queue_type: dto.queue_type,
        priority: dto.priority ?? 5,
      },
    });
  }

  async addAction(
    itemId: bigint,
    staffMemberId: bigint,
    dto: CreateModerationActionDto,
  ) {
    await this.getById(itemId);

    const statusUpdate = this.statusFromActionType(dto.action_type);

    return this.prisma.$transaction(async (tx) => {
      const action = await tx.moderationAction.create({
        data: {
          moderation_item_id: itemId,
          staff_member_id: staffMemberId,
          action_type: dto.action_type,
          notes: dto.notes ?? null,
        },
      });

      if (statusUpdate != null) {
        await tx.moderationItem.update({
          where: { id: itemId },
          data: { status: statusUpdate },
        });
      }

      return action;
    });
  }

  private statusFromActionType(
    actionType: string,
  ): string | undefined {
    switch (actionType) {
      case 'RESOLVED':
        return 'COMPLETED';
      case 'DISMISSED':
        return 'DISMISSED';
      case 'ASSIGNED':
      case 'STARTED':
        return 'IN_PROGRESS';
      default:
        return undefined;
    }
  }

  async getActionsByItem(itemId: bigint) {
    await this.getById(itemId);
    return this.prisma.moderationAction.findMany({
      where: { moderation_item_id: itemId },
      orderBy: { created_at: 'asc' },
      include: { staff_member: true },
    });
  }
}
