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
import { Matches } from 'class-validator';
import { CreateStaffDto } from './dto/create-staff.dto';
import { SetDutyDto } from './dto/set-duty.dto';
import { StaffService } from './staff.service';

class ChangeStaffRoleDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/, {
    message: 'staff_role must be UPPER_SNAKE_CASE',
  })
  staff_role: string;
}

/**
 * Staff (members) endpoints.
 *
 * Read access is granted to any staff (admin OR moderator) — every member can
 * see who else is on the team.
 *
 * Mutations (create / role change / reset-password / reactivate / deactivate)
 * are admin-only — moderators can browse but not change anything.
 */
@ApiTags('Staff (admin only for mutations)')
@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Roles('STAFF') // ADMIN + MODERATOR
  @ApiOperation({ summary: 'List all staff (visible to any staff member)' })
  list() {
    return this.staffService.list();
  }

  @Post('me/duty')
  @Roles('STAFF')
  @ApiOperation({
    summary:
      "Toggle the caller's on-duty flag. Off-duty redistributes open document assignments to the next available staff.",
  })
  setDuty(
    @Body() dto: SetDutyDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.staffService.setDuty(user.accountId, dto.on_duty, ip);
  }

  @Post()
  @RequirePermissions('staff.invite')
  @ApiOperation({
    summary:
      'Create / invite a staff member. New email → fresh account + emailed password (24h validity). Existing client email → promote to staff (keeps their password).',
  })
  create(
    @Body() dto: CreateStaffDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.staffService.create(dto, user.accountId, ip);
  }

  @Post(':id/reinvite')
  @RequirePermissions('staff.invite')
  @ApiOperation({
    summary:
      'Resend the invite (regenerates password + 24h expiry). Only works while the staff member has never signed in.',
  })
  reinvite(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.staffService.reinvite(id, user.accountId, ip);
  }

  @Post(':id/reset-password')
  @RequirePermissions('staff.reset_password')
  @ApiOperation({
    summary:
      "Force-reset a staff member's password (generates a new one, emails it, signs them out everywhere).",
  })
  resetPassword(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.staffService.resetPassword(id, user.accountId, ip);
  }

  @Patch(':id/role')
  @RequirePermissions('staff.role_change')
  @ApiOperation({
    summary: 'Change a staff member to any role (built-in or custom).',
  })
  changeRole(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ChangeStaffRoleDto,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.staffService.changeRole(id, dto.staff_role, user.accountId, ip);
  }

  @Post(':id/reactivate')
  @RequirePermissions('staff.deactivate')
  @ApiOperation({
    summary: 'Reactivate a previously deactivated staff account',
  })
  reactivate(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.staffService.reactivate(id, user.accountId, ip);
  }

  @Delete(':id')
  @RequirePermissions('staff.deactivate')
  @ApiOperation({ summary: 'Deactivate a staff account' })
  deactivate(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.staffService.deactivate(id, user.accountId, ip);
  }
}
