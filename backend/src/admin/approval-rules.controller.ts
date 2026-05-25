import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import {
  CreateApprovalRuleDto,
  UpdateApprovalRuleDto,
} from './dto/create-approval-rule.dto';
import { ApprovalRulesService } from './approval-rules.service';

@ApiTags('Admin / Approval rules')
@Controller('admin/approval-rules')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class ApprovalRulesController {
  constructor(private readonly rules: ApprovalRulesService) {}

  @Get()
  @Roles('STAFF')
  @ApiOperation({ summary: 'List all approval rules (visible to any staff)' })
  list() {
    return this.rules.list();
  }

  @Get(':id')
  @Roles('STAFF')
  @ApiOperation({ summary: 'Get a single approval rule by id' })
  get(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.rules.getById(id);
  }

  @Post()
  @RequirePermissions('approval_rules.manage')
  @ApiOperation({
    summary:
      'Create a new approval rule (admin only). Conditions are AND-ed at evaluation time.',
  })
  create(
    @Body() dto: CreateApprovalRuleDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.rules.create(dto, user.accountId, ip);
  }

  @Patch(':id')
  @RequirePermissions('approval_rules.manage')
  @ApiOperation({
    summary:
      'Update a rule (name/description/is_active only). Conditions are immutable — create a new rule instead.',
  })
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateApprovalRuleDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.rules.update(id, dto, user.accountId, ip);
  }

  @Delete(':id')
  @RequirePermissions('approval_rules.manage')
  @ApiOperation({
    summary: 'Deactivate a rule (soft delete — sets is_active=false)',
  })
  deactivate(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.rules.deactivate(id, user.accountId, ip);
  }
}
