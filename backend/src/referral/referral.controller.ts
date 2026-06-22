import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { ReferralService } from './referral.service';
import { TrackClickDto } from './dto/track-click.dto';
import { REFERRAL_CODE_REGEX } from './referral.constants';
import { ConfigService } from '@nestjs/config';

@Controller()
export class ReferralController {
  constructor(
    private readonly service: ReferralService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Account-ref share link. Bounces the recipient to the register page
   * with `?ref=CODE` so the form can persist `account.referred_by_id`
   * directly on signup. Pure URL flow — no cookies.
   */
  @Get('r/:code')
  hitRefLink(@Param('code') code: string, @Res() res: Response) {
    const base =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    if (REFERRAL_CODE_REGEX.test(code)) {
      return res.redirect(`${base}/register?ref=${encodeURIComponent(code)}`);
    }
    return res.redirect(base);
  }

  // Public: lightweight name lookup for "you were referred by X" UI.
  @Get('referral/who-referred')
  async whoReferred(@Query('code') code: string) {
    if (!code) throw new BadRequestException('code required');
    const r = await this.service.lookupReferrerByCode(code);
    if (!r) return { display_name: null };
    return { display_name: r.display_name };
  }

  /**
   * Called by frontend on `/jobs/:id?ref=` page mount to record server-side
   * click intent for a job share. Auth-required: anonymous traffic is ignored
   * on these pages (anonymous users hit `/r/:code` for the account-ref flow
   * instead).
   */
  @Post('referral/intent')
  @UseGuards(JwtAuthGuard)
  async recordIntent(
    @Body() dto: TrackClickDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.recordProjectIntent({
      code: dto.code.toUpperCase(),
      actor_client_profile_id: user.accountId,
      target_id: BigInt(dto.target_id),
    });
  }

  // Authed: own ref code + share link.
  @Get('referrals/code')
  @UseGuards(JwtAuthGuard)
  async getOwnCode(@CurrentUser() user: CurrentUserPayload) {
    const { code } = await this.service.getOwnCode(user.accountId);
    const base =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    return { code, link: `${base}/r/${code}` };
  }

  @Get('referrals/account-stats')
  @UseGuards(JwtAuthGuard)
  async accountStats(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getAccountStats(user.accountId);
  }

  @Get('referrals/project-shares')
  @UseGuards(JwtAuthGuard)
  async projectShares(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getProjectShares(user.accountId);
  }

  @Get('referrals/incoming')
  @UseGuards(JwtAuthGuard)
  async incoming(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getIncomingAttribution(user.accountId);
  }

  // Referral-commission payments for the current user (any status). Held
  // commissions (status PENDING) are swept by the escrow `account.updated`
  // handler when the referrer completes Stripe onboarding.
  @Get('referrals/payments')
  @UseGuards(JwtAuthGuard)
  async referralPayments(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getReferralPayments(user.accountId);
  }
}
