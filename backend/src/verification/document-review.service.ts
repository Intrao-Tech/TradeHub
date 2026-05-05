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
 * The single canonical staff decision pipeline. Replaces the legacy
 * `PATCH /documents/:id/status` endpoint by carrying both the decision
 * and the rejection reason in one operation, plus running the milestone
 * write + promotion engine inline.
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
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
    }
    if (doc.status === 'APPROVED' || doc.status === 'REJECTED') {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: `Document is already ${doc.status.toLowerCase()}.`,
      });
    }
    if (!actor.isAdmin && doc.assigned_to !== actor.staffMemberId) {
      throw new ForbiddenException({
        code: 'NOT_ASSIGNEE',
        message:
          doc.assigned_to == null
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
    if (decision === 'REJECT') {
      const updated = await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'REJECTED',
          rejection_reason: reason!.trim(),
          reviewed_by: actor.staffMemberId,
          reviewed_at: now,
        },
      });
      await this.audit.log(
        doc.client_profile_id,
        'verification.document.reviewed',
        'document',
        documentId,
        {
          decision: 'REJECT',
          document_id: String(documentId),
          doc_type: doc.doc_type,
          reason: reason!.trim(),
          admin_override:
            actor.isAdmin && doc.assigned_to !== actor.staffMemberId
              ? true
              : undefined,
        },
        actor.ip,
      );
      return {
        document: this.serializeDocument(updated),
        level_changed: null,
        milestones_written: [],
      };
    }

    // decision === 'APPROVE'
    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'APPROVED',
        rejection_reason: null,
        reviewed_by: actor.staffMemberId,
        reviewed_at: now,
      },
    });
    await this.audit.log(
      doc.client_profile_id,
      'verification.document.reviewed',
      'document',
      documentId,
      {
        decision: 'APPROVE',
        document_id: String(documentId),
        doc_type: doc.doc_type,
        admin_override:
          actor.isAdmin && doc.assigned_to !== actor.staffMemberId
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
          client_profile_id: doc.client_profile_id,
          milestone_type: milestoneType,
          staff_member_id: actor.staffMemberId,
          evidence_ref: documentId.toString(),
        },
      });
      milestonesWritten.push({ type: milestoneType, id: milestone.id.toString() });

      const promotion = await this.promotionEngine.runPromotion(
        doc.client_profile_id,
        {
          milestoneIds: [milestone.id],
          staffMemberId: actor.staffMemberId,
          ip: actor.ip,
        },
      );
      return {
        document: this.serializeDocument(updated),
        level_changed: promotion,
        milestones_written: milestonesWritten,
      };
    }

    // Approved doc with no milestone effect (e.g. OTHER)
    return {
      document: this.serializeDocument(updated),
      level_changed: null,
      milestones_written: [],
    };
  }

  private serializeDocument(doc: Awaited<ReturnType<PrismaService['document']['update']>>) {
    return {
      id: doc.id.toString(),
      client_profile_id: doc.client_profile_id.toString(),
      doc_type: doc.doc_type,
      file_url: doc.file_url,
      status: doc.status,
      rejection_reason: doc.rejection_reason,
      metadata: doc.metadata,
      assigned_to: doc.assigned_to ? doc.assigned_to.toString() : null,
      reviewed_by: doc.reviewed_by ? doc.reviewed_by.toString() : null,
      reviewed_at: doc.reviewed_at,
      created_at: doc.created_at,
    };
  }
}
