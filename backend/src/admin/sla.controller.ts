import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  Patch,
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
import { SlaService } from './sla.service';
import {
  CreateSlaRuleDto,
  UpdateSlaRuleDto,
} from './dto/create-sla-rule.dto';

@ApiTags('Admin / SLA rules')
@Controller('admin/sla-rules')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class SlaController {
  constructor(private readonly sla: SlaService) {}

  @Get()
  @Roles('STAFF')
  @ApiOperation({ summary: 'List all SLA rules' })
  list() {
    return this.sla.list();
  }

  @Get('breaches')
  @Roles('STAFF')
  @ApiOperation({ summary: 'List active SLA breaches' })
  @ApiQuery({ name: 'active_only', required: false, type: Boolean })
  breaches(@Query('active_only') activeOnly?: string) {
    return this.sla.listBreaches(activeOnly !== 'false');
  }

  @Get(':id')
  @Roles('STAFF')
  @ApiOperation({ summary: 'Get a single SLA rule' })
  get(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.sla.getById(id);
  }

  @Post()
  @RequirePermissions('sla_rules.manage')
  @ApiOperation({ summary: 'Create an SLA rule' })
  create(
    @Body() dto: CreateSlaRuleDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.sla.create(dto, user.accountId, ip);
  }

  @Patch(':id')
  @RequirePermissions('sla_rules.manage')
  @ApiOperation({ summary: 'Update an SLA rule' })
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateSlaRuleDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.sla.update(id, dto, user.accountId, ip);
  }

  @Delete(':id')
  @RequirePermissions('sla_rules.manage')
  @ApiOperation({ summary: 'Deactivate an SLA rule' })
  deactivate(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.sla.deactivate(id, user.accountId, ip);
  }
}
