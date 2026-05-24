import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { RolesService } from './roles.service';
import {
  CreateRoleDto,
  SetRolePermissionsDto,
  UpdateRoleDto,
} from './dto/role-dto';

@ApiTags('Admin / Roles & permissions')
@Controller('admin/roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Roles('STAFF')
  @ApiOperation({ summary: 'List all roles with their permissions' })
  list() {
    return this.roles.listRoles();
  }

  @Get('permissions')
  @Roles('STAFF')
  @ApiOperation({ summary: 'List all permission keys, grouped by category' })
  permissions() {
    return this.roles.listPermissions();
  }

  @Get(':id')
  @Roles('STAFF')
  @ApiOperation({ summary: 'Get a single role by id' })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.roles.getRole(id);
  }

  @Post()
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Create a custom role' })
  create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.roles.createRole(dto, user.accountId, ip);
  }

  @Patch(':id')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Rename or describe an existing role' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.roles.updateRole(id, dto, user.accountId, ip);
  }

  @Put(':id/permissions')
  @RequirePermissions('roles.manage')
  @ApiOperation({
    summary:
      'Replace the full set of permissions for a role. ADMIN cannot be edited.',
  })
  setPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.roles.setRolePermissions(id, dto, user.accountId, ip);
  }

  @Delete(':id')
  @RequirePermissions('roles.manage')
  @ApiOperation({
    summary:
      'Delete a custom role. System roles (ADMIN, STAFF) cannot be deleted. Roles still held by any staff member cannot be deleted.',
  })
  delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.roles.deleteRole(id, user.accountId, ip);
  }
}
