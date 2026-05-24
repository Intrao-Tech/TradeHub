import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { AdminUsersService } from './admin-users.service';

@ApiTags('Admin / Users')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @RequirePermissions('users.read')
  @ApiOperation({
    summary:
      'Search users by email, display_name, slug, postcode or referral_code',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({
    name: 'kind',
    required: false,
    enum: ['WORKER', 'EMPLOYER', 'STAFF', 'ANY'],
  })
  @ApiQuery({ name: 'verification_level', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  search(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('kind') kind?: 'WORKER' | 'EMPLOYER' | 'STAFF' | 'ANY',
    @Query('verification_level') verification_level?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.users.search({
      q,
      status,
      kind,
      verification_level,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('users.read')
  @ApiOperation({
    summary:
      'Full user detail: client + worker/employer/staff facets, recent audit, payment totals, open disputes, reviewable items',
  })
  detail(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.users.getDetail(id);
  }
}
