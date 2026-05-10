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
import {
  REFERRAL_CODE_REGEX,
  REF_COOKIE_NAMES,
  REF_COOKIE_TTL_MS,
} from './referral.constants';
import { ConfigService } from '@nestjs/config';

@Controller()
export class ReferralController {
  constructor(
    private readonly service: ReferralService,
    private readonly config: ConfigService,
  ) {}

  // Public: hit by the share-link recipient. Sets cookie + redirects home.
  @Get('r/:code')
  async hitRefLink(@Param('code') code: string, @Res() res: Response) {
    if (REFERRAL_CODE_REGEX.test(code)) {
      const referrer = await this.service.lookupReferrerByCode(code);
      if (referrer) {
        res.cookie(
          REF_COOKIE_NAMES.ACCOUNT,
          JSON.stringify({
            code: referrer.referral_code,
            type: 'ACCOUNT',
            set_at: new Date().toISOString(),
          }),
          {
            maxAge: REF_COOKIE_TTL_MS,
            httpOnly: false,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
          },
        );
      }
    }
    const home =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    return res.redirect(home);
  }

  // Public: lightweight name lookup for "you were referred by X" UI.
  @Get('referral/who-referred')
  async whoReferred(@Query('code') code: string) {
    if (!code) throw new BadRequestException('code required');
    const r = await this.service.lookupReferrerByCode(code);
    if (!r) return { display_name: null };
    return { display_name: r.client_profile?.display_name ?? null };
  }

  // Public: called by frontend on /jobs/:id?ref= and /workers/:id?ref= mounts.
  @Post('referral/track-click')
  async trackClick(@Body() dto: TrackClickDto, @Res() res: Response) {
    const result = await this.service.attributeProjectClick({
      code: dto.code.toUpperCase(),
      target_id: BigInt(dto.target_id),
      target_role: dto.target_role,
    });
    res.cookie(
      REF_COOKIE_NAMES.PROJECT,
      JSON.stringify({
        code: dto.code.toUpperCase(),
        type: 'PROJECT',
        target_id: String(dto.target_id),
        target_role: dto.target_role,
        set_at: new Date().toISOString(),
      }),
      {
        maxAge: REF_COOKIE_TTL_MS,
        httpOnly: false,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    );
    return res.json(result);
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

  @Get('referrals/pending-payouts')
  @UseGuards(JwtAuthGuard)
  async pendingPayouts(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getPendingPayouts(user.accountId);
  }

  /**
   * Manual retry trigger for the current user's pending referral payouts.
   * Useful when the webhook sweep didn't catch a payouts_enabled flip
   * (e.g., dev tunnels offline at the moment the Stripe event fired).
   */
  @Post('referrals/pending-payouts/retry')
  @UseGuards(JwtAuthGuard)
  async retryPendingPayouts(@CurrentUser() user: CurrentUserPayload) {
    return this.service.payPendingReferralPayouts(user.accountId);
  }
}
