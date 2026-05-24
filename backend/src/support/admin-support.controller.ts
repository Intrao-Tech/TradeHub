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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { SupportService } from './support.service';
import {
  AssignSupportThreadDto,
  SendSupportMessageDto,
} from './dto/send-support-message.dto';

@ApiTags('Admin / Support')
@Controller('admin/support')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get('threads')
  @RequirePermissions('support.read')
  @ApiOperation({ summary: 'List support threads (filter / paginate)' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'assigned_to_me', required: false, type: Boolean })
  @ApiQuery({ name: 'unassigned_only', required: false, type: Boolean })
  @ApiQuery({ name: 'has_unread', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('q') q?: string,
    @Query('assigned_to_me') assignedToMe?: string,
    @Query('unassigned_only') unassignedOnly?: string,
    @Query('has_unread') hasUnread?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.support.listThreadsForStaff(
      {
        q,
        assigned_to_me: assignedToMe === 'true',
        unassigned_only: unassignedOnly === 'true',
        has_unread: hasUnread === 'true',
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
      user.accountId,
    );
  }

  @Get('threads/:clientId')
  @RequirePermissions('support.read')
  @ApiOperation({ summary: 'Get a thread (header + client snapshot) by client_profile_id' })
  thread(@Param('clientId', ParseBigIntPipe) clientId: bigint) {
    return this.support.getThreadByClientForStaff(clientId);
  }

  @Get('threads/:clientId/messages')
  @RequirePermissions('support.read')
  @ApiOperation({ summary: 'List messages of a support thread' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  messages(
    @Param('clientId', ParseBigIntPipe) clientId: bigint,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.support.listMessagesForStaff(
      clientId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post('threads/:clientId/messages')
  @RequirePermissions('support.reply')
  @ApiOperation({ summary: 'Send a message to the client as TradeHub Support' })
  send(
    @Param('clientId', ParseBigIntPipe) clientId: bigint,
    @Body() dto: SendSupportMessageDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.support.sendAsStaff(clientId, user.accountId, dto);
  }

  @Post('threads/:clientId/read')
  @RequirePermissions('support.read')
  @ApiOperation({ summary: 'Mark this thread as read by staff' })
  markRead(@Param('clientId', ParseBigIntPipe) clientId: bigint) {
    return this.support.markReadAsStaff(clientId);
  }

  @Post('threads/:clientId/assign')
  @RequirePermissions('support.assign')
  @ApiOperation({
    summary: 'Set the responsible staff member (assignee_staff_id=null to unassign)',
  })
  assign(
    @Param('clientId', ParseBigIntPipe) clientId: bigint,
    @Body() dto: AssignSupportThreadDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    const assigneeId =
      dto.assignee_staff_id != null && dto.assignee_staff_id !== ''
        ? BigInt(dto.assignee_staff_id)
        : null;
    return this.support.assignThread(clientId, assigneeId, user.accountId, ip);
  }
}
