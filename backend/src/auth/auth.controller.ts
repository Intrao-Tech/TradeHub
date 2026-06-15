import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import * as crypto from 'node:crypto';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  ConfirmVerifyEmailDto,
  SendVerifyEmailDto,
} from './dto/verify-email.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // ── Marketplace signup / login ───────────────────────────────

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } }) // 5/hour per IP
  @ApiOperation({
    summary:
      'Register with email/password (returns pending_verification, no tokens)',
  })
  register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.authService.register(dto, ip);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 5 * 60 * 1000 } }) // 10 / 5 min per IP
  @ApiOperation({ summary: 'Login with email/password' })
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto, ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 5 * 60 * 1000 } }) // 30 / 5 min per IP
  @ApiOperation({ summary: 'Refresh access token (rotates refresh token)' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refresh_token);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout — invalidates the current refresh token' })
  logout(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
  ) {
    return this.authService.logout(user.accountId, dto.refresh_token, ip);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout — invalidates ALL refresh tokens for this account',
  })
  logoutAll(@CurrentUser() user: CurrentUserPayload, @Ip() ip: string) {
    return this.authService.logoutAll(user.accountId, ip);
  }

  // ── Email verification ───────────────────────────────────────

  @Post('verify-email/send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } }) // 5/hour per IP
  @ApiOperation({
    summary:
      'Resend the email verification link (always 200, anti-enumeration)',
  })
  sendVerifyEmail(@Body() dto: SendVerifyEmailDto, @Ip() ip: string) {
    return this.authService.sendVerificationEmail(dto.email, ip);
  }

  @Post('verify-email/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60 * 60 * 1000 } })
  @ApiOperation({
    summary: 'Confirm email with the token from the verification link',
  })
  confirmVerifyEmail(@Body() dto: ConfirmVerifyEmailDto, @Ip() ip: string) {
    return this.authService.confirmVerificationEmail(dto.token, ip);
  }

  // ── Forgot / reset password ──────────────────────────────────

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } }) // 5/hour per IP
  @ApiOperation({
    summary: 'Send password reset email (always 200, anti-enumeration)',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Ip() ip: string) {
    return this.authService.forgotPassword(dto.email, ip);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  resetPassword(@Body() dto: ResetPasswordDto, @Ip() ip: string) {
    return this.authService.resetPassword(dto.token, dto.password, ip);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  @ApiOperation({
    summary: 'Change password while signed in (requires current password)',
  })
  changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto,
    @Body('refresh_token') refreshToken: string | undefined,
    @Ip() ip: string,
  ) {
    return this.authService.changePassword(
      user.accountId,
      dto.current_password,
      dto.new_password,
      refreshToken,
      ip,
    );
  }

  @Post('set-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  @ApiOperation({
    summary:
      'Set an initial password for an OAuth-only account (no current password required)',
  })
  setPassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SetPasswordDto,
    @Ip() ip: string,
  ) {
    return this.authService.setPassword(user.accountId, dto.new_password, ip);
  }

  @Get('me/auth-methods')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Which sign-in methods this account has (password / Google)',
  })
  getAuthMethods(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.getAuthMethods(user.accountId);
  }

  // ── Providers ────────────────────────────────────────────────

  @Get('providers')
  @ApiOperation({
    summary: 'Which auth providers are configured (e.g. Google)',
  })
  getProviders() {
    return this.authService.getProviders();
  }

  // ── Staff entry ──────────────────────────────────────────────

  @Post('staff/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 5 * 60 * 1000 } })
  @ApiOperation({ summary: 'Staff / admin login' })
  staffLogin(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.staffLogin(dto, ip);
  }

  // ── Google OAuth ─────────────────────────────────────────────

  /**
   * Step 1 of Google flow. The SPA hits this with `?role=…&return_to=…` and
   * gets back the URL to redirect the user to. The backend builds a
   * HMAC-signed `state` so that role / return_to survive the round trip and
   * cannot be tampered with by the user (CSRF protection).
   *
   * The SPA cannot sign state itself (it would need JWT_SECRET).
   */
  @Get('google/start')
  @ApiOperation({
    summary:
      'Build the Google OAuth URL with a signed state (intent + role + return_to)',
  })
  buildGoogleStart(
    @Query('role') role?: string,
    @Query('return_to') returnTo?: string,
    @Query('intent') intent?: string,
    @Query('ref') ref?: string,
  ): { redirect_url: string } {
    const safeRole: 'WORKER' | 'EMPLOYER' =
      role === 'EMPLOYER' ? 'EMPLOYER' : 'WORKER';
    const safeReturnTo = this.isSafeNext(returnTo) ? returnTo : '/profile';
    const safeIntent: 'login' | 'register' =
      intent === 'register' ? 'register' : 'login';
    // Account-referral code from a /r/:code share link — carried through the
    // signed state so it survives the OAuth round trip (Google signup path).
    const safeRef =
      typeof ref === 'string' && ref.trim() !== ''
        ? ref.trim().slice(0, 16)
        : undefined;
    const state = this.buildSignedState({
      role: safeRole,
      return_to: safeReturnTo,
      intent: safeIntent,
      ref: safeRef,
    });

    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID') || '';
    const callbackUrl =
      this.config.get<string>('GOOGLE_CALLBACK_URL') ||
      'http://localhost:8081/api/auth/google/callback';

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state,
    });

    return {
      redirect_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({
    summary:
      'Google OAuth callback — redirects to frontend with tokens or error',
  })
  async googleCallback(
    @Req()
    req: {
      user: {
        googleId: string;
        email: string;
        displayName: string;
        emailVerified?: boolean;
      };
      query: Record<string, string | undefined>;
    },
    @Res() res: Response,
    @Ip() ip: string,
  ) {
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    try {
      let role: 'WORKER' | 'EMPLOYER' = 'WORKER';
      let returnTo = '/profile';
      let intent: 'login' | 'register' = 'login';
      let referredByCode: string | undefined;
      try {
        const raw = req.query?.state;
        if (raw) {
          const parsed = this.parseSignedState(raw);
          if (parsed.role === 'EMPLOYER') role = 'EMPLOYER';
          if (parsed.return_to && this.isSafeNext(parsed.return_to)) {
            returnTo = parsed.return_to;
          }
          if (parsed.intent === 'register') intent = 'register';
          if (typeof parsed.ref === 'string' && parsed.ref !== '') {
            referredByCode = parsed.ref;
          }
        }
      } catch {
        // Bad signature → fallthrough to defaults; security: don't honour state
      }

      const tokens = await this.authService.handleGoogleLogin(
        {
          googleId: req.user.googleId,
          email: req.user.email,
          displayName: req.user.displayName,
          emailVerified: req.user.emailVerified === true,
          role,
          intent,
          referredByCode,
        },
        ip,
      );

      const params = new URLSearchParams({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        next: returnTo,
        state: tokens.account.verification_state,
        is_worker: String(tokens.account.is_worker),
        is_employer: String(tokens.account.is_employer),
        is_staff: String(tokens.account.is_staff),
      });
      return res.redirect(`${frontendUrl}/oauth/callback?${params.toString()}`);
    } catch (err) {
      // Surface explicit error codes so the SPA can render the right screen
      if (err && typeof err === 'object' && 'response' in err) {
        const r = (err as { response?: { code?: string; email?: string } })
          .response;
        const intent = (() => {
          try {
            const raw = req.query?.state;
            if (!raw) return 'login';
            const parsed = this.parseSignedState(raw);
            return parsed.intent === 'register' ? 'register' : 'login';
          } catch {
            return 'login';
          }
        })();

        if (r?.code === 'ACCOUNT_EXISTS' && r.email) {
          const params = new URLSearchParams({
            error: 'ACCOUNT_EXISTS',
            email: r.email,
            intent,
          });
          return res.redirect(
            `${frontendUrl}/oauth/callback?${params.toString()}`,
          );
        }
        if (r?.code === 'NO_GOOGLE_ACCOUNT') {
          const params = new URLSearchParams({
            error: 'NO_GOOGLE_ACCOUNT',
            intent,
          });
          return res.redirect(
            `${frontendUrl}/oauth/callback?${params.toString()}`,
          );
        }
        if (r?.code === 'ACCOUNT_DEACTIVATED') {
          return res.redirect(`${frontendUrl}/login?reason=deactivated`);
        }
      }
      const message =
        err instanceof Error ? err.message : 'Google login failed';
      const params = new URLSearchParams({ error: message });
      return res.redirect(`${frontendUrl}/oauth/callback?${params.toString()}`);
    }
  }

  private buildSignedState(payload: {
    role: 'WORKER' | 'EMPLOYER';
    return_to: string;
    intent: 'login' | 'register';
    ref?: string;
  }): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url',
    );
    const secret = this.config.get<string>('JWT_SECRET') || '';
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return `${body}.${sig}`;
  }

  private parseSignedState(raw: string): {
    role?: string;
    return_to?: string;
    intent?: string;
    ref?: string;
  } {
    const [body, signature] = decodeURIComponent(raw).split('.');
    if (!body || !signature) throw new Error('malformed state');
    const secret = this.config.get<string>('JWT_SECRET') || '';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new Error('bad signature');
    }
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      role?: string;
      return_to?: string;
      intent?: string;
      ref?: string;
    };
  }

  private isSafeNext(path: string | undefined): path is string {
    return (
      typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
    );
  }
}
