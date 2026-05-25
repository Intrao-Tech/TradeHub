import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PromotionEngine } from './promotion-engine.service';
import { milestoneForDocType, type MilestoneType } from './constants';

type Decision = 'APPROVE' | 'REJECT';

/**
 * The single canonical staff decision pipeline. After the admin-panel
 * refactor (v13): document review state lives on `review_item` (1:N with
 * reviewable_item, partial UNIQUE on PENDING ensures one active review at
 * a time). Document.id == reviewable_item.id (shared PK).
 */
@Injectable()
export class DocumentReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly promotionEngine: PromotionEngine,
  ) {}

  async review(
    documentId: bigint,
    decision: Decision,
    reason: string | undefined,
    actor: {
      accountId: bigint;
      staffMemberId: bigint;
      isAdmin: boolean;
      ip?: string;
    },
  ) {
    // Fetch document + parent (for client_profile_id) + latest PENDING review.
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        reviewable_item: true,
      },
    });
    if (!doc) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
    }

    const review = await this.prisma.reviewItem.findFirst({
      where: { reviewable_item_id: documentId, status: 'PENDING' },
    });
    if (!review) {
      // No PENDING review — either already decided or never created.
      const anyReview = await this.prisma.reviewItem.findFirst({
        where: { reviewable_item_id: documentId },
        orderBy: { created_at: 'desc' },
      });
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: anyReview
          ? `Document is already ${anyReview.status.toLowerCase()}.`
          : 'Document has no pending review.',
      });
    }

    if (
      !actor.isAdmin &&
      review.assigned_to_staff_id !== actor.staffMemberId
    ) {
      throw new ForbiddenException({
        code: 'NOT_ASSIGNEE',
        message:
          review.assigned_to_staff_id == null
            ? 'This document is unassigned. Claim it before reviewing.'
            : 'This document is assigned to another staff member.',
      });
    }

    if (decision === 'REJECT') {
      if (!reason || reason.trim().length < 10) {
        throw new BadRequestException({
          code: 'REJECTION_REASON_REQUIRED',
          message: 'Rejection requires a reason of at least 10 characters.',
        });
      }
    } else if (reason !== undefined) {
      throw new BadRequestException({
        code: 'VALIDATION',
        message: 'Approval cannot include a rejection reason.',
      });
    }

    const now = new Date();
    const clientProfileId = doc.reviewable_item.client_profile_id;

    if (decision === 'REJECT') {
      await this.prisma.reviewItem.update({
        where: { id: review.id },
        data: {
          status: 'REJECTED',
          rejection_reason: reason!.trim(),
          reviewed_by_staff_id: actor.staffMemberId,
          reviewed_at: now,
        },
      });
      await this.audit.log(
        clientProfileId,
        'verification.document.reviewed',
        'document',
        documentId,
        {
          decision: 'REJECT',
          document_id: String(documentId),
          doc_type: doc.doc_type,
          reason: reason!.trim(),
          admin_override:
            actor.isAdmin &&
            review.assigned_to_staff_id !== actor.staffMemberId
              ? true
              : undefined,
        },
        actor.ip,
      );
      return {
        document: await this.serializeDocument(documentId),
        level_changed: null,
        milestones_written: [],
      };
    }

    // decision === 'APPROVE'
    await this.prisma.reviewItem.update({
      where: { id: review.id },
      data: {
        status: 'APPROVED',
        rejection_reason: null,
        reviewed_by_staff_id: actor.staffMemberId,
        reviewed_at: now,
      },
    });
    await this.audit.log(
      clientProfileId,
      'verification.document.reviewed',
      'document',
      documentId,
      {
        decision: 'APPROVE',
        document_id: String(documentId),
        doc_type: doc.doc_type,
        admin_override:
          actor.isAdmin && review.assigned_to_staff_id !== actor.staffMemberId
            ? true
            : undefined,
      },
      actor.ip,
    );

    const milestoneType = milestoneForDocType(doc.doc_type);
    const milestonesWritten: { type: MilestoneType; id: string }[] = [];

    if (milestoneType !== null) {
      const milestone = await this.prisma.verificationMilestone.create({
        data: {
          client_profile_id: clientProfileId,
          milestone_type: milestoneType,
          staff_member_id: actor.staffMemberId,
          evidence_ref: documentId.toString(),
        },
      });
      milestonesWritten.push({
        type: milestoneType,
        id: milestone.id.toString(),
      });

      const promotion = await this.promotionEngine.runPromotion(
        clientProfileId,
        {
          milestoneIds: [milestone.id],
          staffMemberId: actor.staffMemberId,
          ip: actor.ip,
        },
      );
      return {
        document: await this.serializeDocument(documentId),
        level_changed: promotion,
        milestones_written: milestonesWritten,
      };
    }

    // Approved doc with no milestone effect (e.g. OTHER)
    return {
      document: await this.serializeDocument(documentId),
      level_changed: null,
      milestones_written: [],
    };
  }

  /**
   * Aggregate document + parent + latest review_item into the API shape that
   * callers (frontend, tests) expect — same fields as pre-refactor.
   */
  private async serializeDocument(documentId: bigint) {
    const doc = await this.prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      include: {
        reviewable_item: {
          include: {
            review_items: { orderBy: { created_at: 'desc' }, take: 1 },
          },
        },
      },
    });
    const review = doc.reviewable_item.review_items[0];
    return {
      id: doc.id.toString(),
      client_profile_id: doc.reviewable_item.client_profile_id.toString(),
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
    };
  }
}
