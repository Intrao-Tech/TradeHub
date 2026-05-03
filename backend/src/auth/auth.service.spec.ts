// TEST-AUTH-011..019, TEST-AUTH-021 — AuthService unit specs.
//
// Pure-logic tests with deep-mocked Prisma + Jest mocks for MailService,
// AuditService, ConfigService, JwtService. No Postgres, no Nest container.
// Each test cites the AUTH-NNN clause it guards.

import * as bcrypt from 'bcrypt';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import type { RegisterDto } from './dto/register.dto';

// ── Test scaffolding ─────────────────────────────────────────────

type Mocks = {
  prisma: DeepMockProxy<PrismaService>;
  jwt: jest.Mocked<JwtService>;
  config: jest.Mocked<ConfigService>;
  mail: jest.Mocked<MailService>;
  audit: jest.Mocked<AuditService>;
};

function build(): { service: AuthService; mocks: Mocks } {
  const prisma = mockDeep<PrismaService>();
  const jwt = {
    sign: jest.fn((p: object, opts?: { secret?: string; expiresIn?: string }) =>
      `signed:${JSON.stringify(p)}:${opts?.expiresIn ?? 'access'}`,
    ),
    verify: jest.fn(),
    verifyAsync: jest.fn(),
    decode: jest.fn(),
    signAsync: jest.fn(),
  } as unknown as jest.Mocked<JwtService>;
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      const env: Record<string, string | undefined> = {
        JWT_SECRET: 'test-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_REFRESH_TTL: '7d',
        FRONTEND_URL: 'http://localhost:3000',
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: '',
      };
      return env[key] ?? fallback;
    }),
  } as unknown as jest.Mocked<ConfigService>;
  const mail = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendWelcome: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendGoogleSignInReminder: jest.fn().mockResolvedValue(undefined),
    sendStaffInvite: jest.fn().mockResolvedValue(undefined),
    sendStaffPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendStaffPromotion: jest.fn().mockResolvedValue(undefined),
    sendEscrowFunded: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<MailService>;
  const audit = {
    log: jest.fn().mockResolvedValue({ id: 1n }),
  } as unknown as jest.Mocked<AuditService>;

  // The real $transaction([...]) executes its array of promises sequentially
  // — replicate that so service code that wraps writes in a transaction works.
  prisma.$transaction.mockImplementation(async (input: unknown) => {
    if (Array.isArray(input)) return Promise.all(input);
    if (typeof input === 'function') {
      return (input as (p: PrismaService) => unknown)(prisma);
    }
    return undefined;
  });

  const service = new AuthService(prisma, jwt, config, mail, audit);
  return { service, mocks: { prisma, jwt, config, mail, audit } };
}

const VALID_PWD = 'Tr@deHubTest1!';

const baseRegisterDto: RegisterDto = {
  email: 'new@example.com',
  password: VALID_PWD,
  role: 'WORKER',
  first_name: 'Mike',
  surname: 'Builder',
};

// ── TEST-AUTH-011 register() ────────────────────────────────────

describe('TEST-AUTH-011 AuthService.register', () => {
  test('AUTH-015-001 — fresh worker register creates Account in PENDING_EMAIL_VERIFICATION + worker_profile + sends verify email, NO welcome', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue(null);
    mocks.prisma.account.create.mockResolvedValue({
      id: 7n,
      email: baseRegisterDto.email,
    } as never);
    mocks.prisma.emailVerificationToken.create.mockResolvedValue({} as never);

    const result = await service.register(baseRegisterDto, '127.0.0.1');

    expect(result).toEqual({
      pending_verification: true,
      email: baseRegisterDto.email,
    });
    expect(mocks.prisma.account.create).toHaveBeenCalledTimes(1);
    const createArgs = mocks.prisma.account.create.mock.calls[0][0] as {
      data: { status: string; client_profile: { create: object } };
    };
    expect(createArgs.data.status).toBe('PENDING_EMAIL_VERIFICATION');
    expect(createArgs.data.client_profile.create).toMatchObject({
      worker_profile: { create: {} },
    });
    expect(mocks.mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(mocks.mail.sendWelcome).not.toHaveBeenCalled();
  });

  test('AUTH-019-001 — fresh employer register creates employer_profile with company_name', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue(null);
    mocks.prisma.account.create.mockResolvedValue({
      id: 8n,
      email: 'emp@co.uk',
    } as never);

    await service.register(
      {
        email: 'emp@co.uk',
        password: VALID_PWD,
        role: 'EMPLOYER',
        company_name: 'Acme Build Ltd',
      },
      '127.0.0.1',
    );

    const createArgs = mocks.prisma.account.create.mock.calls[0][0] as {
      data: { client_profile: { create: { employer_profile: { create: { company_name: string } } } } };
    };
    expect(createArgs.data.client_profile.create.employer_profile.create).toEqual({
      company_name: 'Acme Build Ltd',
    });
  });

  test('Decisions Log 2026-04-26 (Re-registration on PENDING) — silently re-issues verification email + returns pending_verification', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 11n,
      email: baseRegisterDto.email,
      status: 'PENDING_EMAIL_VERIFICATION',
      client_profile: { display_name: 'Existing User' },
    } as never);
    mocks.prisma.emailVerificationToken.create.mockResolvedValue({} as never);

    const result = await service.register(baseRegisterDto);

    expect(result).toEqual({
      pending_verification: true,
      email: baseRegisterDto.email,
    });
    // No new Account row — we re-issued instead.
    expect(mocks.prisma.account.create).not.toHaveBeenCalled();
    expect(mocks.mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  test('AUTH-015-001 — re-registration on ACTIVE collision throws 409 EMAIL_TAKEN', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 12n,
      email: baseRegisterDto.email,
      status: 'ACTIVE',
      client_profile: { display_name: 'Active User' },
    } as never);

    await expect(service.register(baseRegisterDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    try {
      await service.register(baseRegisterDto);
    } catch (err) {
      const body = (err as ConflictException).getResponse() as {
        code: string;
      };
      expect(body.code).toBe('EMAIL_TAKEN');
    }
  });

  test('AUTH-015-001 — re-registration on DEACTIVATED also throws 409 EMAIL_TAKEN', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 13n,
      email: baseRegisterDto.email,
      status: 'DEACTIVATED',
      client_profile: { display_name: 'Gone User' },
    } as never);
    await expect(service.register(baseRegisterDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  test('AUTH-015-004 — weak password rejected with BadRequest + WEAK_PASSWORD code + reasons[]', async () => {
    const { service } = build();
    try {
      await service.register({ ...baseRegisterDto, password: 'short' });
      fail('expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as {
        code: string;
        reasons: string[];
      };
      expect(body.code).toBe('WEAK_PASSWORD');
      expect(body.reasons).toEqual(expect.arrayContaining(['too_short']));
    }
  });
});

// ── TEST-AUTH-012 login() ───────────────────────────────────────

describe('TEST-AUTH-012 AuthService.login', () => {
  test('AUTH-004 — unknown email rejected with the same INVALID_CREDENTIALS shape as wrong password', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue(null);

    let unknownErr: unknown;
    try {
      await service.login({ email: 'noone@x.io', password: VALID_PWD });
    } catch (e) {
      unknownErr = e;
    }
    expect(unknownErr).toBeInstanceOf(UnauthorizedException);
    const unknownBody = (unknownErr as UnauthorizedException).getResponse();

    // Now wrong password
    mocks.prisma.account.findUnique.mockResolvedValueOnce({
      id: 1n,
      email: 'real@x.io',
      password_hash: await bcrypt.hash('rightpassword!A1', 4),
      status: 'ACTIVE',
      client_profile: { worker_profile: {}, employer_profile: null },
      staff_member: null,
    } as never);
    let wrongErr: unknown;
    try {
      await service.login({ email: 'real@x.io', password: 'wrongpassword!Z9' });
    } catch (e) {
      wrongErr = e;
    }
    expect(wrongErr).toBeInstanceOf(UnauthorizedException);
    const wrongBody = (wrongErr as UnauthorizedException).getResponse();
    // Anti-enumeration: the body shape must be identical between unknown email
    // and wrong password — no oracle for attackers.
    expect(unknownBody).toEqual(wrongBody);
  });

  test('AUTH-014-001 — successful login response includes role flags + verification_state', async () => {
    const { service, mocks } = build();
    const hash = await bcrypt.hash('TestPass1!', 4);
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 42n,
      email: 'worker@x.io',
      password_hash: hash,
      status: 'ACTIVE',
      client_profile: { worker_profile: {}, employer_profile: null },
      staff_member: null,
    } as never);
    mocks.prisma.account.update.mockResolvedValue({} as never);
    mocks.prisma.refreshToken.create.mockResolvedValue({} as never);

    const result = await service.login({
      email: 'worker@x.io',
      password: 'TestPass1!',
    });
    expect(result.account).toMatchObject({
      id: '42',
      email: 'worker@x.io',
      is_worker: true,
      is_employer: false,
      is_staff: false,
      verification_state: 'ACTIVE',
    });
    expect(result.access_token).toBeTruthy();
    expect(result.refresh_token).toBeTruthy();
  });

  test('Decisions Log 2026-04-26 (GlobalExceptionFilter body merge) — PENDING login throws HttpException with code EMAIL_NOT_VERIFIED + tokens still issued', async () => {
    const { service, mocks } = build();
    const hash = await bcrypt.hash('TestPass1!', 4);
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 50n,
      email: 'pending@x.io',
      password_hash: hash,
      status: 'PENDING_EMAIL_VERIFICATION',
      client_profile: { worker_profile: {}, employer_profile: null },
      staff_member: null,
    } as never);
    mocks.prisma.account.update.mockResolvedValue({} as never);
    mocks.prisma.refreshToken.create.mockResolvedValue({} as never);

    let err: unknown;
    try {
      await service.login({ email: 'pending@x.io', password: 'TestPass1!' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpException);
    const body = (err as HttpException).getResponse() as Record<string, unknown>;
    expect(body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(body.email).toBe('pending@x.io');
    // Tokens are still issued in the body so the SPA can call verify-email/send.
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect((err as HttpException).getStatus()).toBe(403);
  });

  test('AUTH-002 — DEACTIVATED account rejected with 403 ACCOUNT_DEACTIVATED, no tokens', async () => {
    const { service, mocks } = build();
    const hash = await bcrypt.hash('TestPass1!', 4);
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 60n,
      email: 'gone@x.io',
      password_hash: hash,
      status: 'DEACTIVATED',
      client_profile: { worker_profile: {}, employer_profile: null },
      staff_member: null,
    } as never);

    await expect(
      service.login({ email: 'gone@x.io', password: 'TestPass1!' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  test('AUTH-014-001 — successful login bumps account.last_login_at', async () => {
    const { service, mocks } = build();
    const hash = await bcrypt.hash('TestPass1!', 4);
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 99n,
      email: 'a@x.io',
      password_hash: hash,
      status: 'ACTIVE',
      client_profile: { worker_profile: {}, employer_profile: null },
      staff_member: null,
    } as never);
    mocks.prisma.account.update.mockResolvedValue({} as never);
    mocks.prisma.refreshToken.create.mockResolvedValue({} as never);

    await service.login({ email: 'a@x.io', password: 'TestPass1!' });
    const updateCalls = mocks.prisma.account.update.mock.calls;
    expect(updateCalls.length).toBeGreaterThan(0);
    const lastLoginUpdate = updateCalls.find(
      (c) =>
        (c[0] as { data: { last_login_at?: Date } }).data.last_login_at !==
        undefined,
    );
    expect(lastLoginUpdate).toBeDefined();
  });
});

// ── TEST-AUTH-013 forgotPassword() ──────────────────────────────

describe('TEST-AUTH-013 AuthService.forgotPassword', () => {
  test('AUTH-007 — unknown email returns 200 ok:true and sends NO mail', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue(null);

    const result = await service.forgotPassword('noone@x.io');
    expect(result).toEqual({ ok: true });
    expect(mocks.mail.sendPasswordReset).not.toHaveBeenCalled();
    expect(mocks.mail.sendGoogleSignInReminder).not.toHaveBeenCalled();
  });

  test('§11 + AUTH-007 — staff email returns 200 ok:true but issues NO reset token and sends NO reset mail', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 11n,
      email: 'admin@x.io',
      password_hash: 'h',
      google_id: null,
      status: 'ACTIVE',
      client_profile: { display_name: 'Admin' },
      staff_member: { id: 11n },
    } as never);

    const result = await service.forgotPassword('admin@x.io');
    expect(result).toEqual({ ok: true });
    expect(mocks.prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mocks.mail.sendPasswordReset).not.toHaveBeenCalled();
    expect(mocks.mail.sendGoogleSignInReminder).not.toHaveBeenCalled();
  });

  test('Decisions Log 2026-04-26 (Google-only friendlier reminder) — Google-only account triggers sendGoogleSignInReminder, NO reset token issued', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 21n,
      email: 'g@x.io',
      password_hash: null,
      google_id: 'gid_abc',
      status: 'ACTIVE',
      client_profile: { display_name: 'G' },
      staff_member: null,
    } as never);

    const result = await service.forgotPassword('g@x.io');
    expect(result).toEqual({ ok: true });
    expect(mocks.prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mocks.mail.sendGoogleSignInReminder).toHaveBeenCalledWith(
      'g@x.io',
      'G',
    );
    expect(mocks.mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  test('AUTH-007 — DEACTIVATED account returns 200 but no reset mail', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 31n,
      email: 'gone@x.io',
      password_hash: 'h',
      google_id: null,
      status: 'DEACTIVATED',
      client_profile: { display_name: 'Gone' },
      staff_member: null,
    } as never);

    const result = await service.forgotPassword('gone@x.io');
    expect(result).toEqual({ ok: true });
    expect(mocks.mail.sendPasswordReset).not.toHaveBeenCalled();
  });

  test('AUTH-007 — happy path: ACTIVE marketplace user gets reset token + reset mail', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 41n,
      email: 'live@x.io',
      password_hash: 'h',
      google_id: null,
      status: 'ACTIVE',
      client_profile: { display_name: 'Live' },
      staff_member: null,
    } as never);
    mocks.prisma.passwordResetToken.create.mockResolvedValue({} as never);

    await service.forgotPassword('live@x.io');
    expect(mocks.prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    expect(mocks.mail.sendPasswordReset).toHaveBeenCalledTimes(1);
  });
});

// ── TEST-AUTH-014 resetPassword() ───────────────────────────────

describe('TEST-AUTH-014 AuthService.resetPassword', () => {
  test('AUTH-007 — expired token rejected with TOKEN_INVALID', async () => {
    const { service, mocks } = build();
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 1n,
      account_id: 1n,
      token_hash: 'x',
      expires_at: new Date(Date.now() - 1000),
      consumed_at: null,
      created_at: new Date(),
    } as never);

    try {
      await service.resetPassword('rawtoken', VALID_PWD);
      fail('expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as { code: string };
      expect(body.code).toBe('TOKEN_INVALID');
    }
  });

  test('AUTH-007 — already-consumed token rejected with TOKEN_INVALID', async () => {
    const { service, mocks } = build();
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 1n,
      account_id: 1n,
      token_hash: 'x',
      expires_at: new Date(Date.now() + 60_000),
      consumed_at: new Date(),
      created_at: new Date(),
    } as never);

    await expect(
      service.resetPassword('rawtoken', VALID_PWD),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('AUTH-007 — successful reset revokes ALL refresh tokens for the account', async () => {
    const { service, mocks } = build();
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 1n,
      account_id: 99n,
      token_hash: 'x',
      expires_at: new Date(Date.now() + 60_000),
      consumed_at: null,
      created_at: new Date(),
    } as never);
    mocks.prisma.account.update.mockResolvedValue({} as never);
    mocks.prisma.passwordResetToken.update.mockResolvedValue({} as never);
    mocks.prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 } as never);

    const result = await service.resetPassword('rawtoken', VALID_PWD);
    expect(result).toEqual({ ok: true });
    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { account_id: 99n },
    });
  });

  test('AUTH-007 — successful reset does NOT auto-login (no tokens returned)', async () => {
    const { service, mocks } = build();
    mocks.prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 1n,
      account_id: 99n,
      token_hash: 'x',
      expires_at: new Date(Date.now() + 60_000),
      consumed_at: null,
      created_at: new Date(),
    } as never);
    mocks.prisma.account.update.mockResolvedValue({} as never);
    mocks.prisma.passwordResetToken.update.mockResolvedValue({} as never);
    mocks.prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 } as never);

    const result = await service.resetPassword('rawtoken', VALID_PWD);
    expect(result).toEqual({ ok: true });
    expect(result).not.toHaveProperty('access_token');
    expect(result).not.toHaveProperty('refresh_token');
  });
});

// ── TEST-AUTH-015 changePassword() ──────────────────────────────

describe('TEST-AUTH-015 AuthService.changePassword', () => {
  test('AUTH-008 + Decisions Log 2026-04-26 — wrong current password rejected with INVALID_CURRENT_PASSWORD', async () => {
    const { service, mocks } = build();
    const currentHash = await bcrypt.hash('actual-current!A1', 4);
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 7n,
      password_hash: currentHash,
    } as never);

    let err: unknown;
    try {
      await service.changePassword(
        7n,
        'WRONG-current!A1',
        'newPass1!Aaa',
        'currentRefresh',
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UnauthorizedException);
    const body = (err as UnauthorizedException).getResponse() as { code: string };
    expect(body.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  test('Decisions Log 2026-04-26 — current device kept, OTHER refresh tokens revoked', async () => {
    const { service, mocks } = build();
    const current = 'oldPass1!Aaa';
    const currentHash = await bcrypt.hash(current, 4);
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 9n,
      password_hash: currentHash,
    } as never);
    mocks.prisma.account.update.mockResolvedValue({} as never);
    mocks.prisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 } as never);

    await service.changePassword(9n, current, 'NewPass1!Aaa', 'CURRENT_REFRESH');

    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        account_id: 9n,
        NOT: { token: 'CURRENT_REFRESH' },
      },
    });
  });

  test('Decisions Log 2026-04-26 — when no current refresh_token sent, ALL sessions are revoked (defensive)', async () => {
    const { service, mocks } = build();
    const current = 'oldPass1!Aaa';
    const currentHash = await bcrypt.hash(current, 4);
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 10n,
      password_hash: currentHash,
    } as never);
    mocks.prisma.account.update.mockResolvedValue({} as never);
    mocks.prisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 } as never);

    await service.changePassword(10n, current, 'NewPass1!Aaa', undefined);

    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { account_id: 10n },
    });
  });

  test('AUTH-015-004 — weak new password rejected with WEAK_PASSWORD', async () => {
    const { service, mocks } = build();
    const currentHash = await bcrypt.hash('oldPass1!Aaa', 4);
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 11n,
      password_hash: currentHash,
    } as never);

    let err: unknown;
    try {
      await service.changePassword(11n, 'oldPass1!Aaa', 'short', 'r');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as { code: string };
    expect(body.code).toBe('WEAK_PASSWORD');
  });

  test('Contract §2 change-password — Google-only account returns NO_PASSWORD_SET', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 12n,
      password_hash: null,
    } as never);

    let err: unknown;
    try {
      await service.changePassword(12n, 'anything!A1', 'NewPass1!Aaa', 'r');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as { code: string };
    expect(body.code).toBe('NO_PASSWORD_SET');
  });

  test('Contract §2 change-password — same-as-current rejected with SAME_PASSWORD', async () => {
    const { service, mocks } = build();
    const current = 'samePass1!A';
    const currentHash = await bcrypt.hash(current, 4);
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 13n,
      password_hash: currentHash,
    } as never);

    let err: unknown;
    try {
      await service.changePassword(13n, current, current, 'r');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as { code: string };
    expect(body.code).toBe('SAME_PASSWORD');
  });
});

// ── TEST-AUTH-016 refreshTokens() ───────────────────────────────

describe('TEST-AUTH-016 AuthService.refreshTokens', () => {
  test('AUTH-008 — refresh rotates: deletes old token row, creates new one, issues fresh access token', async () => {
    const { service, mocks } = build();
    (mocks.jwt.verify as jest.Mock).mockReturnValue({
      sub: '1',
      email: 'a@x.io',
    });
    mocks.prisma.refreshToken.findFirst.mockResolvedValue({
      id: 7n,
      token: 'old-refresh',
      account_id: 1n,
      expires_at: new Date(Date.now() + 60_000),
      created_at: new Date(),
    } as never);
    mocks.prisma.refreshToken.delete.mockResolvedValue({} as never);
    mocks.prisma.account.findUniqueOrThrow.mockResolvedValue({
      id: 1n,
      email: 'a@x.io',
      status: 'ACTIVE',
      client_profile: { worker_profile: {}, employer_profile: null },
      staff_member: null,
    } as never);
    mocks.prisma.refreshToken.create.mockResolvedValue({} as never);

    const result = await service.refreshTokens('old-refresh');

    expect(mocks.prisma.refreshToken.delete).toHaveBeenCalledWith({
      where: { id: 7n },
    });
    expect(mocks.prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(result.access_token).toBeTruthy();
    expect(result.refresh_token).toBeTruthy();
  });

  test('AUTH-008 — unknown / already-rotated token returns 401 REFRESH_INVALID', async () => {
    const { service, mocks } = build();
    (mocks.jwt.verify as jest.Mock).mockReturnValue({
      sub: '1',
      email: 'a@x.io',
    });
    mocks.prisma.refreshToken.findFirst.mockResolvedValue(null);

    await expect(service.refreshTokens('mystery')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  test('AUTH-008 — revoked DEACTIVATED account cannot use refresh token even if row still exists', async () => {
    const { service, mocks } = build();
    (mocks.jwt.verify as jest.Mock).mockReturnValue({
      sub: '1',
      email: 'a@x.io',
    });
    mocks.prisma.refreshToken.findFirst.mockResolvedValue({
      id: 8n,
      token: 'r',
      account_id: 1n,
      expires_at: new Date(Date.now() + 60_000),
      created_at: new Date(),
    } as never);
    mocks.prisma.refreshToken.delete.mockResolvedValue({} as never);
    mocks.prisma.account.findUniqueOrThrow.mockResolvedValue({
      id: 1n,
      email: 'a@x.io',
      status: 'DEACTIVATED',
      client_profile: null,
      staff_member: null,
    } as never);

    await expect(service.refreshTokens('r')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  test('AUTH-008 — bad signature on refresh JWT returns 401 REFRESH_INVALID', async () => {
    const { service, mocks } = build();
    (mocks.jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('bad sig');
    });
    await expect(service.refreshTokens('garbage')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

// ── TEST-AUTH-017 logout() ──────────────────────────────────────

describe('TEST-AUTH-017 AuthService.logout', () => {
  test('AUTH-008 — invalidates the supplied refresh token (current session)', async () => {
    const { service, mocks } = build();
    mocks.prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 } as never);
    const result = await service.logout(5n, 'this-refresh');
    expect(result).toEqual({ ok: true });
    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { account_id: 5n, token: 'this-refresh' },
    });
  });

  test('Regression guard for original frontend logout bug — no body still returns ok:true (no-op)', async () => {
    const { service, mocks } = build();
    const result = await service.logout(5n, undefined);
    expect(result).toEqual({ ok: true });
    expect(mocks.prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });
});

// ── TEST-AUTH-018 logoutAll() ───────────────────────────────────

describe('TEST-AUTH-018 AuthService.logoutAll', () => {
  test('AUTH-008 — revokes EVERY refresh token for the account and returns the count', async () => {
    const { service, mocks } = build();
    mocks.prisma.refreshToken.deleteMany.mockResolvedValue({ count: 4 } as never);

    const result = await service.logoutAll(7n);
    expect(result).toEqual({ revoked: 4 });
    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { account_id: 7n },
    });
  });
});

// ── TEST-AUTH-019 Google OAuth handling ─────────────────────────

describe('TEST-AUTH-019 AuthService.handleGoogleLogin', () => {
  function googleAccount(overrides: Record<string, unknown> = {}) {
    return {
      id: 1n,
      email: 'g@x.io',
      google_id: null,
      status: 'ACTIVE',
      password_hash: null,
      client_profile: { worker_profile: {}, employer_profile: null },
      staff_member: null,
      ...overrides,
    };
  }

  test('AUTH-015-002 — email_verified=true + new email → ACTIVE account, email_verified_at set, NO verify mail', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue(null); // by google_id
    mocks.prisma.account.findUnique.mockResolvedValueOnce(null); // by google_id
    mocks.prisma.account.findUnique.mockResolvedValueOnce(null); // by email
    mocks.prisma.account.create.mockResolvedValue({
      id: 100n,
      email: 'new@x.io',
      status: 'ACTIVE',
      client_profile: { worker_profile: {}, employer_profile: null },
      staff_member: null,
    } as never);
    mocks.prisma.account.update.mockResolvedValue({} as never);
    mocks.prisma.refreshToken.create.mockResolvedValue({} as never);

    const result = await service.handleGoogleLogin({
      googleId: 'gid_new',
      email: 'new@x.io',
      displayName: 'New User',
      role: 'WORKER',
      emailVerified: true,
      intent: 'register',
    });

    const createArgs = mocks.prisma.account.create.mock.calls[0][0] as {
      data: { status: string; email_verified_at: Date | null };
    };
    expect(createArgs.data.status).toBe('ACTIVE');
    expect(createArgs.data.email_verified_at).toBeInstanceOf(Date);
    expect(mocks.mail.sendVerificationEmail).not.toHaveBeenCalled();
    expect(mocks.mail.sendWelcome).toHaveBeenCalledTimes(1);
    expect(result.account.is_worker).toBe(true);
  });

  test('AUTH-015-002 — email_verified=false + new email → PENDING account, verify mail sent', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValueOnce(null); // by google_id
    mocks.prisma.account.findUnique.mockResolvedValueOnce(null); // by email
    mocks.prisma.account.create.mockResolvedValue({
      id: 101n,
      email: 'new2@x.io',
      status: 'PENDING_EMAIL_VERIFICATION',
      client_profile: { worker_profile: {}, employer_profile: null },
      staff_member: null,
    } as never);
    mocks.prisma.account.update.mockResolvedValue({} as never);
    mocks.prisma.emailVerificationToken.create.mockResolvedValue({} as never);
    mocks.prisma.refreshToken.create.mockResolvedValue({} as never);

    await service.handleGoogleLogin({
      googleId: 'gid_new2',
      email: 'new2@x.io',
      displayName: 'Unverified User',
      role: 'WORKER',
      emailVerified: false,
      intent: 'register',
    });

    const createArgs = mocks.prisma.account.create.mock.calls[0][0] as {
      data: { status: string; email_verified_at: Date | null };
    };
    expect(createArgs.data.status).toBe('PENDING_EMAIL_VERIFICATION');
    expect(createArgs.data.email_verified_at).toBeNull();
    expect(mocks.mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(mocks.mail.sendWelcome).not.toHaveBeenCalled();
  });

  test('AUTH-015-006 (revised) + Decisions Log 2026-04-26 — existing email + email_verified=true → AUTO-LINK + flip PENDING → ACTIVE', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValueOnce(null); // by google_id
    mocks.prisma.account.findUnique.mockResolvedValueOnce(
      googleAccount({
        id: 200n,
        email: 'live@x.io',
        google_id: null,
        status: 'PENDING_EMAIL_VERIFICATION',
        password_hash: 'h',
      }) as never,
    ); // by email
    mocks.prisma.account.update.mockResolvedValue({
      id: 200n,
      email: 'live@x.io',
      status: 'ACTIVE',
      client_profile: { worker_profile: {}, employer_profile: null },
      staff_member: null,
      google_id: 'gid_link',
    } as never);
    mocks.prisma.refreshToken.create.mockResolvedValue({} as never);

    const result = await service.handleGoogleLogin({
      googleId: 'gid_link',
      email: 'live@x.io',
      displayName: 'Existing',
      emailVerified: true,
      intent: 'login',
    });

    const updateArgs = mocks.prisma.account.update.mock.calls[0][0] as {
      data: { google_id: string; status?: string; email_verified_at?: Date };
    };
    expect(updateArgs.data.google_id).toBe('gid_link');
    expect(updateArgs.data.status).toBe('ACTIVE');
    expect(updateArgs.data.email_verified_at).toBeInstanceOf(Date);
    expect(result.account.verification_state).toBe('ACTIVE');
    expect(mocks.audit.log).toHaveBeenCalledWith(
      200n,
      'auth.google.linked',
      'account',
      200n,
      { via: 'auto_link_verified_email' },
      undefined,
    );
  });

  test('AUTH-015-006 (revised) — existing email + email_verified=false → throw ACCOUNT_EXISTS (explicit linking screen)', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValueOnce(null); // by google_id
    mocks.prisma.account.findUnique.mockResolvedValueOnce(
      googleAccount({
        id: 201n,
        email: 'live2@x.io',
        google_id: null,
        password_hash: 'h',
        status: 'ACTIVE',
      }) as never,
    );

    let err: unknown;
    try {
      await service.handleGoogleLogin({
        googleId: 'gid_x',
        email: 'live2@x.io',
        displayName: 'Existing',
        emailVerified: false,
        intent: 'login',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConflictException);
    const body = (err as ConflictException).getResponse() as { code: string };
    expect(body.code).toBe('ACCOUNT_EXISTS');
    expect(mocks.prisma.account.update).not.toHaveBeenCalled();
  });

  test('Decisions Log 2026-04-26 (NO_GOOGLE_ACCOUNT) — intent=login + no account anywhere → NotFoundException(NO_GOOGLE_ACCOUNT), no account created', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValueOnce(null); // by google_id
    mocks.prisma.account.findUnique.mockResolvedValueOnce(null); // by email

    let err: unknown;
    try {
      await service.handleGoogleLogin({
        googleId: 'gid_unknown',
        email: 'newuser@x.io',
        displayName: 'New',
        emailVerified: true,
        intent: 'login',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(NotFoundException);
    const body = (err as NotFoundException).getResponse() as { code: string };
    expect(body.code).toBe('NO_GOOGLE_ACCOUNT');
    expect(mocks.prisma.account.create).not.toHaveBeenCalled();
  });

  test('Decisions Log 2026-04-26 (intent flag) — intent=register + existing google_id → ACCOUNT_EXISTS, do not silently log in', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValueOnce(
      googleAccount({
        id: 300n,
        email: 'already@x.io',
        google_id: 'gid_dup',
        status: 'ACTIVE',
      }) as never,
    );

    let err: unknown;
    try {
      await service.handleGoogleLogin({
        googleId: 'gid_dup',
        email: 'already@x.io',
        displayName: 'Existing',
        emailVerified: true,
        intent: 'register',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConflictException);
    const body = (err as ConflictException).getResponse() as {
      code: string;
      email: string;
    };
    expect(body.code).toBe('ACCOUNT_EXISTS');
    expect(body.email).toBe('already@x.io');
  });
});

// ── TEST-AUTH-021 verifyEmail / confirm ─────────────────────────

describe('TEST-AUTH-021 AuthService.confirmVerificationEmail', () => {
  test('AUTH-006 — second call with same token returns TOKEN_INVALID (single-use)', async () => {
    const { service, mocks } = build();
    mocks.prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 1n,
      account_id: 1n,
      token_hash: 'h',
      expires_at: new Date(Date.now() + 60_000),
      consumed_at: new Date(),
      created_at: new Date(),
      account: {
        id: 1n,
        email: 'x@x.io',
        status: 'ACTIVE',
        client_profile: { display_name: 'X' },
      },
    } as never);

    let err: unknown;
    try {
      await service.confirmVerificationEmail('raw');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as { code: string };
    expect(body.code).toBe('TOKEN_INVALID');
  });

  test('AUTH-006 — expired token (past expires_at) rejected with TOKEN_INVALID', async () => {
    const { service, mocks } = build();
    mocks.prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 2n,
      account_id: 1n,
      token_hash: 'h',
      expires_at: new Date(Date.now() - 1000),
      consumed_at: null,
      created_at: new Date(),
      account: {
        id: 1n,
        email: 'x@x.io',
        status: 'PENDING_EMAIL_VERIFICATION',
        client_profile: { display_name: 'X' },
      },
    } as never);

    await expect(
      service.confirmVerificationEmail('raw'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('AUTH-006 + AUTH-015-003 — happy path: flips status → ACTIVE, sets email_verified_at, sends welcome, returns tokens', async () => {
    const { service, mocks } = build();
    mocks.prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 3n,
      account_id: 1n,
      token_hash: 'h',
      expires_at: new Date(Date.now() + 60_000),
      consumed_at: null,
      created_at: new Date(),
      account: {
        id: 1n,
        email: 'newbie@x.io',
        status: 'PENDING_EMAIL_VERIFICATION',
        email_verified_at: null,
        client_profile: { display_name: 'Newbie' },
      },
    } as never);
    mocks.prisma.account.update.mockResolvedValue({} as never);
    mocks.prisma.emailVerificationToken.update.mockResolvedValue({} as never);
    mocks.prisma.account.findUniqueOrThrow.mockResolvedValue({
      id: 1n,
      email: 'newbie@x.io',
      status: 'ACTIVE',
      client_profile: {
        display_name: 'Newbie',
        worker_profile: {},
        employer_profile: null,
      },
      staff_member: null,
    } as never);
    mocks.prisma.refreshToken.create.mockResolvedValue({} as never);

    const result = await service.confirmVerificationEmail('raw');

    const accountUpdate = mocks.prisma.account.update.mock.calls.find(
      (c) =>
        (c[0] as { data: { status?: string } }).data.status === 'ACTIVE',
    );
    expect(accountUpdate).toBeDefined();
    expect(
      (accountUpdate![0] as { data: { email_verified_at: Date } }).data
        .email_verified_at,
    ).toBeInstanceOf(Date);
    expect(mocks.mail.sendWelcome).toHaveBeenCalledTimes(1);
    expect(result.access_token).toBeTruthy();
    expect(result.account.verification_state).toBe('ACTIVE');
  });

  test('AUTH-015-003 — already-ACTIVE account confirming again does NOT send welcome a second time', async () => {
    const { service, mocks } = build();
    mocks.prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 4n,
      account_id: 1n,
      token_hash: 'h',
      expires_at: new Date(Date.now() + 60_000),
      consumed_at: null,
      created_at: new Date(),
      account: {
        id: 1n,
        email: 'already@x.io',
        status: 'ACTIVE',
        // already verified previously
        email_verified_at: new Date('2026-01-01'),
        client_profile: { display_name: 'A' },
      },
    } as never);
    mocks.prisma.emailVerificationToken.update.mockResolvedValue({} as never);
    mocks.prisma.account.findUniqueOrThrow.mockResolvedValue({
      id: 1n,
      email: 'already@x.io',
      status: 'ACTIVE',
      client_profile: {
        display_name: 'A',
        worker_profile: {},
        employer_profile: null,
      },
      staff_member: null,
    } as never);
    mocks.prisma.refreshToken.create.mockResolvedValue({} as never);

    await service.confirmVerificationEmail('raw');
    expect(mocks.mail.sendWelcome).not.toHaveBeenCalled();
  });
});
