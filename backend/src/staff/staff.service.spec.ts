// TEST-AUTH-024 — StaffService unit tests.
// Source: backend/src/staff/staff.service.ts
// Contract: AUTH-018-001..AUTH-018-007.
//
// Notes:
// - StaffService.generateInitialPassword is private; we observe its outputs
//   indirectly via what gets written to account.password_hash and what gets
//   passed to mail.sendStaffInvite.
// - The cross-check that the generated password actually meets AUTH-015-004
//   is in TEST-AUTH-026 (password-policy.spec.ts) and currently fails — see
//   followups.md FU-1.

import * as bcrypt from 'bcrypt';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StaffService } from './staff.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';

type Mocks = {
  prisma: DeepMockProxy<PrismaService>;
  mail: jest.Mocked<MailService>;
  audit: jest.Mocked<AuditService>;
};

function build(): { service: StaffService; mocks: Mocks } {
  const prisma = mockDeep<PrismaService>();
  const mail = {
    sendStaffInvite: jest.fn().mockResolvedValue(undefined),
    sendStaffPromotion: jest.fn().mockResolvedValue(undefined),
    sendStaffPasswordReset: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<MailService>;
  const audit = {
    log: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<AuditService>;

  prisma.$transaction.mockImplementation(async (input: unknown) => {
    if (Array.isArray(input)) return Promise.all(input);
    if (typeof input === 'function') {
      return (input as (p: unknown) => unknown)(prisma);
    }
    return undefined;
  });

  return {
    service: new StaffService(prisma, mail, audit),
    mocks: { prisma, mail, audit },
  };
}

// ── AUTH-018-001 — create / promote / reject ────────────────────

describe('TEST-AUTH-024 StaffService.create — AUTH-018-001', () => {
  test('AUTH-018-001 — fresh email creates Account + StaffMember with 16-char password and 24h invite expiry', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue(null);
    mocks.prisma.account.create.mockImplementation(async (args: unknown) => {
      // Capture the data Nest would have written so we can assert on it.
      return {
        id: 100n,
        email: (args as { data: { email: string } }).data.email,
        password_hash: (args as { data: { password_hash: string } }).data
          .password_hash,
        staff_member: { id: 100n },
      } as never;
    });

    await service.create(
      { email: 'fresh@x.io', display_name: 'Fresh', staff_role: 'MODERATOR' },
      999n,
    );

    expect(mocks.mail.sendStaffInvite).toHaveBeenCalledTimes(1);
    const [, , initialPassword, inviteExpiresAt] =
      mocks.mail.sendStaffInvite.mock.calls[0];
    expect(initialPassword).toHaveLength(16);
    expect(inviteExpiresAt).toBeInstanceOf(Date);
    const ttlMs = inviteExpiresAt.getTime() - Date.now();
    // Allow 1s of clock drift inside the assertion.
    expect(ttlMs).toBeGreaterThan(24 * 60 * 60 * 1000 - 1500);
    expect(ttlMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 100);

    expect(mocks.audit.log).toHaveBeenCalledWith(
      999n,
      'staff.created',
      'account',
      100n,
      expect.objectContaining({ staff_role: 'MODERATOR' }),
      undefined,
    );
  });

  test('Decisions Log 2026-04-26 (existing-client promotion) — ACTIVE marketplace account is promoted WITHOUT password change', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 200n,
      email: 'live@x.io',
      status: 'ACTIVE',
      password_hash: 'OLD_HASH',
      staff_member: null,
    } as never);
    mocks.prisma.staffMember.create.mockResolvedValue({
      id: 200n,
      display_name: 'Promoted',
      staff_role: 'ADMIN',
    } as never);

    const result = await service.create(
      { email: 'live@x.io', display_name: 'Promoted', staff_role: 'ADMIN' },
      999n,
    );

    expect(result).toMatchObject({ promoted_existing_account: true });
    // Critical: the account row's password_hash MUST NOT be updated by the
    // promotion path — that's the point of the path.
    expect(mocks.prisma.account.update).not.toHaveBeenCalled();
    expect(mocks.mail.sendStaffPromotion).toHaveBeenCalledTimes(1);
    expect(mocks.mail.sendStaffInvite).not.toHaveBeenCalled();
    expect(mocks.audit.log).toHaveBeenCalledWith(
      999n,
      'staff.promoted_existing',
      'account',
      200n,
      expect.objectContaining({ staff_role: 'ADMIN' }),
      undefined,
    );
  });

  test('AUTH-018-001 — PENDING_EMAIL_VERIFICATION account → ACCOUNT_NOT_VERIFIED', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 300n,
      email: 'pending@x.io',
      status: 'PENDING_EMAIL_VERIFICATION',
      staff_member: null,
    } as never);
    let err: unknown;
    try {
      await service.create(
        { email: 'pending@x.io', display_name: 'P', staff_role: 'ADMIN' },
        1n,
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: 'ACCOUNT_NOT_VERIFIED',
    });
  });

  test('AUTH-018-001 — DEACTIVATED account → ACCOUNT_DEACTIVATED', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 301n,
      email: 'gone@x.io',
      status: 'DEACTIVATED',
      staff_member: null,
    } as never);
    await expect(
      service.create(
        { email: 'gone@x.io', display_name: 'G', staff_role: 'ADMIN' },
        1n,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  test('AUTH-018-001 — already-staff email → ALREADY_STAFF', async () => {
    const { service, mocks } = build();
    mocks.prisma.account.findUnique.mockResolvedValue({
      id: 302n,
      email: 's@x.io',
      status: 'ACTIVE',
      staff_member: { id: 302n, staff_role: 'ADMIN' },
    } as never);
    let err: unknown;
    try {
      await service.create(
        { email: 's@x.io', display_name: 'S', staff_role: 'ADMIN' },
        1n,
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: 'ALREADY_STAFF',
    });
  });
});

// ── AUTH-018-002 — reinvite ─────────────────────────────────────

describe('TEST-AUTH-024 StaffService.reinvite — AUTH-018-002', () => {
  test('AUTH-018-002 — works only while last_login_at IS NULL: regenerates password + 24h expiry, revokes all refresh tokens', async () => {
    const { service, mocks } = build();
    mocks.prisma.staffMember.findUnique.mockResolvedValue({
      id: 400n,
      display_name: 'Fresh',
      account: {
        id: 400n,
        email: 'fresh@x.io',
        status: 'ACTIVE',
        last_login_at: null,
      },
    } as never);

    await service.reinvite(400n, 999n);

    // Password update happened
    expect(mocks.prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 400n },
        data: expect.objectContaining({ password_hash: expect.any(String) }),
      }),
    );
    // New invite expiry set
    expect(mocks.prisma.staffMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 400n },
        data: expect.objectContaining({ invite_expires_at: expect.any(Date) }),
      }),
    );
    // All refresh tokens revoked
    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { account_id: 400n },
    });
    // Mail sent
    expect(mocks.mail.sendStaffInvite).toHaveBeenCalledTimes(1);
  });

  test('AUTH-018-002 — last_login_at set → STAFF_ALREADY_USED, admin must use reset-password instead', async () => {
    const { service, mocks } = build();
    mocks.prisma.staffMember.findUnique.mockResolvedValue({
      id: 401n,
      display_name: 'Used',
      account: {
        id: 401n,
        email: 'used@x.io',
        status: 'ACTIVE',
        last_login_at: new Date(),
      },
    } as never);
    let err: unknown;
    try {
      await service.reinvite(401n, 999n);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      code: 'STAFF_ALREADY_USED',
    });
  });

  test('AUTH-018-002 — staff member not found → STAFF_NOT_FOUND', async () => {
    const { service, mocks } = build();
    mocks.prisma.staffMember.findUnique.mockResolvedValue(null);
    await expect(service.reinvite(404n, 1n)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// ── AUTH-018-003 — admin reset-password ─────────────────────────

describe('TEST-AUTH-024 StaffService.resetPassword — AUTH-018-003', () => {
  test('AUTH-018-003 — works regardless of last_login_at, revokes ALL refresh tokens, generates a fresh password, emails it', async () => {
    const { service, mocks } = build();
    mocks.prisma.staffMember.findUnique.mockResolvedValue({
      id: 500n,
      display_name: 'Already used',
      account: {
        id: 500n,
        email: 'used@x.io',
        status: 'ACTIVE',
        // last_login_at non-null on purpose — reset works after first login
        last_login_at: new Date('2026-04-01'),
      },
    } as never);

    await service.resetPassword(500n, 999n);

    expect(mocks.prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 500n },
        data: expect.objectContaining({ password_hash: expect.any(String) }),
      }),
    );
    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { account_id: 500n },
    });
    expect(mocks.mail.sendStaffPasswordReset).toHaveBeenCalledTimes(1);
    expect(mocks.audit.log).toHaveBeenCalledWith(
      999n,
      'staff.password_reset',
      'account',
      500n,
      expect.any(Object),
      undefined,
    );
  });

  test('AUTH-018-003 — DEACTIVATED account → ACCOUNT_DEACTIVATED', async () => {
    const { service, mocks } = build();
    mocks.prisma.staffMember.findUnique.mockResolvedValue({
      id: 501n,
      display_name: 'D',
      account: { id: 501n, email: 'd@x.io', status: 'DEACTIVATED' },
    } as never);
    await expect(service.resetPassword(501n, 1n)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

// ── AUTH-018-004 — change role ──────────────────────────────────

describe('TEST-AUTH-024 StaffService.changeRole — AUTH-018-004', () => {
  test('AUTH-018-004 — self-demote → CANNOT_DEMOTE_SELF', async () => {
    const { service, mocks } = build();
    mocks.prisma.staffMember.findUnique.mockResolvedValue({
      id: 600n,
      staff_role: 'ADMIN',
      account: { email: 's@x.io', status: 'ACTIVE' },
    } as never);
    let err: unknown;
    try {
      await service.changeRole(600n, 'MODERATOR', 600n);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: 'CANNOT_DEMOTE_SELF',
    });
  });

  test('AUTH-018-004 — demoting last active admin → LAST_ADMIN', async () => {
    const { service, mocks } = build();
    mocks.prisma.staffMember.findUnique
      // first lookup to find the target
      .mockResolvedValueOnce({
        id: 601n,
        staff_role: 'ADMIN',
        account: { email: 's@x.io', status: 'ACTIVE' },
      } as never)
      // assertNotLastAdmin re-fetches the target to confirm
      .mockResolvedValueOnce({
        id: 601n,
        staff_role: 'ADMIN',
        account: { status: 'ACTIVE' },
      } as never);
    mocks.prisma.staffMember.count.mockResolvedValue(1);

    let err: unknown;
    try {
      await service.changeRole(601n, 'MODERATOR', 999n);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: 'LAST_ADMIN',
    });
  });

  test('AUTH-018-004 — promoting MODERATOR → ADMIN succeeds (no last-admin check)', async () => {
    const { service, mocks } = build();
    mocks.prisma.staffMember.findUnique.mockResolvedValue({
      id: 602n,
      staff_role: 'MODERATOR',
      account: { email: 'm@x.io', status: 'ACTIVE' },
    } as never);
    mocks.prisma.staffMember.update.mockResolvedValue({
      id: 602n,
      staff_role: 'ADMIN',
    } as never);

    const result = await service.changeRole(602n, 'ADMIN', 999n);
    expect(result.staff_role).toBe('ADMIN');
  });

  test('AUTH-018-004 — same-role no-op → NO_CHANGE', async () => {
    const { service, mocks } = build();
    mocks.prisma.staffMember.findUnique.mockResolvedValue({
      id: 603n,
      staff_role: 'ADMIN',
      account: { email: 'a@x.io', status: 'ACTIVE' },
    } as never);
    await expect(
      service.changeRole(603n, 'ADMIN', 999n),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── AUTH-018-006 — deactivate ───────────────────────────────────

describe('TEST-AUTH-024 StaffService.deactivate — AUTH-018-006', () => {
  test('AUTH-018-006 — self-deactivate → CANNOT_DEACTIVATE_SELF', async () => {
    const { service, mocks } = build();
    mocks.prisma.staffMember.findUnique.mockResolvedValue({
      id: 700n,
      staff_role: 'ADMIN',
      account: { id: 700n, email: 's@x.io', status: 'ACTIVE' },
    } as never);
    let err: unknown;
    try {
      await service.deactivate(700n, 700n);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: 'CANNOT_DEACTIVATE_SELF',
    });
  });

  test('AUTH-018-006 — last admin → LAST_ADMIN', async () => {
    const { service, mocks } = build();
    mocks.prisma.staffMember.findUnique
      .mockResolvedValueOnce({
        id: 701n,
        staff_role: 'ADMIN',
        account: { id: 701n, email: 's@x.io', status: 'ACTIVE' },
      } as never)
      .mockResolvedValueOnce({
        id: 701n,
        staff_role: 'ADMIN',
        account: { status: 'ACTIVE' },
      } as never);
    mocks.prisma.staffMember.count.mockResolvedValue(1);

    await expect(service.deactivate(701n, 999n)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  test('AUTH-018-006 — happy path: status flips to DEACTIVATED + ALL refresh tokens revoked', async () => {
    const { service, mocks } = build();
    mocks.prisma.staffMember.findUnique.mockResolvedValue({
      id: 702n,
      staff_role: 'MODERATOR',
      account: { id: 702n, email: 'm@x.io', status: 'ACTIVE' },
    } as never);

    await service.deactivate(702n, 999n);

    expect(mocks.prisma.account.update).toHaveBeenCalledWith({
      where: { id: 702n },
      data: { status: 'DEACTIVATED' },
    });
    expect(mocks.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { account_id: 702n },
    });
    expect(mocks.audit.log).toHaveBeenCalledWith(
      999n,
      'staff.deactivated',
      'account',
      702n,
      expect.any(Object),
      undefined,
    );
  });
});

// ── AUTH-018-007 — invite-expiry note ──────────────────────────

describe('TEST-AUTH-024 — invite expiry is enforced at staff login (AUTH-018-007)', () => {
  test('AUTH-018-007 — covered by auth.service.spec.ts staffLogin path; e2e suite (TEST-AUTH-048) exercises end-to-end', () => {
    // This ID lives here for traceability — the invite-expiry behaviour is
    // owned by AuthService.staffLogin (not StaffService), so the unit
    // assertion runs over there. The e2e spec at backend/test/staff.lifecycle
    // .e2e-spec.ts walks the full flow.
    expect(true).toBe(true);
  });
});
