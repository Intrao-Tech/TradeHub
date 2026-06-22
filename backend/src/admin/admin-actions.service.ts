import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { ApprovalEngineService } from './approval-engine.service';
import {
  ADMIN_ACTIONS,
  ADMIN_TARGET_KINDS,
  type ActionContext,
  type AdminActionCode,
  type AdminTargetKind,
} from './admin-action.types';

export type ActionResult =
  | { mode: 'EXECUTED'; auditId: bigint; data?: unknown }
  | { mode: 'PENDING_APPROVAL'; approvalId: bigint };

/**
 * Action codes whose targetId is a person (account/client_profile/staff_member —
 * all share the same PK). For these, we block the requester from acting on
 * themselves so a staff member can't accidentally lock themselves out or
 * change their own role/verification level.
 */
const SELF_TARGET_BLOCKED: ReadonlySet<string> = new Set([
  ADMIN_ACTIONS.USER_SUSPEND,
  ADMIN_ACTIONS.USER_UNSUSPEND,
  ADMIN_ACTIONS.USER_DELETE,
  ADMIN_ACTIONS.VERIFICATION_LEVEL_OVERRIDE,
  ADMIN_ACTIONS.STAFF_ROLE_GRANT,
  ADMIN_ACTIONS.STAFF_ROLE_REVOKE,
]);

/**
 * Orchestrates execution of admin actions:
 *   1. evaluate approval rules → if any match, create PENDING and return.
 *   2. otherwise perform the action and write an audit log.
 *
 * Used by:
 *   - admin-actions.controller (direct staff trigger)
 *   - approvals.controller     (re-invocation after approval)
 *
 * Action handlers are intentionally simple: state-machine flips + audit.
 * Stripe-side money movements (refund/transfer) for ESCROW_FORCE_* are
 * recorded as DB state changes only; reconciliation with Stripe is handled
 * by the existing escrow webhooks. The admin panel's role is to unstick
 * the DB when Stripe and our records diverge.
 */
@Injectable()
export class AdminActionsService {
  private readonly logger = new Logger(AdminActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly approvals: ApprovalEngineService,
  ) {}

  /**
   * Public entry: request an action. Goes through the approval engine first;
   * if approval is required, returns { mode: PENDING_APPROVAL, approvalId }.
   * Otherwise performs immediately and returns { mode: EXECUTED, auditId }.
   */
  async request(args: {
    actionCode: AdminActionCode;
    targetKind: AdminTargetKind;
    targetId: bigint;
    context: ActionContext;
    requestedByStaffId: bigint;
    ip?: string;
  }): Promise<ActionResult> {
    if (
      SELF_TARGET_BLOCKED.has(args.actionCode) &&
      args.targetId === args.requestedByStaffId
    ) {
      throw new ForbiddenException({
        code: 'CANNOT_TARGET_SELF',
        message: `You can't perform ${args.actionCode} on your own account.`,
      });
    }
    const decision = await this.approvals.evaluate({
      actionCode: args.actionCode,
      targetKind: args.targetKind,
      targetId: args.targetId,
      context: args.context,
      requestedByStaffId: args.requestedByStaffId,
    });
    if (decision.approvalRequired) {
      await this.audit.log(
        args.requestedByStaffId,
        'admin.action.queued_for_approval',
        'staff_action_approval',
        decision.approvalId,
        {
          action: args.actionCode,
          target_kind: args.targetKind,
          target_id: args.targetId.toString(),
          reason: args.context.reason,
        },
        args.ip,
      );
      return { mode: 'PENDING_APPROVAL', approvalId: decision.approvalId };
    }
    return this.executeNow(
      args.actionCode,
      args.targetKind,
      args.targetId,
      args.context,
      args.requestedByStaffId,
      args.ip,
    );
  }

  /**
   * Approve a pending approval and execute the action. Verifies the approver
   * has the rule's required_approver_role; the engine helper does that.
   */
  async approve(
    approvalId: bigint,
    approverStaffId: bigint,
    reason?: string,
    ip?: string,
  ): Promise<ActionResult> {
    const approval = await this.approvals.getPendingForStaff(
      approvalId,
      approverStaffId,
    );
    if (approval.requested_by_staff_id === approverStaffId) {
      throw new ForbiddenException({
        code: 'CANNOT_APPROVE_OWN_REQUEST',
        message: 'You cannot approve your own action request.',
      });
    }
    await this.approvals.markApproved({
      approvalId,
      approvedByStaffId: approverStaffId,
      reason,
    });
    const result = await this.executeNow(
      approval.rule.target_action_type_id as unknown as AdminActionCode,
      approval.target_kind.name as AdminTargetKind,
      approval.target_id,
      approval.context as unknown as ActionContext,
      approverStaffId,
      ip,
      { fromApprovalId: approvalId },
    );
    if (result.mode === 'EXECUTED') {
      await this.approvals.markExecuted(approvalId, result.auditId);
    }
    // Tell the requester their action went through
    void this.notifyRequester(
      approval.requested_by_staff_id,
      approvalId,
      'ADMIN_ACTION_APPROVED',
      'Your request was approved',
      reason?.trim()
        ? `Approved with note: ${reason.trim()}`
        : 'Your action was approved and executed.',
    );
    return result;
  }

  async reject(
    approvalId: bigint,
    approverStaffId: bigint,
    reason: string,
    ip?: string,
  ) {
    const approval = await this.approvals.getPendingForStaff(
      approvalId,
      approverStaffId,
    );
    if (approval.requested_by_staff_id === approverStaffId) {
      throw new ForbiddenException({
        code: 'CANNOT_REJECT_OWN_REQUEST',
        message: 'You cannot reject your own action request.',
      });
    }
    await this.approvals.markRejected({
      approvalId,
      approvedByStaffId: approverStaffId,
      reason,
    });
    await this.audit.log(
      approverStaffId,
      'admin.action.rejected',
      'staff_action_approval',
      approvalId,
      { reason },
      ip,
    );
    void this.notifyRequester(
      approval.requested_by_staff_id,
      approvalId,
      'ADMIN_ACTION_REJECTED',
      'Your request was rejected',
      reason.trim()
        ? `Rejected: ${reason.trim()}`
        : 'Your action request was rejected.',
    );
    return { ok: true };
  }

  /**
   * Notify the staff member who originally requested an action that their
   * request has been resolved (approved+executed or rejected). Best-effort.
   */
  private async notifyRequester(
    requesterAccountId: bigint,
    approvalId: bigint,
    type: string,
    title: string,
    body: string,
  ) {
    try {
      await this.notifications.create(requesterAccountId, {
        type,
        title,
        body,
        data: { approval_id: approvalId.toString() },
        channel: 'IN_APP',
      });
    } catch (err) {
      this.logger.warn(
        `Failed to notify requester ${requesterAccountId} about approval ${approvalId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * `approve()` receives the rule's action_type_id (Int) — translate to the
   * action code (string) before dispatch. For direct requests we already have
   * the code, so the lookup is skipped.
   */
  private async executeNow(
    actionCodeOrId: AdminActionCode | number,
    targetKind: AdminTargetKind,
    targetId: bigint,
    context: ActionContext,
    byStaffId: bigint,
    ip?: string,
    extras?: { fromApprovalId?: bigint },
  ): Promise<ActionResult> {
    let code: AdminActionCode;
    if (typeof actionCodeOrId === 'number') {
      const row = await this.prisma.adminActionType.findUniqueOrThrow({
        where: { id: actionCodeOrId },
      });
      code = row.name as AdminActionCode;
    } else {
      code = actionCodeOrId;
    }
    const data = await this.dispatch(code, targetKind, targetId, context);
    const auditRow = await this.audit.log(
      byStaffId,
      `admin.action.${code.toLowerCase()}`,
      this.entityTypeFor(targetKind),
      targetId,
      {
        target_kind: targetKind,
        reason: context.reason,
        context,
        ...(extras?.fromApprovalId
          ? { from_approval_id: extras.fromApprovalId.toString() }
          : {}),
      },
      ip,
    );
    return { mode: 'EXECUTED', auditId: auditRow.id, data };
  }

  private entityTypeFor(kind: AdminTargetKind): string {
    switch (kind) {
      case ADMIN_TARGET_KINDS.PAYMENT:
        return 'payment';
      case ADMIN_TARGET_KINDS.CLIENT_PROFILE:
        return 'client_profile';
      case ADMIN_TARGET_KINDS.ESCROW_MILESTONE:
        return 'escrow_milestone';
      case ADMIN_TARGET_KINDS.DOCUMENT:
        return 'document';
      case ADMIN_TARGET_KINDS.ESCROW_DISPUTE:
        return 'escrow_dispute';
      case ADMIN_TARGET_KINDS.CONTRACT:
        return 'contract';
      case ADMIN_TARGET_KINDS.PLATFORM_SETTING:
        return 'platform_setting';
      default:
        return 'unknown';
    }
  }

  // ───────────────────────── Action dispatcher ─────────────────────────

  private async dispatch(
    code: AdminActionCode,
    targetKind: AdminTargetKind,
    targetId: bigint,
    context: ActionContext,
  ): Promise<unknown> {
    switch (code) {
      case ADMIN_ACTIONS.PAYMENT_MARK_PAID:
        return this.paymentMarkPaid(targetId);
      case ADMIN_ACTIONS.PAYMENT_MARK_FAILED:
        return this.paymentMarkFailed(targetId, context);
      case ADMIN_ACTIONS.PAYMENT_RETRY_TRANSFER:
        return this.paymentRetryTransfer(targetId);
      case ADMIN_ACTIONS.ESCROW_FORCE_RELEASE:
        return this.escrowForceRelease(targetId);
      case ADMIN_ACTIONS.ESCROW_FORCE_REFUND:
        return this.escrowForceRefund(targetId, context);
      case ADMIN_ACTIONS.ESCROW_FORCE_CANCEL:
        return this.escrowForceCancel(targetId, context);
      case ADMIN_ACTIONS.VERIFICATION_DOC_APPROVE:
        return this.verificationDocApprove(targetId, context);
      case ADMIN_ACTIONS.VERIFICATION_DOC_REJECT:
        return this.verificationDocReject(targetId, context);
      case ADMIN_ACTIONS.VERIFICATION_LEVEL_OVERRIDE:
        return this.verificationLevelOverride(targetId, context);
      case ADMIN_ACTIONS.USER_SUSPEND:
        return this.userSuspend(targetId);
      case ADMIN_ACTIONS.USER_UNSUSPEND:
        return this.userUnsuspend(targetId);
      case ADMIN_ACTIONS.USER_DELETE:
        return this.userDelete(targetId);
      case ADMIN_ACTIONS.PLATFORM_SETTING_UPDATE:
        return this.platformSettingUpdate(context);
      case ADMIN_ACTIONS.BROADCAST_MESSAGE:
        return this.broadcastMessage(context);
      default:
        throw new BadRequestException({
          code: 'UNSUPPORTED_ACTION',
          message: `Action ${code as string} not implemented in admin actions dispatcher (target: ${targetKind})`,
        });
    }
  }

  // ───────────────────────── Payment actions ─────────────────────────

  private async paymentMarkPaid(paymentId: bigint) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND' });
    if (p.status === 'PAID') {
      throw new ConflictException({
        code: 'ALREADY_PAID',
        message: 'Payment is already PAID.',
      });
    }
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PAID',
        settled_at: p.settled_at ?? new Date(),
        failure_reason: null,
      },
    });
  }

  private async paymentMarkFailed(paymentId: bigint, ctx: ActionContext) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND' });
    if (p.status === 'FAILED') {
      throw new ConflictException({
        code: 'ALREADY_FAILED',
        message: 'Payment is already FAILED.',
      });
    }
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'FAILED',
        failure_reason:
          (typeof ctx.failure_reason === 'string'
            ? ctx.failure_reason
            : null) ?? ctx.reason,
      },
    });
  }

  /**
   * Reset a FAILED payout/refund back to PENDING so a webhook or operator-run
   * job can re-attempt. Actual Stripe call is out of scope for this method —
   * use the wallet flow for that.
   */
  private async paymentRetryTransfer(paymentId: bigint) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND' });
    if (p.status !== 'FAILED') {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: `Only FAILED payments can be queued for retry (current: ${p.status}).`,
      });
    }
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'PENDING', failure_reason: null },
    });
  }

  // ───────────────────────── Escrow actions ─────────────────────────

  private async escrowForceRelease(milestoneId: bigint) {
    const m = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
    });
    if (!m) throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    if (m.status === 'RELEASED') {
      throw new ConflictException({ code: 'ALREADY_RELEASED' });
    }
    if (!['FUNDED', 'SUBMITTED', 'RELEASE_FAILED', 'DISPUTED'].includes(m.status)) {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: `Cannot force-release milestone in ${m.status} state.`,
      });
    }
    return this.prisma.escrowMilestone.update({
      where: { id: milestoneId },
      data: { status: 'RELEASED', released_at: new Date() },
    });
  }

  private async escrowForceRefund(milestoneId: bigint, ctx: ActionContext) {
    const m = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
    });
    if (!m) throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    if (m.status === 'REFUNDED') {
      throw new ConflictException({ code: 'ALREADY_REFUNDED' });
    }
    if (!['FUNDED', 'SUBMITTED', 'DISPUTED', 'RELEASE_FAILED'].includes(m.status)) {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: `Cannot force-refund milestone in ${m.status} state.`,
      });
    }
    return this.prisma.escrowMilestone.update({
      where: { id: milestoneId },
      data: {
        status: 'REFUNDED',
        refunded_at: new Date(),
        refund_reason: ctx.reason,
      },
    });
  }

  private async escrowForceCancel(milestoneId: bigint, ctx: ActionContext) {
    const m = await this.prisma.escrowMilestone.findUnique({
      where: { id: milestoneId },
    });
    if (!m) throw new NotFoundException({ code: 'MILESTONE_NOT_FOUND' });
    if (['CANCELED', 'RELEASED', 'REFUNDED'].includes(m.status)) {
      throw new ConflictException({
        code: 'INVALID_STATE',
        message: `Cannot cancel milestone in ${m.status} state.`,
      });
    }
    return this.prisma.escrowMilestone.update({
      where: { id: milestoneId },
      data: { status: 'CANCELED', refund_reason: ctx.reason },
    });
  }

  // ───────────────────────── Verification actions ─────────────────────────

  private async verificationDocApprove(documentId: bigint, ctx: ActionContext) {
    const reviewItemId = this.requireBigIntCtx(ctx, 'review_item_id');
    const ri = await this.prisma.reviewItem.findUnique({
      where: { id: reviewItemId },
    });
    if (!ri) throw new NotFoundException({ code: 'REVIEW_ITEM_NOT_FOUND' });
    if (ri.status !== 'PENDING') {
      throw new ConflictException({
        code: 'REVIEW_NOT_PENDING',
        message: `Review item is already ${ri.status}.`,
      });
    }
    return this.prisma.reviewItem.update({
      where: { id: reviewItemId },
      data: {
        status: 'APPROVED',
        reviewed_at: new Date(),
        rejection_reason: null,
      },
    });
  }

  private async verificationDocReject(documentId: bigint, ctx: ActionContext) {
    const reviewItemId = this.requireBigIntCtx(ctx, 'review_item_id');
    const ri = await this.prisma.reviewItem.findUnique({
      where: { id: reviewItemId },
    });
    if (!ri) throw new NotFoundException({ code: 'REVIEW_ITEM_NOT_FOUND' });
    if (ri.status !== 'PENDING') {
      throw new ConflictException({
        code: 'REVIEW_NOT_PENDING',
        message: `Review item is already ${ri.status}.`,
      });
    }
    return this.prisma.reviewItem.update({
      where: { id: reviewItemId },
      data: {
        status: 'REJECTED',
        reviewed_at: new Date(),
        rejection_reason:
          typeof ctx.rejection_reason === 'string'
            ? ctx.rejection_reason
            : ctx.reason,
      },
    });
  }

  private async verificationLevelOverride(
    clientProfileId: bigint,
    ctx: ActionContext,
  ) {
    const newLevel = ctx.new_level;
    if (typeof newLevel !== 'string') {
      throw new BadRequestException({
        code: 'MISSING_NEW_LEVEL',
        message: 'context.new_level is required for VERIFICATION_LEVEL_OVERRIDE.',
      });
    }
    return this.prisma.clientProfile.update({
      where: { id: clientProfileId },
      data: { verification_level: newLevel },
    });
  }

  // ───────────────────────── User actions ─────────────────────────

  private async userSuspend(clientProfileId: bigint) {
    const acc = await this.prisma.account.findUnique({
      where: { id: clientProfileId },
    });
    if (!acc) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    if (acc.status === 'DEACTIVATED') {
      throw new ConflictException({ code: 'ALREADY_DEACTIVATED' });
    }
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: clientProfileId },
        data: { status: 'DEACTIVATED' },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { account_id: clientProfileId },
      }),
    ]);
    return { ok: true };
  }

  private async userUnsuspend(clientProfileId: bigint) {
    const acc = await this.prisma.account.findUnique({
      where: { id: clientProfileId },
    });
    if (!acc) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    if (acc.status === 'ACTIVE') {
      throw new ConflictException({ code: 'ALREADY_ACTIVE' });
    }
    await this.prisma.account.update({
      where: { id: clientProfileId },
      data: { status: 'ACTIVE' },
    });
    return { ok: true };
  }

  /**
   * Hard-delete is not supported (we keep history for audit / disputes).
   * USER_DELETE is treated as a hard-suspend with an audit marker so support
   * can distinguish "user requested deletion" from regular suspension.
   */
  private async userDelete(clientProfileId: bigint) {
    return this.userSuspend(clientProfileId);
  }

  // ───────────────────────── Platform actions ─────────────────────────

  private async platformSettingUpdate(ctx: ActionContext) {
    const updates = ctx.updates;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      throw new BadRequestException({
        code: 'MISSING_UPDATES',
        message:
          'context.updates must be an object of platform_setting columns to update.',
      });
    }
    const allowed: Array<keyof Prisma.PlatformSettingUpdateInput> = [
      'client_marketplace_fee_percent',
      'freelancer_service_fee_percent',
      'account_referral_pct',
      'account_referral_window_months',
      'project_referral_w2w_pct',
      'stripe_fee_passthrough',
    ];
    const data: Prisma.PlatformSettingUpdateInput = {};
    for (const [k, v] of Object.entries(updates)) {
      if (!(allowed as string[]).includes(k)) continue;
      (data as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'NO_VALID_FIELDS',
        message: `No updatable fields. Allowed: ${allowed.join(', ')}`,
      });
    }
    return this.prisma.platformSetting.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...(data as Prisma.PlatformSettingCreateInput) },
    });
  }

  // ───────────────────────── Broadcast ─────────────────────────

  private async broadcastMessage(ctx: ActionContext) {
    const title = ctx.title;
    const body = ctx.body;
    const audience = (ctx.audience as string | undefined) ?? 'ALL';
    if (typeof title !== 'string' || !title.trim()) {
      throw new BadRequestException({
        code: 'MISSING_TITLE',
        message: 'context.title is required for BROADCAST_MESSAGE.',
      });
    }
    if (typeof body !== 'string' || !body.trim()) {
      throw new BadRequestException({
        code: 'MISSING_BODY',
        message: 'context.body is required for BROADCAST_MESSAGE.',
      });
    }

    const whereClause: Prisma.AccountWhereInput = { status: 'ACTIVE' };
    if (audience === 'WORKERS') {
      whereClause.client_profile = { worker_profile: { isNot: null } };
    } else if (audience === 'EMPLOYERS') {
      whereClause.client_profile = { employer_profile: { isNot: null } };
    } else if (audience === 'CLIENTS') {
      whereClause.client_profile = { isNot: null };
    }

    const recipients = await this.prisma.account.findMany({
      where: whereClause,
      select: { id: true },
    });
    let sent = 0;
    for (const r of recipients) {
      try {
        await this.notifications.create(r.id, {
          type: 'BROADCAST',
          title,
          body,
          data: { audience },
          channel: 'IN_APP',
        });
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Broadcast notification failed for account ${r.id}: ${(err as Error).message}`,
        );
      }
    }
    return { sent, audience };
  }

  // ───────────────────────── helpers ─────────────────────────

  private requireBigIntCtx(ctx: ActionContext, key: string): bigint {
    const v = ctx[key];
    if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
    if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v);
    throw new BadRequestException({
      code: 'MISSING_CONTEXT_FIELD',
      message: `context.${key} (bigint) is required.`,
    });
  }
}
