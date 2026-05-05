import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { QueueAssignmentFilter } from './dto/queue-query.dto';

/**
 * Read-only queries over the staff queue. Listed under /verification/queue.
 *
 * Default sort: oldest first (`created_at ASC`) — fairness for workers who
 * uploaded earliest. Status filter defaults to PENDING + IN_REVIEW so the
 * queue surfaces active work, not the historical archive.
 *
 * Visibility scoping is enforced at the **service** layer, not the
 * controller, so all callers (including future internal ones) see the
 * same filtered view.
 */
@Injectable()
export class QueueService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    requester: { staffMemberId: bigint; isAdmin: boolean },
    query: {
      status?: string;
      doc_type?: string;
      assignment?: QueueAssignmentFilter;
      page?: number;
      limit?: number;
    },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const statusFilter = parseStatusFilter(query.status);
    const assignment: QueueAssignmentFilter =
      query.assignment ?? (requester.isAdmin ? 'all' : 'mine');

    if (assignment === 'all' && !requester.isAdmin) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only admins can list the full queue.',
      });
    }

    const where: Prisma.DocumentWhereInput = {
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
      ...(query.doc_type ? { doc_type: query.doc_type } : {}),
      ...(assignment === 'mine'
        ? { assigned_to: requester.staffMemberId }
        : assignment === 'unassigned'
          ? { assigned_to: null }
          : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'asc' },
        include: {
          client_profile: {
            select: {
              id: true,
              display_name: true,
              worker_profile: { select: { id: true } },
              employer_profile: { select: { id: true } },
            },
          },
          assignee: {
            select: { id: true, display_name: true },
          },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      items: items.map((d) => ({
        document: {
          id: d.id.toString(),
          doc_type: d.doc_type,
          file_url: d.file_url,
          status: d.status,
          rejection_reason: d.rejection_reason,
          metadata: d.metadata,
          created_at: d.created_at,
          reviewed_at: d.reviewed_at,
          reviewed_by: d.reviewed_by ? d.reviewed_by.toString() : null,
        },
        uploader: {
          id: d.client_profile.id.toString(),
          display_name: d.client_profile.display_name,
          role: d.client_profile.worker_profile
            ? 'WORKER'
            : d.client_profile.employer_profile
              ? 'EMPLOYER'
              : 'UNKNOWN',
        },
        assignee: d.assignee
          ? {
              id: d.assignee.id.toString(),
              display_name: d.assignee.display_name,
            }
          : null,
      })),
      total,
      page,
      limit,
    };
  }

  async getOne(documentId: bigint) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        client_profile: {
          select: {
            id: true,
            display_name: true,
            verification_level: true,
            worker_profile: { select: { id: true } },
            employer_profile: { select: { id: true } },
          },
        },
        assignee: { select: { id: true, display_name: true } },
        reviewer: { select: { id: true, display_name: true } },
      },
    });
    if (!doc) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
    }

    const history = await this.prisma.document.findMany({
      where: {
        client_profile_id: doc.client_profile_id,
        doc_type: doc.doc_type,
        id: { not: documentId },
      },
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        status: true,
        rejection_reason: true,
        created_at: true,
        reviewed_at: true,
      },
    });

    return {
      document: {
        id: doc.id.toString(),
        doc_type: doc.doc_type,
        file_url: doc.file_url,
        status: doc.status,
        rejection_reason: doc.rejection_reason,
        metadata: doc.metadata,
        assigned_to: doc.assigned_to ? doc.assigned_to.toString() : null,
        reviewed_by: doc.reviewed_by ? doc.reviewed_by.toString() : null,
        reviewed_at: doc.reviewed_at,
        created_at: doc.created_at,
      },
      uploader: {
        id: doc.client_profile.id.toString(),
        display_name: doc.client_profile.display_name,
        role: doc.client_profile.worker_profile
          ? 'WORKER'
          : doc.client_profile.employer_profile
            ? 'EMPLOYER'
            : 'UNKNOWN',
        verification_level: doc.client_profile.verification_level,
      },
      assignee: doc.assignee
        ? {
            id: doc.assignee.id.toString(),
            display_name: doc.assignee.display_name,
          }
        : null,
      reviewer: doc.reviewer
        ? {
            id: doc.reviewer.id.toString(),
            display_name: doc.reviewer.display_name,
          }
        : null,
      history: history.map((h) => ({
        id: h.id.toString(),
        status: h.status,
        rejection_reason: h.rejection_reason,
        created_at: h.created_at,
        reviewed_at: h.reviewed_at,
      })),
    };
  }
}

function parseStatusFilter(raw: string | undefined): string[] | null {
  if (!raw) return ['PENDING', 'IN_REVIEW'];
  const valid = ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'];
  const parts = raw.split(',').map((s) => s.trim().toUpperCase());
  const filtered = parts.filter((p) => valid.includes(p));
  return filtered.length > 0 ? filtered : null;
}
