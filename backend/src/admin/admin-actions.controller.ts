import {
  Body,
  Controller,
  ForbiddenException,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AdminActionsService } from './admin-actions.service';
import { TriggerActionDto } from './dto/trigger-action.dto';
import {
  ADMIN_ACTIONS,
  type ActionContext,
  type AdminActionCode,
} from './admin-action.types';

/**
 * Each admin action code maps to the permission required to invoke it.
 * Without this permission the request is denied even before the approval
 * engine sees it.
 */
const ACTION_PERMISSION: Record<AdminActionCode, string> = {
  [ADMIN_ACTIONS.PAYMENT_MARK_PAID]: 'payments.mark_paid',
  [ADMIN_ACTIONS.PAYMENT_MARK_FAILED]: 'payments.mark_failed',
  [ADMIN_ACTIONS.PAYMENT_RETRY_TRANSFER]: 'payments.retry_transfer',
  [ADMIN_ACTIONS.ESCROW_FORCE_RELEASE]: 'escrow.force_release',
  [ADMIN_ACTIONS.ESCROW_FORCE_REFUND]: 'escrow.force_refund',
  [ADMIN_ACTIONS.ESCROW_FORCE_CANCEL]: 'escrow.force_cancel',
  [ADMIN_ACTIONS.VERIFICATION_DOC_APPROVE]: 'verification.review',
  [ADMIN_ACTIONS.VERIFICATION_DOC_REJECT]: 'verification.review',
  [ADMIN_ACTIONS.VERIFICATION_LEVEL_OVERRIDE]: 'users.set_verification',
  [ADMIN_ACTIONS.USER_SUSPEND]: 'users.suspend',
  [ADMIN_ACTIONS.USER_UNSUSPEND]: 'users.suspend',
  [ADMIN_ACTIONS.USER_DELETE]: 'users.delete',
  [ADMIN_ACTIONS.PLATFORM_SETTING_UPDATE]: 'platform.settings.write',
  [ADMIN_ACTIONS.STAFF_INVITE]: 'staff.invite',
  [ADMIN_ACTIONS.STAFF_ROLE_GRANT]: 'staff.role_change',
  [ADMIN_ACTIONS.STAFF_ROLE_REVOKE]: 'staff.role_change',
  [ADMIN_ACTIONS.BROADCAST_MESSAGE]: 'broadcast.send',
};

@ApiTags('Admin / Actions')
@Controller('admin/actions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF')
@ApiBearerAuth()
export class AdminActionsController {
  constructor(private readonly actions: AdminActionsService) {}

  @Post()
  @Roles('STAFF')
  @ApiOperation({
    summary:
      'Trigger any admin action. Approval engine evaluates rules first — if a rule matches, the action is queued (PENDING_APPROVAL) instead of executing.',
  })
  async trigger(
    @Body() dto: TriggerActionDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    // Per-action permission gate — ADMIN bypasses (has every perm).
    if (user.staffRole !== 'ADMIN') {
      const required = ACTION_PERMISSION[dto.action];
      if (!required) {
        throw new ForbiddenException({
          code: 'NO_PERMISSION_MAPPED',
          message: `Action ${dto.action} has no permission mapping.`,
        });
      }
      const have = new Set(user.permissions ?? []);
      if (!have.has(required)) {
        throw new ForbiddenException({
          code: 'MISSING_PERMISSION',
          message: `Missing permission: ${required}`,
          missing: [required],
        });
      }
    }
    const context: ActionContext = {
      reason: dto.reason,
      ...(dto.amount_pence != null ? { amount_pence: dto.amount_pence } : {}),
      ...(dto.doc_type != null ? { doc_type: dto.doc_type } : {}),
      ...(dto.extra ?? {}),
    };
    const result = await this.actions.request({
      actionCode: dto.action,
      targetKind: dto.target_kind,
      targetId: BigInt(dto.target_id),
      context,
      requestedByStaffId: user.accountId,
      ip,
    });
    // Serialize bigints to strings for JSON safety
    if (result.mode === 'PENDING_APPROVAL') {
      return { mode: result.mode, approval_id: result.approvalId.toString() };
    }
    return { mode: result.mode, audit_id: result.auditId.toString() };
  }
}
