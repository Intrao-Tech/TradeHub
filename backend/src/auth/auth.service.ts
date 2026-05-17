import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { checkPasswordPolicy } from '../common/validators/password-policy';
import type { AccountStatus } from '../common/decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  generateReferralCode,
  REFERRAL_AUDIT_EVENTS,
} from '../referral/referral.constants';

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d

type AccountSummary = {
  id: string;
  email: string;
  is_worker: boolean;
  is_employer: boolean;
  is_staff: boolean;
  verification_state: AccountStatus;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  // ─── Registration ──────────────────────────────────────────────

  async register(dto: RegisterDto, ip?: string) {
    await this.audit.log(
      null,
      'auth.signup.started',
      undefined,
      undefined,
      { email: dto.email },
      ip,
    );

    const policy = checkPasswordPolicy(dto.password);
    if (!policy.ok) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: 'Password does not meet the policy.',
        reasons: policy.reasons,
      });
    }

    const existing = await this.prisma.account.findUnique({
      where: { email: dto.email },
      include: { client_profile: { select: { display_name: true } } },
    });

    if (existing) {
      // Helpful path: account exists but never verified email. Treat the new
      // signup attempt as "please re-send the verification" — same response
      // shape, no user-visible error. The user's original choice of role /
      // password is preserved (we don't update them).
      if (existing.status === 'PENDING_EMAIL_VERIFICATION') {
        this.logger.log(
          `Register re-attempt for unverified ${dto.email} — resending verify email`,
        );
        await this.issueVerificationEmail(
          existing.id,
          existing.email,
          existing.client_profile?.display_name ??
            (dto.role === 'WORKER'
              ? `${(dto.first_name ?? '').trim()} ${(dto.surname ?? '').trim()}`.trim() ||
                dto.email
              : (dto.company_name ?? '').trim() || dto.email),
          ip,
        );
        return { pending_verification: true, email: existing.email };
      }

      // Active or deactivated → surface the collision; UI offers Sign in / Reset.
      this.logger.warn(
        `Register collision for ${dto.email} (status=${existing.status})`,
      );
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'An account already exists for this email.',
        email: dto.email,
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Build display_name from role-specific inputs.
    const displayName =
      dto.role === 'WORKER'
        ? `${(dto.first_name ?? '').trim()} ${(dto.surname ?? '').trim()}`.trim()
        : (dto.company_name ?? '').trim();

    if (!displayName) {
      throw new BadRequestException({
        code: 'VALIDATION',
        message:
          dto.role === 'WORKER'
            ? 'First name and surname are required.'
            : 'Company name is required.',
      });
    }

    const slug = this.generateSlug(displayName);
    const referralCode = await this.allocateReferralCode();

    // Account-referral attribution: takes the `ref` URL param the frontend
    // forwarded into `referred_by_code`. Validates the referrer exists and
    // is not self. Locked at signup forever — never re-attributed.
    const refByCode = dto.referred_by_code;
    let referredById: bigint | null = null;
    if (refByCode) {
      const referrer = await this.prisma.clientProfile.findUnique({
        where: { referral_code: refByCode.toUpperCase() },
        select: { id: true, account: { select: { email: true } } },
      });
      if (referrer && referrer.account.email !== dto.email) {
        referredById = referrer.id;
      }
    }

    const account = await this.prisma.account.create({
      data: {
        email: dto.email,
        password_hash: passwordHash,
        phone: dto.phone,
        status: 'PENDING_EMAIL_VERIFICATION',
        client_profile: {
          create: {
            display_name: displayName,
            slug,
            referral_code: referralCode,
            referred_by_id: referredById,
            referred_at: referredById ? new Date() : null,
            ...(dto.role === 'WORKER'
              ? { worker_profile: { create: {} } }
              : {
                  employer_profile: {
                    create: { company_name: dto.company_name },
                  },
                }),
          },
        },
      },
    });

    if (referredById) {
      await this.audit.log(
        account.id,
        REFERRAL_AUDIT_EVENTS.ACCOUNT_ATTRIBUTED,
        'account',
        account.id,
        { referrer_id: String(referredById), code: refByCode },
        ip,
      );
      // Best-effort: notify the referrer that someone signed up via their link.
      void (async () => {
        try {
          const referrer = await this.prisma.account.findUnique({
            where: { id: referredById },
            include: {
              client_profile: { select: { display_name: true } },
            },
          });
          if (referrer) {
            await this.mail.sendReferralAccountAttributed(
              referrer.email,
              referrer.client_profile?.display_name ?? referrer.email,
              displayName,
              account.email,
            );
          }
        } catch (err) {
          this.logger.warn(
            `Failed to send account-referral notification: ${(err as Error).message}`,
          );
        }
      })();
    }

    await this.audit.log(
      account.id,
      'auth.signup.completed',
      'account',
      account.id,
      { role: dto.role },
      ip,
    );

    // Issue verification token + send email; do NOT issue access tokens; do NOT send welcome.
    await this.issueVerificationEmail(
      account.id,
      account.email,
      displayName,
      ip,
    );

    return {
      pending_verification: true,
      email: account.email,
    };
  }

  // ─── Email verification ────────────────────────────────────────

  async sendVerificationEmail(email: string, ip?: string) {
    const account = await this.prisma.account.findUnique({
      where: { email },
      include: { client_profile: { select: { display_name: true } } },
    });
    // Always 200 — anti-enumeration. Only act when the account actually needs it.
    if (account && account.status === 'PENDING_EMAIL_VERIFICATION') {
      await this.issueVerificationEmail(
        account.id,
        account.email,
        account.client_profile?.display_name ?? 'there',
        ip,
      );
    }
    return { ok: true };
  }

  async confirmVerificationEmail(rawToken: string, ip?: string) {
    const tokenHash = this.hashToken(rawToken);
    const tokenRow = await this.prisma.emailVerificationToken.findUnique({
      where: { token_hash: tokenHash },
      include: {
        account: {
          include: { client_profile: { select: { display_name: true } } },
        },
      },
    });

    if (!tokenRow || tokenRow.consumed_at || tokenRow.expires_at < new Date()) {
      throw new BadRequestException({
        code: 'TOKEN_INVALID',
        message: 'This verification link is invalid or has expired.',
      });
    }

    const account = tokenRow.account;
    if (account.status === 'DEACTIVATED') {
      throw new ForbiddenException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'This account has been deactivated.',
      });
    }

    // Idempotent on already-verified
    const now = new Date();
    if (account.status !== 'ACTIVE') {
      await this.prisma.account.update({
        where: { id: account.id },
        data: { status: 'ACTIVE', email_verified_at: now },
      });
    }
    await this.prisma.emailVerificationToken.update({
      where: { id: tokenRow.id },
      data: { consumed_at: now },
    });

    await this.audit.log(
      account.id,
      'auth.verify_email.completed',
      'account',
      account.id,
      {},
      ip,
    );

    // Welcome email AFTER verification (only the first time)
    if (account.email_verified_at == null) {
      void this.mail.sendWelcome(
        account.email,
        account.client_profile?.display_name ?? account.email,
      );
    }

    // Refetch with full include for the SPA payload (worker_profile / employer_profile / staff_member)
    const fresh = await this.prisma.account.findUniqueOrThrow({
      where: { id: account.id },
      include: {
        client_profile: {
          include: { worker_profile: true, employer_profile: true },
        },
        staff_member: true,
      },
    });
    return this.issueTokens(fresh);
  }

  private async issueVerificationEmail(
    accountId: bigint,
    email: string,
    displayName: string,
    ip?: string,
  ) {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

    await this.prisma.emailVerificationToken.create({
      data: {
        account_id: accountId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    const frontendUrl = this.frontendBase();
    const link = `${frontendUrl}/verify-email/confirm?token=${encodeURIComponent(rawToken)}`;
    void this.mail.sendVerificationEmail(email, displayName, link);
    await this.audit.log(
      accountId,
      'auth.verify_email.sent',
      'account',
      accountId,
      {},
      ip,
    );
  }

  // ─── Password reset ────────────────────────────────────────────

  async forgotPassword(email: string, ip?: string) {
    const account = await this.prisma.account.findUnique({
      where: { email },
      include: {
        client_profile: { select: { display_name: true } },
        staff_member: { select: { id: true } },
      },
    });
    await this.audit.log(
      account?.id ?? null,
      'auth.password_reset.requested',
      'account',
      account?.id,
      { email },
      ip,
    );

    if (
      account &&
      account.status !== 'DEACTIVATED' &&
      // Staff cannot self-reset — admin must use POST /staff/:id/reset-password.
      // Same 200 response either way to preserve anti-enumeration.
      !account.staff_member
    ) {
      const displayName = account.client_profile?.display_name ?? account.email;

      if (account.password_hash) {
        // Standard path — issue reset token (marketplace clients only).
        const rawToken = crypto.randomBytes(32).toString('base64url');
        const tokenHash = this.hashToken(rawToken);
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

        await this.prisma.passwordResetToken.create({
          data: {
            account_id: account.id,
            token_hash: tokenHash,
            expires_at: expiresAt,
          },
        });

        const link = `${this.frontendBase()}/reset-password?token=${encodeURIComponent(rawToken)}`;
        void this.mail.sendPasswordReset(account.email, displayName, link);
      } else if (account.google_id) {
        // Google-only account — instead of nothing, send a friendlier
        // "use Continue with Google" reminder. Same 200 response shape so
        // we don't leak account existence to attackers (only the real owner
        // sees the email).
        void this.mail.sendGoogleSignInReminder(account.email, displayName);
      }
    }
    return { ok: true };
  }

  async resetPassword(rawToken: string, newPassword: string, ip?: string) {
    const policy = checkPasswordPolicy(newPassword);
    if (!policy.ok) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: 'Password does not meet the policy.',
        reasons: policy.reasons,
      });
    }

    const tokenHash = this.hashToken(rawToken);
    const tokenRow = await this.prisma.passwordResetToken.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!tokenRow || tokenRow.consumed_at || tokenRow.expires_at < new Date()) {
      throw new BadRequestException({
        code: 'TOKEN_INVALID',
        message: 'This reset link is invalid or has expired.',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: tokenRow.account_id },
        data: { password_hash: passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: tokenRow.id },
        data: { consumed_at: now },
      }),
      // Revoke ALL sessions per AUTH-007 §7
      this.prisma.refreshToken.deleteMany({
        where: { account_id: tokenRow.account_id },
      }),
    ]);

    await this.audit.log(
      tokenRow.account_id,
      'auth.password_reset.completed',
      'account',
      tokenRow.account_id,
      {},
      ip,
    );

    return { ok: true };
  }

  // ─── Login ─────────────────────────────────────────────────────

  async login(dto: LoginDto, ip?: string) {
    const account = await this.prisma.account.findUnique({
      where: { email: dto.email },
      include: {
        client_profile: {
          include: { worker_profile: true, employer_profile: true },
        },
        staff_member: true,
      },
    });

    if (!account || !account.password_hash) {
      void this.audit.log(
        account?.id ?? null,
        'auth.login.failed',
        'account',
        account?.id,
        {
          reason: 'INVALID_CREDENTIALS',
          email: dto.email,
        },
        ip,
      );
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
      });
    }
    const valid = await bcrypt.compare(dto.password, account.password_hash);
    if (!valid) {
      void this.audit.log(
        account.id,
        'auth.login.failed',
        'account',
        account.id,
        {
          reason: 'INVALID_CREDENTIALS',
          email: dto.email,
        },
        ip,
      );
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
      });
    }

    if (account.status === 'DEACTIVATED') {
      await this.audit.log(
        account.id,
        'auth.login.failed',
        'account',
        account.id,
        {
          reason: 'ACCOUNT_DEACTIVATED',
        },
        ip,
      );
      throw new ForbiddenException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'This account has been deactivated.',
      });
    }

    // PENDING_EMAIL_VERIFICATION: still issue tokens so the SPA can call
    // verify-email/send. AccountStateGuard blocks trust-sensitive routes.
    await this.prisma.account.update({
      where: { id: account.id },
      data: { last_login_at: new Date() },
    });

    if (account.status === 'PENDING_EMAIL_VERIFICATION') {
      await this.audit.log(
        account.id,
        'auth.login.failed',
        'account',
        account.id,
        {
          reason: 'EMAIL_NOT_VERIFIED',
        },
        ip,
      );
      // Still return tokens but flag the state so the SPA routes to /verify-email
      const tokens = await this.issueTokens(account);
      throw new HttpException(
        {
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Please verify your email address.',
          email: account.email,
          ...tokens,
        },
        403,
      );
    }

    await this.audit.log(
      account.id,
      'auth.login.succeeded',
      'account',
      account.id,
      {},
      ip,
    );
    return this.issueTokens(account);
  }

  async refreshTokens(refreshToken: string | undefined) {
    const payload = this.verifyRefreshToken(refreshToken);

    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        account_id: BigInt(payload.sub),
        expires_at: { gt: new Date() },
      },
    });
    if (!stored)
      throw new UnauthorizedException({
        code: 'REFRESH_INVALID',
        message: 'Session expired. Please sign in again.',
      });

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: BigInt(payload.sub) },
      include: {
        client_profile: {
          include: { worker_profile: true, employer_profile: true },
        },
        staff_member: true,
      },
    });

    if (account.status === 'DEACTIVATED') {
      throw new UnauthorizedException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'This account has been deactivated.',
      });
    }

    return this.issueTokens(account);
  }

  // ─── Google OAuth ──────────────────────────────────────────────

  async handleGoogleLogin(
    profile: {
      email: string;
      googleId: string;
      displayName: string;
      role?: 'WORKER' | 'EMPLOYER';
      emailVerified?: boolean;
      intent?: 'login' | 'register';
    },
    ip?: string,
  ) {
    const include = {
      client_profile: {
        include: { worker_profile: true, employer_profile: true },
      },
      staff_member: true,
    } as const;

    const existingByGoogle = await this.prisma.account.findUnique({
      where: { google_id: profile.googleId },
      include,
    });

    if (existingByGoogle) {
      if (existingByGoogle.status === 'DEACTIVATED') {
        throw new ForbiddenException({
          code: 'ACCOUNT_DEACTIVATED',
          message: 'This account has been deactivated.',
        });
      }

      // If the user came from /register but the Google account is already
      // linked, this is a "register-on-an-existing-account" attempt.
      // Tell the SPA to redirect them to /login instead of silently logging in.
      if (profile.intent === 'register') {
        throw new ConflictException({
          code: 'ACCOUNT_EXISTS',
          message:
            'You already have a TradeHub account with this Google identity. Please sign in instead of signing up again.',
          email: existingByGoogle.email,
        });
      }

      await this.prisma.account.update({
        where: { id: existingByGoogle.id },
        data: { last_login_at: new Date() },
      });
      await this.audit.log(
        existingByGoogle.id,
        'auth.login.succeeded',
        'account',
        existingByGoogle.id,
        {
          provider: 'google',
        },
        ip,
      );
      return this.issueTokens(existingByGoogle);
    }

    const byEmail = await this.prisma.account.findUnique({
      where: { email: profile.email },
      include,
    });

    if (byEmail) {
      if (byEmail.status === 'DEACTIVATED') {
        throw new ForbiddenException({
          code: 'ACCOUNT_DEACTIVATED',
          message: 'This account has been deactivated.',
        });
      }

      // AUTH-015-006 (revised): If Google asserts the email is verified, we
      // can safely link without an explicit password step — Google itself
      // verified ownership of the address. If `email_verified` is missing or
      // false (rare enterprise tenants), require explicit linking via password.
      if (profile.emailVerified === true) {
        const linked = await this.prisma.account.update({
          where: { id: byEmail.id },
          data: {
            google_id: profile.googleId,
            last_login_at: new Date(),
            // Linking via verified Google moves PENDING accounts to ACTIVE
            ...(byEmail.status === 'PENDING_EMAIL_VERIFICATION'
              ? { status: 'ACTIVE', email_verified_at: new Date() }
              : {}),
          },
          include,
        });
        await this.audit.log(
          linked.id,
          'auth.google.linked',
          'account',
          linked.id,
          {
            via: 'auto_link_verified_email',
          },
          ip,
        );
        await this.audit.log(
          linked.id,
          'auth.login.succeeded',
          'account',
          linked.id,
          {
            provider: 'google',
          },
          ip,
        );
        return this.issueTokens(linked);
      }

      // No verified-email signal — fall through to explicit linking screen.
      throw new ConflictException({
        code: 'ACCOUNT_EXISTS',
        message:
          'We found an existing TradeHub account with this email. Sign in with your password to confirm, then link Google in Settings → Security.',
        email: profile.email,
      });
    }

    // No account anywhere with this google_id or email.
    // For LOGIN intent — refuse to silently create a new account.
    if (profile.intent === 'login') {
      throw new NotFoundException({
        code: 'NO_GOOGLE_ACCOUNT',
        message:
          'No TradeHub account uses this Google identity. Please sign up first.',
      });
    }

    // Brand-new Google signup
    const slug = this.generateSlug(profile.displayName);
    const trustedVerified = profile.emailVerified === true;
    const referralCode = await this.allocateReferralCode();
    const created = await this.prisma.account.create({
      data: {
        email: profile.email,
        google_id: profile.googleId,
        status: trustedVerified ? 'ACTIVE' : 'PENDING_EMAIL_VERIFICATION',
        email_verified_at: trustedVerified ? new Date() : null,
        client_profile: {
          create: {
            display_name: profile.displayName,
            slug,
            referral_code: referralCode,
            ...(profile.role === 'EMPLOYER'
              ? { employer_profile: { create: {} } }
              : { worker_profile: { create: {} } }),
          },
        },
      },
      include,
    });
    await this.audit.log(
      created.id,
      'auth.signup.completed',
      'account',
      created.id,
      {
        provider: 'google',
        trusted_verified: trustedVerified,
      },
      ip,
    );

    if (!trustedVerified) {
      await this.issueVerificationEmail(
        created.id,
        created.email,
        profile.displayName,
        ip,
      );
    } else {
      void this.mail.sendWelcome(created.email, profile.displayName);
    }

    await this.prisma.account.update({
      where: { id: created.id },
      data: { last_login_at: new Date() },
    });
    await this.audit.log(
      created.id,
      'auth.login.succeeded',
      'account',
      created.id,
      { provider: 'google' },
      ip,
    );

    return this.issueTokens(created);
  }

  async staffLogin(dto: LoginDto, ip?: string) {
    const account = await this.prisma.account.findUnique({
      where: { email: dto.email },
      include: { staff_member: true },
    });
    if (!account || !account.password_hash || !account.staff_member) {
      await this.audit.log(
        account?.id ?? null,
        'auth.login.failed',
        'account',
        account?.id,
        {
          reason: 'INVALID_CREDENTIALS',
          surface: 'staff',
          email: dto.email,
        },
        ip,
      );
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
      });
    }

    const valid = await bcrypt.compare(dto.password, account.password_hash);
    if (!valid) {
      await this.audit.log(
        account.id,
        'auth.login.failed',
        'account',
        account.id,
        {
          reason: 'INVALID_CREDENTIALS',
          surface: 'staff',
        },
        ip,
      );
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
      });
    }

    if (account.status === 'DEACTIVATED') {
      throw new ForbiddenException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'This account has been deactivated.',
      });
    }

    // Invite expiry — only applies before the staff member has ever signed in.
    if (
      account.staff_member.invite_expires_at &&
      account.last_login_at == null &&
      account.staff_member.invite_expires_at < new Date()
    ) {
      await this.audit.log(
        account.id,
        'auth.login.failed',
        'account',
        account.id,
        {
          reason: 'INVITE_EXPIRED',
          surface: 'staff',
        },
        ip,
      );
      throw new UnauthorizedException({
        code: 'INVITE_EXPIRED',
        message:
          'Your staff invite has expired. Ask an admin to send you a fresh invitation.',
      });
    }

    await this.prisma.account.update({
      where: { id: account.id },
      data: { last_login_at: new Date() },
    });
    await this.audit.log(
      account.id,
      'auth.login.succeeded',
      'account',
      account.id,
      { surface: 'staff' },
      ip,
    );

    // staff = always ACTIVE (we don't block staff on email verification for MVP)
    return this.issueTokens({
      id: account.id,
      email: account.email,
      status: 'ACTIVE',
      client_profile: null,
      staff_member: account.staff_member,
    });
  }

  // ─── Logout ────────────────────────────────────────────────────

  async changePassword(
    accountId: bigint,
    currentPassword: string,
    newPassword: string,
    currentRefreshToken: string | undefined,
    ip?: string,
  ) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });
    if (!account || !account.password_hash) {
      // No password to change — this is a Google-only account; instruct the user.
      throw new BadRequestException({
        code: 'NO_PASSWORD_SET',
        message:
          'This account uses Google sign-in. Set a password from your Google account or use "Forgot password" first.',
      });
    }

    const valid = await bcrypt.compare(currentPassword, account.password_hash);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect.',
      });
    }

    const policy = checkPasswordPolicy(newPassword);
    if (!policy.ok) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: 'Password does not meet the policy.',
        reasons: policy.reasons,
      });
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException({
        code: 'SAME_PASSWORD',
        message: 'New password must be different from the current one.',
      });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    // Revoke all OTHER refresh tokens (keep the current device active so the
    // user isn't logged out mid-flow). If the SPA didn't send a current
    // refresh_token (anonymous or stale), revoke them all to be safe.
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: accountId },
        data: { password_hash: newHash },
      }),
      currentRefreshToken
        ? this.prisma.refreshToken.deleteMany({
            where: {
              account_id: accountId,
              NOT: { token: currentRefreshToken },
            },
          })
        : this.prisma.refreshToken.deleteMany({
            where: { account_id: accountId },
          }),
    ]);

    await this.audit.log(
      accountId,
      'auth.password_changed',
      'account',
      accountId,
      { revoked_other_sessions: true },
      ip,
    );

    return { ok: true };
  }

  async logout(
    accountId: bigint,
    refreshToken: string | undefined,
    ip?: string,
  ) {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({
        where: { account_id: accountId, token: refreshToken },
      });
    }
    await this.audit.log(
      accountId,
      'auth.logout',
      'account',
      accountId,
      {},
      ip,
    );
    return { ok: true };
  }

  async logoutAll(accountId: bigint, ip?: string) {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { account_id: accountId },
    });
    await this.audit.log(
      accountId,
      'auth.logout_all',
      'account',
      accountId,
      {
        revoked: result.count,
      },
      ip,
    );
    return { revoked: result.count };
  }

  // ─── Providers ─────────────────────────────────────────────────

  getProviders() {
    const googleId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const googleSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    return { google: !!(googleId && googleSecret) };
  }

  // ─── Internals ─────────────────────────────────────────────────

  private async issueTokens(account: {
    id: bigint;
    email: string;
    status: string;
    client_profile?: {
      worker_profile?: unknown;
      employer_profile?: unknown;
    } | null;
    staff_member?: unknown;
  }): Promise<{
    access_token: string;
    refresh_token: string;
    account: AccountSummary;
  }> {
    const verificationState = (account.status as AccountStatus) ?? 'ACTIVE';
    const payload = {
      sub: account.id.toString(),
      email: account.email,
      vs: verificationState,
    };

    const accessToken = this.jwt.sign(payload as any);
    // jti makes each refresh JWT bytewise unique even when two issuances
    // land in the same wall-clock second (JWT iat is second-precision,
    // so without jti two same-second sign() calls produce identical
    // tokens and collide on the unique constraint of refresh_token.token).
    const refreshToken = this.jwt.sign(
      { ...payload, jti: crypto.randomBytes(16).toString('hex') } as any,
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_TTL', '7d'),
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        account_id: account.id,
        token: refreshToken,
        expires_at: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      account: {
        id: account.id.toString(),
        email: account.email,
        is_worker: !!account.client_profile?.worker_profile,
        is_employer: !!account.client_profile?.employer_profile,
        is_staff: !!account.staff_member,
        verification_state: verificationState,
      },
    };
  }

  private verifyRefreshToken(token: string | undefined) {
    if (!token) {
      throw new UnauthorizedException({
        code: 'REFRESH_INVALID',
        message: 'Session expired. Please sign in again.',
      });
    }
    try {
      return this.jwt.verify<{
        sub: string;
        email: string;
        vs?: AccountStatus;
      }>(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        code: 'REFRESH_INVALID',
        message: 'Session expired. Please sign in again.',
      });
    }
  }

  private generateSlug(displayName: string): string {
    const base = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = Math.random().toString(36).substring(2, 8);
    return `${base}-${suffix}`;
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private async allocateReferralCode(): Promise<string> {
    // Retry up to 5x on the (extremely unlikely) collision; 31^8 codespace.
    for (let i = 0; i < 5; i++) {
      const code = generateReferralCode();
      const taken = await this.prisma.clientProfile.findUnique({
        where: { referral_code: code },
        select: { id: true },
      });
      if (!taken) return code;
    }
    throw new Error('Could not allocate a unique referral code after 5 tries');
  }

  private frontendBase(): string {
    return this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }
}
