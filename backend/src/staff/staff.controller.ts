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
import { IsIn } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { CreateStaffDto } from './dto/create-staff.dto';
import { StaffService } from './staff.service';

class ChangeStaffRoleDto {
  @IsIn(['ADMIN', 'MODERATOR'])
  staff_role: 'ADMIN' | 'MODERATOR';
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
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Roles('STAFF') // ADMIN + MODERATOR
  @ApiOperation({ summary: 'List all staff (visible to any staff member)' })
  list() {
    return this.staffService.list();
  }

  @Post()
  @Roles('ADMIN')
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
  @Roles('ADMIN')
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
  @Roles('ADMIN')
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
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Promote / demote staff between ADMIN and MODERATOR',
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
  @Roles('ADMIN')
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
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Deactivate a staff account' })
  deactivate(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Ip() ip: string,
  ) {
    return this.staffService.deactivate(id, user.accountId, ip);
  }
}
