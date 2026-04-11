import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditSearchDto } from './dto/audit-search.dto';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    accountId: bigint | null,
    action: string,
    entityType?: string,
    entityId?: bigint,
    metadata?: object,
    ipAddress?: string,
  ) {
    return this.prisma.auditLog.create({
      data: {
        account_id: accountId,
        action,
        entity_type: entityType ?? null,
        entity_id: entityId ?? null,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
        ip_address: ipAddress ?? null,
      },
    });
  }

  async search(query: AuditSearchDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      ...(query.account_id != null && query.account_id !== ''
        ? { account_id: BigInt(query.account_id) }
        : {}),
      ...(query.action != null && query.action !== ''
        ? { action: query.action }
        : {}),
      ...(query.entity_type != null && query.entity_type !== ''
        ? { entity_type: query.entity_type }
        : {}),
      ...(query.from_date != null || query.to_date != null
        ? {
            created_at: {
              ...(query.from_date != null
                ? { gte: new Date(query.from_date) }
                : {}),
              ...(query.to_date != null
                ? { lte: new Date(query.to_date) }
                : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { account: { select: { id: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data: items, total, page, limit };
  }
}
