import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type AssignReason =
  | 'auto' // new upload, system picks the next on-duty staff
  | 'duty_off' // staff toggling off-duty re-routes their work
  | 'manual' // admin manual assignment
  | 'admin_reassign' // admin reassigns away from someone
  | 'claim'; // staff claims an unassigned doc

/**
 * Workload-balanced document assignment.
 *
 * After the admin-panel refactor (v13): assignment lives on `review_item`
 * (the workflow row), not on `document` directly. document.id == reviewable_item.id,
 * and each reviewable_item has at most ONE PENDING review_item (partial UNIQUE).
 * Public method signatures still take `documentId` (== reviewable_item.id) for
 * backwards compatibility with callers.
 *
 * Picks the next available reviewer using:
 *   1. eligible pool = staff_member where is_on_duty AND account.status='ACTIVE'
 *   2. pick the staff with the smallest count of open (PENDING) review_items
 *      currently assigned to them
 *   3. tie-break: earliest `staff_member.created_at` (deterministic)
 *   4. if no eligible staff: leave assigned_to_staff_id=null (unassigned bucket)
 */
@Injectable()
export class DocumentAssignmentService {
  private readonly logger = new Logger(DocumentAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Pick the next on-duty staff with the lowest open-review count. */
  async pickNextAssignee(): Promise<bigint | null> {
    const onDuty = await this.prisma.staffMember.findMany({
      where: {
        is_on_duty: true,
        account: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        created_at: true,
        _count: {
          select: {
            assigned_reviews: {
              where: { status: 'PENDING' },
            },
          },
        },
      },
    });

    if (onDuty.length === 0) return null;

    onDuty.sort((a, b) => {
      const byLoad = a._count.assigned_reviews - b._count.assigned_reviews;
      if (byLoad !== 0) return byLoad;
      return a.created_at.getTime() - b.created_at.getTime();
    });

    return onDuty[0].id;
  }

  /**
   * Set the latest PENDING `review_item.assigned_to_staff_id` for the given
   * document (= reviewable_item.id). Writes audit event
   * `verification.document.assigned`. No-op if assignment unchanged.
   * Returns the previous assignee.
   */
  async setAssignment(
    documentId: bigint,
    nextAssignee: bigint | null,
    reason: AssignReason,
    actorAccountId: bigint | null,
    ip?: string,
  ): Promise<{ from: bigint | null; to: bigint | null; changed: boolean }> {
    const review = await this.prisma.reviewItem.findFirst({
      where: { reviewable_item_id: documentId, status: 'PENDING' },
      select: { id: true, assigned_to_staff_id: true },
    });
    if (!review) return { from: null, to: null, changed: false };

    if (review.assigned_to_staff_id === nextAssignee) {
      return {
        from: review.assigned_to_staff_id,
        to: nextAssignee,
        changed: false,
      };
    }

    await this.prisma.reviewItem.update({
      where: { id: review.id },
      data: { assigned_to_staff_id: nextAssignee },
    });

    await this.audit.log(
      actorAccountId,
      'verification.document.assigned',
      'document',
      documentId,
      {
        from: review.assigned_to_staff_id
          ? String(review.assigned_to_staff_id)
          : null,
        to: nextAssignee ? String(nextAssignee) : null,
        reason,
      },
      ip,
    );

    return {
      from: review.assigned_to_staff_id,
      to: nextAssignee,
      changed: true,
    };
  }

  /** Convenience: pick and assign in one call (used on document upload). */
  async assignNext(documentId: bigint, ip?: string) {
    const next = await this.pickNextAssignee();
    return this.setAssignment(documentId, next, 'auto', null, ip);
  }

  /**
   * Admin-driven manual assignment. Validates the target staff is active
   * and on-duty before writing.
   */
  async assignToStaff(
    documentId: bigint,
    targetStaffId: bigint | null,
    actorAccountId: bigint,
    ip?: string,
  ) {
    if (targetStaffId !== null) {
      const target = await this.prisma.staffMember.findUnique({
        where: { id: targetStaffId },
        include: { account: { select: { status: true } } },
      });
      if (!target) {
        throw new BadRequestException({
          code: 'STAFF_NOT_FOUND',
          message: 'Target staff member not found.',
        });
      }
      if (target.account.status !== 'ACTIVE') {
        throw new BadRequestException({
          code: 'STAFF_DEACTIVATED',
          message: 'Target staff is deactivated.',
        });
      }
      if (!target.is_on_duty) {
        throw new BadRequestException({
          code: 'STAFF_OFF_DUTY',
          message: 'Target staff is not on duty.',
        });
      }
    }

    return this.setAssignment(
      documentId,
      targetStaffId,
      'admin_reassign',
      actorAccountId,
      ip,
    );
  }

  /**
   * Race-free claim of an unassigned document. Uses a conditional update
   * so concurrent claims are atomic at the SQL layer.
   */
  async claim(
    documentId: bigint,
    claimingStaffId: bigint,
    ip?: string,
  ): Promise<void> {
    // Atomic claim: update only if the latest PENDING review_item has no
    // assignee. updateMany returns count for the race-safe path.
    const result = await this.prisma.reviewItem.updateMany({
      where: {
        reviewable_item_id: documentId,
        status: 'PENDING',
        assigned_to_staff_id: null,
      },
      data: { assigned_to_staff_id: claimingStaffId },
    });
    if (result.count === 0) {
      const review = await this.prisma.reviewItem.findFirst({
        where: { reviewable_item_id: documentId, status: 'PENDING' },
        select: { id: true, assigned_to_staff_id: true },
      });
      if (!review) {
        // No pending review — either no document or already resolved.
        const doc = await this.prisma.document.findUnique({
          where: { id: documentId },
          select: { id: true },
        });
        if (!doc) {
          throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
        }
        throw new ConflictException({
          code: 'NOT_PENDING',
          message: 'This document has no pending review to claim.',
        });
      }
      throw new ConflictException({
        code: 'ALREADY_ASSIGNED',
        message: 'This document is already assigned to another staff member.',
      });
    }
    await this.audit.log(
      claimingStaffId,
      'verification.document.assigned',
      'document',
      documentId,
      { from: null, to: String(claimingStaffId), reason: 'claim' },
      ip,
    );
  }

  /**
   * Reassign all open documents currently assigned to a given staff member.
   * Used when staff toggles off-duty or admin deactivates them.
   * Returns count of documents reassigned.
   */
  async reassignFromStaff(
    fromStaffId: bigint,
    reason: 'duty_off' | 'admin_reassign',
    actorAccountId: bigint | null,
    ip?: string,
  ): Promise<number> {
    const reviews = await this.prisma.reviewItem.findMany({
      where: {
        assigned_to_staff_id: fromStaffId,
        status: 'PENDING',
      },
      select: { reviewable_item_id: true },
    });
    let count = 0;
    for (const r of reviews) {
      const next = await this.pickNextAssignee();
      // Don't re-assign back to the same staff (e.g. only one on-duty).
      const target = next === fromStaffId ? null : next;
      const result = await this.setAssignment(
        r.reviewable_item_id,
        target,
        reason,
        actorAccountId,
        ip,
      );
      if (result.changed) count += 1;
    }
    if (count > 0) {
      this.logger.log(
        `Reassigned ${count} documents away from staff=${fromStaffId} (reason=${reason})`,
      );
    }
    return count;
  }
}
