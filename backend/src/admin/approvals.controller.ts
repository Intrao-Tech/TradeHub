import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AdminActionsService } from './admin-actions.service';
import {
  ApproveApprovalDto,
  RejectApprovalDto,
} from './dto/resolve-approval.dto';

const ALLOWED_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXECUTED',
  'CANCELED',
  'EXPIRED',
];

@ApiTags('Admin / Action approvals')
@Controller('admin/approvals')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class ApprovalsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actions: AdminActionsService,
  ) {}

  @Get()
  @RequirePermissions('approvals.read')
  @ApiOperation({
    summary:
      'List action approvals. Defaults to PENDING + any role; filter via query params.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ALLOWED_STATUSES })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(
    @Query('status') status?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = pageStr ? Math.max(1, parseInt(pageStr, 10)) : 1;
    const limit = Math.min(
      100,
      Math.max(1, limitStr ? parseInt(limitStr, 10) : 20),
    );
    const where: Prisma.StaffActionApprovalWhereInput = {};
    if (status && ALLOWED_STATUSES.includes(status)) {
      where.status = status;
    } else {
      where.status = 'PENDING';
    }

    const [rows, total] = await Promise.all([
      this.prisma.staffActionApproval.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { requested_at: 'desc' },
        include: {
          rule: {
            include: {
              target_action_type: true,
              required_approver_role: true,
            },
          },
          target_kind: true,
          requested_by: { select: { id: true, display_name: true } },
          approved_by: { select: { id: true, display_name: true } },
        },
      }),
      this.prisma.staffActionApproval.count({ where }),
    ]);
    return {
      data: rows.map((r) => this.serialize(r)),
      total,
      page,
      limit,
    };
  }

  @Get(':id')
  @RequirePermissions('approvals.read')
  @ApiOperation({ summary: 'Get a single approval by id' })
  async get(@Param('id', ParseBigIntPipe) id: bigint) {
    const row = await this.prisma.staffActionApproval.findUnique({
      where: { id },
      include: {
        rule: {
          include: {
            target_action_type: true,
            required_approver_role: true,
          },
        },
        target_kind: true,
        requested_by: { select: { id: true, display_name: true } },
        approved_by: { select: { id: true, display_name: true } },
      },
    });
    if (!row) {
      return { error: 'APPROVAL_NOT_FOUND' };
    }
    return this.serialize(row);
  }

  @Post(':id/approve')
  @RequirePermissions('approvals.resolve')
  @ApiOperation({
    summary:
      'Approve a pending request — re-executes the action with the original context. Caller must have the rule.required_approver_role.',
  })
  approve(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ApproveApprovalDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.actions.approve(id, user.accountId, dto.reason, ip);
  }

  @Post(':id/reject')
  @RequirePermissions('approvals.resolve')
  @ApiOperation({
    summary:
      'Reject a pending request. Caller must have the rule.required_approver_role.',
  })
  reject(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: RejectApprovalDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.actions.reject(id, user.accountId, dto.reason, ip);
  }

  private serialize(row: {
    id: bigint;
    status: string;
    context: Prisma.JsonValue;
    target_id: bigint;
    requested_reason: string | null;
    approver_reason: string | null;
    requested_at: Date;
    resolved_at: Date | null;
    expires_at: Date | null;
    rule: {
      id: bigint;
      name: string;
      target_action_type: { name: string; description: string };
      required_approver_role: { name: string };
    };
    target_kind: { name: string };
    requested_by: { id: bigint; display_name: string };
    approved_by: { id: bigint; display_name: string } | null;
  }) {
    return {
      id: row.id.toString(),
      status: row.status,
      action: row.rule.target_action_type.name,
      action_description: row.rule.target_action_type.description,
      rule: { id: row.rule.id.toString(), name: row.rule.name },
      required_approver_role: row.rule.required_approver_role.name,
      target_kind: row.target_kind.name,
      target_id: row.target_id.toString(),
      context: row.context,
      requested_by: {
        id: row.requested_by.id.toString(),
        display_name: row.requested_by.display_name,
      },
      requested_reason: row.requested_reason,
      approved_by: row.approved_by
        ? {
            id: row.approved_by.id.toString(),
            display_name: row.approved_by.display_name,
          }
        : null,
      approver_reason: row.approver_reason,
      requested_at: row.requested_at,
      resolved_at: row.resolved_at,
      expires_at: row.expires_at,
    };
  }
}
