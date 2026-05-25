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
 * uploaded earliest. Status filter defaults to PENDING so the queue surfaces
 * active work, not the historical archive.
 *
 * After admin-panel refactor (v13): document review state lives on
 * `review_item` (1:N with reviewable_item, latest = active). Queries
 * traverse document → reviewable_item → latest review_item.
 *
 * Visibility scoping is enforced at the **service** layer, not the
 * controller, so all callers see the same filtered view.
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

    // Build a review_item filter so we can paginate over the workflow rows.
    // "Latest review per document" is implicit because:
    //   - status='PENDING' has a partial UNIQUE → at most one PENDING per
    //     reviewable_item, so listing PENDING reviews IS the active queue
    //   - for resolved (APPROVED/REJECTED) we list per review_item row,
    //     which is correct (each decision is its own row in history)
    const where: Prisma.ReviewItemWhereInput = {
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
      ...(query.doc_type
        ? {
            reviewable_item: {
              kind: 'DOCUMENT',
              document: { doc_type: query.doc_type },
            },
          }
        : { reviewable_item: { kind: 'DOCUMENT' } }),
      ...(assignment === 'mine'
        ? { assigned_to_staff_id: requester.staffMemberId }
        : assignment === 'unassigned'
          ? { assigned_to_staff_id: null }
          : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.reviewItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'asc' },
        include: {
          reviewable_item: {
            include: {
              document: true,
              client_profile: {
                select: {
                  id: true,
                  display_name: true,
                  worker_profile: { select: { id: true } },
                  employer_profile: { select: { id: true } },
                },
              },
            },
          },
          assignee: {
            select: { id: true, display_name: true },
          },
        },
      }),
      this.prisma.reviewItem.count({ where }),
    ]);

    return {
      items: items.flatMap((r) => {
        const doc = r.reviewable_item.document;
        if (!doc) return [];
        const cp = r.reviewable_item.client_profile;
        return [
          {
            document: {
              id: doc.id.toString(),
              doc_type: doc.doc_type,
              file_url: doc.file_url,
              status: r.status,
              rejection_reason: r.rejection_reason,
              metadata: doc.metadata,
              created_at: r.reviewable_item.created_at,
              reviewed_at: r.reviewed_at,
              reviewed_by: r.reviewed_by_staff_id
                ? r.reviewed_by_staff_id.toString()
                : null,
            },
            uploader: {
              id: cp.id.toString(),
              display_name: cp.display_name,
              role: cp.worker_profile
                ? 'WORKER'
                : cp.employer_profile
                  ? 'EMPLOYER'
                  : 'UNKNOWN',
            },
            assignee: r.assignee
              ? {
                  id: r.assignee.id.toString(),
                  display_name: r.assignee.display_name,
                }
              : null,
          },
        ];
      }),
      total,
      page,
      limit,
    };
  }

  async getOne(documentId: bigint) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        reviewable_item: {
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
            review_items: {
              orderBy: { created_at: 'desc' },
              take: 1,
              include: {
                assignee: { select: { id: true, display_name: true } },
                reviewer: { select: { id: true, display_name: true } },
              },
            },
          },
        },
      },
    });
    if (!doc) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
    }

    const review = doc.reviewable_item.review_items[0];
    const cp = doc.reviewable_item.client_profile;
    const clientProfileId = doc.reviewable_item.client_profile_id;

    // History: other documents of the same doc_type for the same uploader,
    // with their latest review status (oldest first).
    const otherDocs = await this.prisma.document.findMany({
      where: {
        id: { not: documentId },
        doc_type: doc.doc_type,
        reviewable_item: { client_profile_id: clientProfileId },
      },
      orderBy: { reviewable_item: { created_at: 'asc' } },
      include: {
        reviewable_item: {
          include: {
            review_items: { orderBy: { created_at: 'desc' }, take: 1 },
          },
        },
      },
    });

    return {
      document: {
        id: doc.id.toString(),
        doc_type: doc.doc_type,
        file_url: doc.file_url,
        status: review?.status ?? 'PENDING',
        rejection_reason: review?.rejection_reason ?? null,
        metadata: doc.metadata,
        assigned_to: review?.assigned_to_staff_id
          ? review.assigned_to_staff_id.toString()
          : null,
        reviewed_by: review?.reviewed_by_staff_id
          ? review.reviewed_by_staff_id.toString()
          : null,
        reviewed_at: review?.reviewed_at ?? null,
        created_at: doc.reviewable_item.created_at,
      },
      uploader: {
        id: cp.id.toString(),
        display_name: cp.display_name,
        role: cp.worker_profile
          ? 'WORKER'
          : cp.employer_profile
            ? 'EMPLOYER'
            : 'UNKNOWN',
        verification_level: cp.verification_level,
      },
      assignee: review?.assignee
        ? {
            id: review.assignee.id.toString(),
            display_name: review.assignee.display_name,
          }
        : null,
      reviewer: review?.reviewer
        ? {
            id: review.reviewer.id.toString(),
            display_name: review.reviewer.display_name,
          }
        : null,
      history: otherDocs.map((h) => {
        const hr = h.reviewable_item.review_items[0];
        return {
          id: h.id.toString(),
          status: hr?.status ?? 'PENDING',
          rejection_reason: hr?.rejection_reason ?? null,
          created_at: h.reviewable_item.created_at,
          reviewed_at: hr?.reviewed_at ?? null,
        };
      }),
    };
  }
}

function parseStatusFilter(raw: string | undefined): string[] | null {
  if (!raw) return ['PENDING'];
  const valid = ['PENDING', 'APPROVED', 'REJECTED'];
  const parts = raw.split(',').map((s) => s.trim().toUpperCase());
  const filtered = parts.filter((p) => valid.includes(p));
  return filtered.length > 0 ? filtered : null;
}
