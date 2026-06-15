import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { CisService } from './cis.service';
import { CisReturnService } from './cis-return.service';
import { ConfirmCisDto } from './dto/confirm-cis.dto';
import { BuildReturnDto } from './dto/build-return.dto';
import { SetModeDto } from './dto/set-mode.dto';

@ApiTags('CIS')
@Controller('cis')
export class CisController {
  constructor(
    private readonly cis: CisService,
    private readonly returns: CisReturnService,
  ) {}

  // ── Worker: read + self-declare own CIS standing ────────────────────────

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'My CIS standing (worker)' })
  myCis(@CurrentUser() user: CurrentUserPayload) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.cis.getWorkerCis(user.clientProfileId);
  }

  @Post('me/declare')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Worker: declare own CIS status (self-declaration — unlocks applying; staff/HMRC verifies later)',
  })
  async declare(
    @Body() dto: ConfirmCisDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    await this.cis.confirmWorkerCis({
      workerClientProfileId: user.clientProfileId,
      status: dto.status,
      verificationNumber: dto.verification_number ?? null,
      staffMemberId: null,
      verified: false,
    });
    return this.cis.getWorkerCis(user.clientProfileId);
  }

  // ── Parties of a contract: see the CIS breakdown + PDS for a milestone ──

  @Get('milestones/:id/breakdown')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'CIS deduction breakdown for a milestone' })
  async breakdown(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const ctx = await this.cis.getMilestoneCisContext(id, {
      clientProfileId: user.clientProfileId,
      isStaff: user.isStaff,
    });
    if (!ctx) throw new NotFoundException('Milestone not found');
    const b = ctx.breakdown;
    return {
      applies: ctx.applies,
      mode: ctx.mode,
      worker_cis_status: ctx.workerCisStatus,
      verification_number: ctx.verificationNumber,
      verified: ctx.verified,
      rate: b.rate,
      labour: b.labour.toFixed(2),
      materials: b.materials.toFixed(2),
      gross: b.gross.toFixed(2),
      deduction: b.deduction.toFixed(2),
      net_to_worker: b.netToWorker.toFixed(2),
      worker_receives:
        ctx.actualWorkerPayout != null
          ? ctx.actualWorkerPayout.toFixed(2)
          : null,
    };
  }

  @Get('milestones/:id/pds')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Payment & Deduction Statement (PDS) for a milestone' })
  async pds(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const pds = await this.cis.buildPds(id, {
      clientProfileId: user.clientProfileId,
      isStaff: user.isStaff,
    });
    if (!pds) throw new NotFoundException('Milestone not found');
    return pds;
  }

  // ── Staff: confirm a worker's CIS standing (manual HMRC review) ─────────

  @Post('admin/workers/:id/confirm')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Staff: confirm a worker CIS status + rate' })
  async confirm(
    @Param('id', ParseBigIntPipe) workerClientProfileId: bigint,
    @Body() dto: ConfirmCisDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.cis.confirmWorkerCis({
      workerClientProfileId,
      status: dto.status,
      verificationNumber: dto.verification_number ?? null,
      staffMemberId: user.accountId,
    });
    return { ok: true };
  }

  // ── Staff: global V1↔V2 mode switch ─────────────────────────────────────

  @Get('admin/mode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Staff: read the global CIS handling mode (V1/V2)' })
  async getMode() {
    return { mode: await this.cis.getGlobalMode() };
  }

  @Patch('admin/mode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Staff: switch the global CIS handling mode (ASSIST ↔ MANAGED)',
  })
  async setMode(
    @Body() dto: SetModeDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const mode = await this.cis.setGlobalMode(dto.mode, user.accountId);
    return { mode };
  }

  // ── Staff: V2 monthly CIS300 returns (MOCKED submit + remit) ────────────

  @Get('admin/returns')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Staff: list CIS300 monthly returns (V2)' })
  listReturns() {
    return this.returns.listReturns();
  }

  @Post('admin/returns/build')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Staff: build/refresh a monthly CIS300 draft (V2)' })
  buildReturn(@Body() dto: BuildReturnDto) {
    return this.returns.buildMonthlyReturn(dto.tax_year, dto.tax_month);
  }

  @Post('admin/returns/:id/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Staff: submit a CIS300 return to HMRC (MOCKED in V2)' })
  submitReturn(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.returns.submitReturn(id, user.accountId);
  }

  @Post('admin/returns/:id/remit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Staff: remit withheld CIS to HMRC (MOCKED in V2)' })
  remitReturn(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.returns.remitReturn(id, user.accountId);
  }
}
