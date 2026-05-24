import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ADMIN_ACTIONS,
  ADMIN_TARGET_KINDS,
  APPROVAL_CONDITION_TYPES,
  type ActionContext,
  type AdminActionCode,
  type AdminTargetKind,
} from './admin-action.types';

const DEFAULT_APPROVAL_EXPIRY_DAYS = 7;

export type ApprovalEvaluation =
  | { approvalRequired: false }
  | { approvalRequired: true; approvalId: bigint };

/**
 * Core engine: given an action code + target + context + requestor, decide
 * whether the action needs approval (per active staff_approval_rule + its
 * conditions). If yes, persist a staff_action_approval row in PENDING and
 * defer execution; if no, allow the caller to execute immediately.
 *
 * Approving a pending row re-invokes the originating action with the
 * persisted context, then marks the approval EXECUTED (or stays APPROVED
 * if the caller wants to execute separately).
 */
@Injectable()
export class ApprovalEngineService {
  private readonly logger = new Logger(ApprovalEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluate whether the requested action needs approval. If ANY active rule
   * for this action_type matches all of its conditions against the context,
   * a PENDING staff_action_approval row is created and { approvalRequired:
   * true, approvalId } is returned. Otherwise { approvalRequired: false }.
   */
  async evaluate(args: {
    actionCode: AdminActionCode;
    targetKind: AdminTargetKind;
    targetId: bigint;
    context: ActionContext;
    requestedByStaffId: bigint;
  }): Promise<ApprovalEvaluation> {
    const { actionCode, targetKind, targetId, context, requestedByStaffId } =
      args;

    const actionType = await this.prisma.adminActionType.findUnique({
      where: { name: actionCode },
    });
    if (!actionType) {
      this.logger.warn(
        `Action code ${actionCode} not in admin_action_type lookup — proceeding without approval check`,
      );
      return { approvalRequired: false };
    }

    const candidateRules = await this.prisma.staffApprovalRule.findMany({
      where: {
        target_action_type_id: actionType.id,
        is_active: true,
      },
      include: {
        required_approver_role: { select: { id: true, name: true } },
        conditions: {
          include: {
            condition_type: { select: { name: true } },
            amount: true,
            role: true,
            doc_type: true,
          },
        },
      },
    });

    for (const rule of candidateRules) {
      const allMatch = await this.allConditionsMatch(
        rule.conditions,
        { context, targetKind, targetId, requestedByStaffId },
      );
      if (!allMatch) continue;

      const targetKindRow = await this.prisma.adminTargetKind.findUnique({
        where: { name: targetKind },
      });
      if (!targetKindRow) {
        throw new NotFoundException({
          code: 'TARGET_KIND_NOT_FOUND',
          message: `Target kind ${targetKind} not seeded in admin_target_kind`,
        });
      }

      // Dedupe: if the same staff already has a PENDING approval for the
      // same rule + target, return that instead of creating a second one.
      // Prevents accidental double-submits and avoids polluting the queue.
      const existing = await this.prisma.staffActionApproval.findFirst({
        where: {
          rule_id: rule.id,
          target_kind_id: targetKindRow.id,
          target_id: targetId,
          requested_by_staff_id: requestedByStaffId,
          status: 'PENDING',
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException({
          code: 'APPROVAL_ALREADY_PENDING',
          message:
            'You already have a pending request for this action on this target. Wait for the existing one to be approved or rejected.',
          approval_id: existing.id.toString(),
        });
      }

      const approval = await this.prisma.staffActionApproval.create({
        data: {
          rule_id: rule.id,
          target_kind_id: targetKindRow.id,
          target_id: targetId,
          context: context as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
          requested_by_staff_id: requestedByStaffId,
          requested_reason: context.reason ?? null,
          requested_at: new Date(),
          expires_at: new Date(
            Date.now() + DEFAULT_APPROVAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
          ),
        },
      });
      return { approvalRequired: true, approvalId: approval.id };
    }

    return { approvalRequired: false };
  }

  /**
   * Returns true if every condition on the rule matches the action context.
   * Conditions are AND-ed.
   */
  private async allConditionsMatch(
    conditions: Array<{
      condition_type: { name: string };
      amount: { threshold_pence: bigint } | null;
      role: { staff_role_id: number } | null;
      doc_type: { document_type: string } | null;
    }>,
    args: {
      context: ActionContext;
      targetKind: AdminTargetKind;
      targetId: bigint;
      requestedByStaffId: bigint;
    },
  ): Promise<boolean> {
    for (const c of conditions) {
      const name = c.condition_type.name;
      if (name === APPROVAL_CONDITION_TYPES.AMOUNT_GT) {
        const ctxAmt = args.context.amount_pence;
        if (typeof ctxAmt !== 'number' || !c.amount) return false;
        if (!(BigInt(Math.floor(ctxAmt)) > c.amount.threshold_pence))
          return false;
      } else if (
        name === APPROVAL_CONDITION_TYPES.REQUESTING_STAFF_HAS_ROLE
      ) {
        if (!c.role) return false;
        const hasRole = await this.prisma.staffMemberRole.findUnique({
          where: {
            staff_member_id_staff_role_id: {
              staff_member_id: args.requestedByStaffId,
              staff_role_id: c.role.staff_role_id,
            },
          },
        });
        if (!hasRole) return false;
      } else if (name === APPROVAL_CONDITION_TYPES.DOCUMENT_TYPE_EQUALS) {
        if (args.targetKind !== ADMIN_TARGET_KINDS.DOCUMENT) return false;
        if (!c.doc_type) return false;
        const ctxDocType = args.context.doc_type;
        if (
          typeof ctxDocType !== 'string' ||
          ctxDocType !== c.doc_type.document_type
        ) {
          return false;
        }
      } else {
        // Unknown condition type — fail closed (don't match)
        this.logger.warn(`Unknown approval condition type: ${name}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Returns the pending approval if the staff member has the required role
   * for it. Otherwise throws or returns null.
   */
  async getPendingForStaff(approvalId: bigint, staffMemberId: bigint) {
    const approval = await this.prisma.staffActionApproval.findUnique({
      where: { id: approvalId },
      include: {
        rule: { include: { required_approver_role: true } },
        target_kind: true,
      },
    });
    if (!approval) {
      throw new NotFoundException({ code: 'APPROVAL_NOT_FOUND' });
    }
    if (approval.status !== 'PENDING') {
      throw new NotFoundException({
        code: 'APPROVAL_NOT_PENDING',
        message: `Approval is ${approval.status.toLowerCase()}`,
      });
    }
    // Verify approver has required role
    const link = await this.prisma.staffMemberRole.findUnique({
      where: {
        staff_member_id_staff_role_id: {
          staff_member_id: staffMemberId,
          staff_role_id: approval.rule.required_approver_role_id,
        },
      },
    });
    if (!link) {
      throw new NotFoundException({
        code: 'WRONG_APPROVER_ROLE',
        message: `Only ${approval.rule.required_approver_role.name} can approve this`,
      });
    }
    return approval;
  }

  /**
   * Mark approval APPROVED. Caller is responsible for re-invoking the
   * original action with the persisted context, then linking the resulting
   * audit row via setExecutionAudit().
   */
  async markApproved(args: {
    approvalId: bigint;
    approvedByStaffId: bigint;
    reason?: string;
  }) {
    return this.prisma.staffActionApproval.update({
      where: { id: args.approvalId },
      data: {
        status: 'APPROVED',
        approved_by_staff_id: args.approvedByStaffId,
        approver_reason: args.reason ?? null,
        resolved_at: new Date(),
      },
    });
  }

  /**
   * Mark approval REJECTED. No action executes.
   */
  async markRejected(args: {
    approvalId: bigint;
    approvedByStaffId: bigint;
    reason: string;
  }) {
    return this.prisma.staffActionApproval.update({
      where: { id: args.approvalId },
      data: {
        status: 'REJECTED',
        approved_by_staff_id: args.approvedByStaffId,
        approver_reason: args.reason,
        resolved_at: new Date(),
      },
    });
  }

  async markExecuted(approvalId: bigint, executionAuditId: bigint | null) {
    return this.prisma.staffActionApproval.update({
      where: { id: approvalId },
      data: {
        status: 'EXECUTED',
        execution_audit_id: executionAuditId,
      },
    });
  }

  /** Sentinel constants for callers. */
  static readonly ACTIONS = ADMIN_ACTIONS;
  static readonly TARGET_KINDS = ADMIN_TARGET_KINDS;
}
