import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { AuditService } from '../audit/audit.service';

const STAFF_BRAND = 'TradeHub Support';

export interface SendSupportMessageDto {
  content?: string;
  file_url?: string;
  original_name?: string;
  mime_type?: string;
  size_bytes?: number;
  message_type?: 'TEXT' | 'IMAGE' | 'FILE';
}

export interface SupportListQuery {
  q?: string;
  assigned_to_me?: boolean;
  unassigned_only?: boolean;
  has_unread?: boolean;
  page?: number;
  limit?: number;
}

/**
 * Support chat backend. One thread per client_profile, forever; messages live
 * in the existing `message` table via support_collaboration_id (XOR-ed with
 * conversation_id by the message_one_container CHECK constraint).
 *
 * Any staff with read access can participate; `assigned_to_staff_id` is a soft
 * "currently responsible" marker (used for queue filtering) and does NOT
 * restrict who can post. Client-side, all staff posts are branded as
 * "TradeHub Support" — individual staff identity is intentionally hidden.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── client-side entrypoints ─────────────

  async getOrCreateThreadForClient(clientProfileId: bigint) {
    const existing = await this.prisma.supportCollaboration.findUnique({
      where: { client_profile_id: clientProfileId },
    });
    if (existing) return existing;
    return this.prisma.supportCollaboration.create({
      data: { client_profile_id: clientProfileId },
    });
  }

  async sendAsClient(
    clientProfileId: bigint,
    dto: SendSupportMessageDto,
  ) {
    this.validateBody(dto);
    const thread = await this.getOrCreateThreadForClient(clientProfileId);
    const now = new Date();
    const message = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          support_collaboration_id: thread.id,
          conversation_id: null,
          sender_id: clientProfileId,
          ...this.normalizeBody(dto),
        },
        include: {
          sender: {
            select: {
              id: true,
              client_profile: { select: { id: true } },
              staff_member: { select: { id: true } },
            },
          },
        },
      });
      await tx.supportCollaboration.update({
        where: { id: thread.id },
        data: { last_message_at: now, user_last_read_at: now },
      });
      return m;
    });
    return this.serializeMessageForClient(message);
  }

  async listMessagesForClient(
    clientProfileId: bigint,
    page = 1,
    limit = 50,
  ) {
    const thread = await this.getOrCreateThreadForClient(clientProfileId);
    const skip = (Math.max(page, 1) - 1) * limit;
    const take = Math.min(200, Math.max(1, limit));
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { support_collaboration_id: thread.id },
        orderBy: { created_at: 'desc' },
        skip,
        take,
        include: {
          sender: {
            select: {
              id: true,
              client_profile: { select: { id: true } },
              staff_member: { select: { id: true } },
            },
          },
        },
      }),
      this.prisma.message.count({
        where: { support_collaboration_id: thread.id },
      }),
    ]);
    return {
      thread: { id: thread.id.toString(), last_message_at: thread.last_message_at },
      data: items.reverse().map((m) => this.serializeMessageForClient(m)),
      total,
      page,
      limit: take,
    };
  }

  async markReadAsClient(clientProfileId: bigint) {
    const thread = await this.getOrCreateThreadForClient(clientProfileId);
    await this.prisma.supportCollaboration.update({
      where: { id: thread.id },
      data: { user_last_read_at: new Date() },
    });
    return { ok: true };
  }

  async unreadCountForClient(clientProfileId: bigint): Promise<number> {
    const thread = await this.prisma.supportCollaboration.findUnique({
      where: { client_profile_id: clientProfileId },
    });
    if (!thread) return 0;
    const since = thread.user_last_read_at ?? new Date(0);
    return this.prisma.message.count({
      where: {
        support_collaboration_id: thread.id,
        created_at: { gt: since },
        sender_id: { not: clientProfileId },
      },
    });
  }

  // ───────────── staff-side entrypoints ─────────────

  async listThreadsForStaff(q: SupportListQuery, staffAccountId: bigint) {
    const page = q.page && q.page > 0 ? q.page : 1;
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.SupportCollaborationWhereInput = {};
    if (q.assigned_to_me) where.assigned_to_staff_id = staffAccountId;
    if (q.unassigned_only) where.assigned_to_staff_id = null;
    if (q.q && q.q.trim()) {
      const term = q.q.trim();
      where.client_profile = {
        OR: [
          { display_name: { contains: term, mode: 'insensitive' } },
          { slug: { contains: term, mode: 'insensitive' } },
          { account: { email: { contains: term, mode: 'insensitive' } } },
        ],
      };
    }

    const rows = await this.prisma.supportCollaboration.findMany({
      where,
      orderBy: [{ last_message_at: { sort: 'desc', nulls: 'last' } }],
      skip,
      take: limit,
      include: {
        client_profile: {
          select: {
            id: true,
            display_name: true,
            slug: true,
            avatar_url: true,
            account: { select: { email: true, status: true } },
          },
        },
        assignee: { select: { id: true, display_name: true } },
      },
    });

    const total = await this.prisma.supportCollaboration.count({ where });

    // Add unread-from-client counts (messages by client newer than staff_last_read_at)
    const enriched = await Promise.all(
      rows.map(async (r) => {
        const since = r.staff_last_read_at ?? new Date(0);
        const unread = await this.prisma.message.count({
          where: {
            support_collaboration_id: r.id,
            created_at: { gt: since },
            sender_id: r.client_profile_id,
          },
        });
        return { row: r, unread };
      }),
    );

    const filtered = q.has_unread
      ? enriched.filter((e) => e.unread > 0)
      : enriched;

    return {
      data: filtered.map(({ row, unread }) => ({
        id: row.id.toString(),
        client: {
          id: row.client_profile.id.toString(),
          display_name: row.client_profile.display_name,
          slug: row.client_profile.slug,
          avatar_url: row.client_profile.avatar_url,
          email: row.client_profile.account.email,
          status: row.client_profile.account.status,
        },
        assignee: row.assignee
          ? {
              id: row.assignee.id.toString(),
              display_name: row.assignee.display_name,
            }
          : null,
        last_message_at: row.last_message_at,
        unread_from_client: unread,
      })),
      total,
      page,
      limit,
    };
  }

  async getThreadByClientForStaff(clientProfileId: bigint) {
    const thread = await this.prisma.supportCollaboration.findUnique({
      where: { client_profile_id: clientProfileId },
      include: {
        client_profile: {
          include: {
            account: { select: { email: true, status: true } },
            worker_profile: { select: { id: true } },
            employer_profile: { select: { id: true, company_name: true } },
          },
        },
        assignee: { select: { id: true, display_name: true } },
      },
    });
    if (!thread) {
      return {
        exists: false as const,
        client_profile_id: clientProfileId.toString(),
      };
    }
    return {
      exists: true as const,
      id: thread.id.toString(),
      client: {
        id: thread.client_profile.id.toString(),
        display_name: thread.client_profile.display_name,
        slug: thread.client_profile.slug,
        avatar_url: thread.client_profile.avatar_url,
        email: thread.client_profile.account.email,
        status: thread.client_profile.account.status,
        is_worker: !!thread.client_profile.worker_profile,
        is_employer: !!thread.client_profile.employer_profile,
        company_name: thread.client_profile.employer_profile?.company_name ?? null,
      },
      assignee: thread.assignee
        ? {
            id: thread.assignee.id.toString(),
            display_name: thread.assignee.display_name,
          }
        : null,
      last_message_at: thread.last_message_at,
      user_last_read_at: thread.user_last_read_at,
      staff_last_read_at: thread.staff_last_read_at,
    };
  }

  async listMessagesForStaff(
    clientProfileId: bigint,
    page = 1,
    limit = 50,
  ) {
    const thread = await this.prisma.supportCollaboration.findUnique({
      where: { client_profile_id: clientProfileId },
    });
    if (!thread) {
      return { data: [], total: 0, page, limit };
    }
    const skip = (Math.max(page, 1) - 1) * limit;
    const take = Math.min(200, Math.max(1, limit));
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { support_collaboration_id: thread.id },
        orderBy: { created_at: 'desc' },
        skip,
        take,
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              client_profile: { select: { display_name: true } },
              staff_member: { select: { display_name: true } },
            },
          },
        },
      }),
      this.prisma.message.count({
        where: { support_collaboration_id: thread.id },
      }),
    ]);
    return {
      data: items.reverse().map((m) => this.serializeMessageForStaff(m)),
      total,
      page,
      limit: take,
    };
  }

  async sendAsStaff(
    clientProfileId: bigint,
    staffAccountId: bigint,
    dto: SendSupportMessageDto,
  ) {
    this.validateBody(dto);
    const thread = await this.getOrCreateThreadForClient(clientProfileId);
    const now = new Date();
    const message = await this.prisma.$transaction(async (tx) => {
      const m = await tx.message.create({
        data: {
          support_collaboration_id: thread.id,
          conversation_id: null,
          sender_id: staffAccountId,
          ...this.normalizeBody(dto),
        },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              client_profile: { select: { display_name: true } },
              staff_member: { select: { display_name: true } },
            },
          },
        },
      });
      await tx.supportCollaboration.update({
        where: { id: thread.id },
        data: { last_message_at: now, staff_last_read_at: now },
      });
      return m;
    });

    // Notify the client (in-platform only)
    try {
      await this.notifications.create(clientProfileId, {
        type: 'SUPPORT_MESSAGE',
        title: STAFF_BRAND,
        body: dto.content?.slice(0, 200) ?? 'New file from support',
        data: {
          support_thread_id: thread.id.toString(),
        },
        channel: 'IN_APP',
      });
    } catch {
      // Best-effort; don't fail the send if notify pipeline hiccups
    }

    return this.serializeMessageForStaff(message);
  }

  async markReadAsStaff(clientProfileId: bigint) {
    const thread = await this.getOrCreateThreadForClient(clientProfileId);
    await this.prisma.supportCollaboration.update({
      where: { id: thread.id },
      data: { staff_last_read_at: new Date() },
    });
    return { ok: true };
  }

  async assignThread(
    clientProfileId: bigint,
    assigneeStaffId: bigint | null,
    byStaffId: bigint,
    ip?: string,
  ) {
    const thread = await this.getOrCreateThreadForClient(clientProfileId);
    if (assigneeStaffId != null) {
      const candidate = await this.prisma.staffMember.findUnique({
        where: { id: assigneeStaffId },
        include: { account: { select: { status: true } } },
      });
      if (!candidate) {
        throw new NotFoundException({ code: 'STAFF_NOT_FOUND' });
      }
      if (candidate.account.status !== 'ACTIVE') {
        throw new ConflictException({
          code: 'STAFF_NOT_ACTIVE',
          message: 'Assignee staff account is not active.',
        });
      }
    }
    if (thread.assigned_to_staff_id === assigneeStaffId) {
      throw new BadRequestException({ code: 'NO_CHANGE' });
    }
    await this.prisma.supportCollaboration.update({
      where: { id: thread.id },
      data: { assigned_to_staff_id: assigneeStaffId },
    });
    await this.audit.log(
      byStaffId,
      'support.thread_assigned',
      'support_collaboration',
      thread.id,
      {
        client_profile_id: clientProfileId.toString(),
        from: thread.assigned_to_staff_id?.toString() ?? null,
        to: assigneeStaffId?.toString() ?? null,
      },
      ip,
    );
    return {
      ok: true,
      thread_id: thread.id.toString(),
      assigned_to_staff_id: assigneeStaffId?.toString() ?? null,
    };
  }

  // ───────────── helpers ─────────────

  private validateBody(dto: SendSupportMessageDto) {
    const hasContent = !!dto.content && dto.content.trim().length > 0;
    const hasFile = !!dto.file_url && dto.file_url.trim().length > 0;
    if (!hasContent && !hasFile) {
      throw new BadRequestException({
        code: 'EMPTY_MESSAGE',
        message: 'Message content or attachment is required.',
      });
    }
  }

  private normalizeBody(dto: SendSupportMessageDto) {
    const hasFile = !!dto.file_url && dto.file_url.trim().length > 0;
    const messageType =
      dto.message_type ?? (hasFile ? 'FILE' : 'TEXT');
    return {
      message_type: messageType,
      content: dto.content?.trim().length ? dto.content.trim() : null,
      file_url: hasFile ? dto.file_url! : null,
      original_name: hasFile ? (dto.original_name ?? null) : null,
      mime_type: hasFile ? (dto.mime_type ?? null) : null,
      size_bytes: hasFile ? (dto.size_bytes ?? null) : null,
    };
  }

  private serializeMessageForClient(message: {
    id: bigint;
    content: string | null;
    message_type: string;
    file_url: string | null;
    original_name: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: Date;
    sender_id: bigint | null;
    sender?: {
      id: bigint;
      client_profile: { id: bigint } | null;
      staff_member: { id: bigint } | null;
    } | null;
  }) {
    const fromClient = !!message.sender?.client_profile;
    return {
      id: message.id.toString(),
      from: fromClient ? 'CLIENT' : 'STAFF',
      display_name: fromClient ? null : STAFF_BRAND,
      content: message.content,
      message_type: message.message_type,
      file_url: message.file_url,
      original_name: message.original_name,
      mime_type: message.mime_type,
      size_bytes: message.size_bytes,
      created_at: message.created_at,
    };
  }

  private serializeMessageForStaff(message: {
    id: bigint;
    content: string | null;
    message_type: string;
    file_url: string | null;
    original_name: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: Date;
    sender_id: bigint | null;
    sender?: {
      id: bigint;
      email?: string;
      client_profile: { display_name: string } | null;
      staff_member: { display_name: string } | null;
    } | null;
  }) {
    const isStaff = !!message.sender?.staff_member;
    return {
      id: message.id.toString(),
      from: message.sender_id == null
        ? 'SYSTEM'
        : isStaff
          ? 'STAFF'
          : 'CLIENT',
      sender_id: message.sender_id?.toString() ?? null,
      sender_display_name:
        message.sender?.staff_member?.display_name ??
        message.sender?.client_profile?.display_name ??
        null,
      sender_email: message.sender?.email ?? null,
      content: message.content,
      message_type: message.message_type,
      file_url: message.file_url,
      original_name: message.original_name,
      mime_type: message.mime_type,
      size_bytes: message.size_bytes,
      created_at: message.created_at,
    };
  }

  /** Used by RolesGuard helpers to ensure caller is the thread owner client */
  ensureClientAccess(clientProfileIdFromUrl: bigint, currentClientProfileId: bigint | null) {
    if (currentClientProfileId == null || currentClientProfileId !== clientProfileIdFromUrl) {
      throw new ForbiddenException({ code: 'NOT_OWNER' });
    }
  }
}
