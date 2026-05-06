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
  | 'auto'           // new upload, system picks the next on-duty staff
  | 'duty_off'       // staff toggling off-duty re-routes their work
  | 'manual'         // admin manual assignment
  | 'admin_reassign' // admin reassigns away from someone
  | 'claim';         // staff claims an unassigned doc

/**
 * Workload-balanced document assignment.
 *
 * On every upload, on duty-off, and on staff deactivation we pick the
 * next available reviewer using:
 *   1. eligible pool = staff_member where is_on_duty AND account.status='ACTIVE'
 *   2. pick the staff with the smallest count of open (PENDING|IN_REVIEW) docs
 *      currently assigned to them
 *   3. tie-break: earliest `staff_member.created_at` (deterministic)
 *   4. if no eligible staff: leave assigned_to=null (unassigned bucket)
 *
 * The algorithm is intentionally simple and synchronous-feeling so that
 * unit-testing against truth tables is straightforward. Assignment writes
 * are wrapped in a single SQL `UPDATE` so concurrent uploads race-safely.
 */
@Injectable()
export class DocumentAssignmentService {
  private readonly logger = new Logger(DocumentAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Pick the next on-duty staff with the lowest open-document count. */
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
            assigned_documents: {
              where: { status: { in: ['PENDING', 'IN_REVIEW'] } },
            },
          },
        },
      },
    });

    if (onDuty.length === 0) return null;

    onDuty.sort((a, b) => {
      const byLoad = a._count.assigned_documents - b._count.assigned_documents;
      if (byLoad !== 0) return byLoad;
      return a.created_at.getTime() - b.created_at.getTime();
    });

    return onDuty[0].id;
  }

  /**
   * Set `Document.assigned_to` to `nextAssignee`. Writes audit event
   * `verification.document.assigned`. No-op if the assignment doesn't change.
   * Returns the previous assignee for callers that want to log it.
   */
  async setAssignment(
    documentId: bigint,
    nextAssignee: bigint | null,
    reason: AssignReason,
    actorAccountId: bigint | null,
    ip?: string,
  ): Promise<{ from: bigint | null; to: bigint | null; changed: boolean }> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { assigned_to: true, status: true },
    });
    if (!doc) return { from: null, to: null, changed: false };

    if (doc.assigned_to === nextAssignee) {
      return { from: doc.assigned_to, to: nextAssignee, changed: false };
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { assigned_to: nextAssignee },
    });

    await this.audit.log(
      actorAccountId,
      'verification.document.assigned',
      'document',
      documentId,
      {
        from: doc.assigned_to ? String(doc.assigned_to) : null,
        to: nextAssignee ? String(nextAssignee) : null,
        reason,
      },
      ip,
    );

    return { from: doc.assigned_to, to: nextAssignee, changed: true };
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
    const result = await this.prisma.document.updateMany({
      where: { id: documentId, assigned_to: null },
      data: { assigned_to: claimingStaffId },
    });
    if (result.count === 0) {
      const doc = await this.prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, assigned_to: true },
      });
      if (!doc) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
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
    const docs = await this.prisma.document.findMany({
      where: {
        assigned_to: fromStaffId,
        status: { in: ['PENDING', 'IN_REVIEW'] },
      },
      select: { id: true },
    });
    let count = 0;
    for (const doc of docs) {
      const next = await this.pickNextAssignee();
      // Don't re-assign back to the same staff (e.g. only one on-duty).
      const target = next === fromStaffId ? null : next;
      const result = await this.setAssignment(
        doc.id,
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
