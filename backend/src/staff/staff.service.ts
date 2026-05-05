import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { DocumentAssignmentService } from '../verification/document-assignment.service';
import { generateInitialPassword } from '../common/validators/generate-initial-password';
import { CreateStaffDto } from './dto/create-staff.dto';

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly assignment: DocumentAssignmentService,
  ) {}

  /** 16-char password meeting checkPasswordPolicy — used as initial password for fresh staff accounts. */
  private generateInitialPassword(): string {
    return generateInitialPassword();
  }

  /**
   * Refuses to take an action that would leave zero active admins.
   * Used by deactivate / role-change.
   */
  private async assertNotLastAdmin(targetAccountId: bigint, action: string) {
    const activeAdmins = await this.prisma.staffMember.count({
      where: {
        staff_role: 'ADMIN',
        account: { status: 'ACTIVE' },
      },
    });
    if (activeAdmins <= 1) {
      // If the target IS the last admin, block.
      const target = await this.prisma.staffMember.findUnique({
        where: { id: targetAccountId },
        include: { account: { select: { status: true } } },
      });
      if (
        target &&
        target.staff_role === 'ADMIN' &&
        target.account.status === 'ACTIVE'
      ) {
        throw new ForbiddenException({
          code: 'LAST_ADMIN',
          message: `Cannot ${action} the last active admin. Promote another staff member to admin first.`,
        });
      }
    }
  }

  // ─── Duty toggle (self) ────────────────────────────────────────

  /**
   * Toggle the caller's `is_on_duty` flag. When turning OFF, all of their
   * open (PENDING / IN_REVIEW) document assignments are redistributed to
   * the next available on-duty staff via DocumentAssignmentService.
   */
  async setDuty(staffMemberId: bigint, onDuty: boolean, ip?: string) {
    const member = await this.prisma.staffMember.findUnique({
      where: { id: staffMemberId },
      select: { id: true, is_on_duty: true },
    });
    if (!member) {
      throw new NotFoundException({ code: 'STAFF_NOT_FOUND' });
    }
    if (member.is_on_duty === onDuty) {
      return { is_on_duty: member.is_on_duty, reassigned: 0 };
    }

    await this.prisma.staffMember.update({
      where: { id: staffMemberId },
      data: { is_on_duty: onDuty },
    });

    let reassigned = 0;
    if (!onDuty) {
      reassigned = await this.assignment.reassignFromStaff(
        staffMemberId,
        'duty_off',
        staffMemberId,
        ip,
      );
    }

    await this.audit.log(
      staffMemberId,
      onDuty ? 'staff.duty_on' : 'staff.duty_off',
      'staff_member',
      staffMemberId,
      { reassigned_count: reassigned },
      ip,
    );

    return { is_on_duty: onDuty, reassigned };
  }

  // ─── Listing ───────────────────────────────────────────────────

  async list() {
    const rows = await this.prisma.staffMember.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        account: {
          select: { email: true, status: true, last_login_at: true },
        },
      },
    });
    const now = Date.now();
    return rows.map((r) => {
      const inviteExpiresAt = r.invite_expires_at;
      const inviteExpired =
        !!inviteExpiresAt &&
        r.account.last_login_at == null &&
        inviteExpiresAt.getTime() < now;
      const inviteActive =
        !!inviteExpiresAt && r.account.last_login_at == null && !inviteExpired;
      return {
        id: r.id.toString(),
        email: r.account.email,
        display_name: r.display_name,
        staff_role: r.staff_role,
        status: r.account.status,
        is_on_duty: r.is_on_duty,
        last_login_at: r.account.last_login_at,
        created_at: r.created_at,
        invite_expires_at: inviteExpiresAt,
        // UX hints — staff that never signed in
        invite_active: inviteActive,
        invite_expired: inviteExpired,
        has_signed_in: r.account.last_login_at != null,
      };
    });
  }

  // ─── Create / invite ───────────────────────────────────────────

  async create(dto: CreateStaffDto, createdByAccountId: bigint, ip?: string) {
    const existing = await this.prisma.account.findUnique({
      where: { email: dto.email },
      include: { staff_member: true },
    });

    // Path A: email already belongs to a staff account → reject (admin should
    // re-invite via the dedicated endpoint instead of creating a duplicate).
    if (existing && existing.staff_member) {
      throw new ConflictException({
        code: 'ALREADY_STAFF',
        message:
          'This email is already a staff member. Use "Resend invite" or change the role instead.',
      });
    }

    // Path B: email belongs to a marketplace client (worker / employer).
    // Promote the existing account to also be staff — DO NOT change the user's
    // password. The user keeps their existing client login + gains staff access.
    if (existing) {
      if (existing.status === 'DEACTIVATED') {
        throw new ConflictException({
          code: 'ACCOUNT_DEACTIVATED',
          message: 'This account is deactivated. Reactivate it first.',
        });
      }
      if (existing.status === 'PENDING_EMAIL_VERIFICATION') {
        throw new ConflictException({
          code: 'ACCOUNT_NOT_VERIFIED',
          message:
            'This user has not verified their email yet. Ask them to verify before promoting to staff.',
        });
      }

      const promoted = await this.prisma.staffMember.create({
        data: {
          id: existing.id, // shared PK with account
          display_name: dto.display_name,
          staff_role: dto.staff_role,
          // No invite expiry needed — they already use this account.
        },
      });

      await this.audit.log(
        createdByAccountId,
        'staff.promoted_existing',
        'account',
        existing.id,
        { staff_role: dto.staff_role, target_email: dto.email },
        ip,
      );

      void this.mail.sendStaffPromotion(
        existing.email,
        dto.display_name,
        dto.staff_role,
      );

      return {
        id: promoted.id.toString(),
        email: existing.email,
        display_name: dto.display_name,
        staff_role: dto.staff_role,
        promoted_existing_account: true,
      };
    }

    // Path C: brand-new account. Generate password, time-limited invite.
    const initialPassword = this.generateInitialPassword();
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const account = await this.prisma.account.create({
      data: {
        email: dto.email,
        password_hash: passwordHash,
        status: 'ACTIVE',
        email_verified_at: new Date(),
        staff_member: {
          create: {
            display_name: dto.display_name,
            staff_role: dto.staff_role,
            invite_expires_at: inviteExpiresAt,
          },
        },
      },
      include: { staff_member: true },
    });

    await this.audit.log(
      createdByAccountId,
      'staff.created',
      'account',
      account.id,
      { staff_role: dto.staff_role, target_email: dto.email },
      ip,
    );

    void this.mail.sendStaffInvite(
      account.email,
      dto.display_name,
      initialPassword,
      inviteExpiresAt,
    );

    return {
      id: account.id.toString(),
      email: account.email,
      display_name: dto.display_name,
      staff_role: dto.staff_role,
    };
  }

  // ─── Re-invite (only for staff who never signed in) ───────────

  async reinvite(staffMemberId: bigint, byAccountId: bigint, ip?: string) {
    const member = await this.prisma.staffMember.findUnique({
      where: { id: staffMemberId },
      include: { account: true },
    });
    if (!member) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'Staff member not found.',
      });
    }
    if (member.account.last_login_at != null) {
      throw new ConflictException({
        code: 'STAFF_ALREADY_USED',
        message:
          'This staff member has already signed in. They can recover access through "Forgot password".',
      });
    }
    if (member.account.status === 'DEACTIVATED') {
      throw new ConflictException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Reactivate the account first.',
      });
    }

    // Generate a fresh password + bump expiry. Revoke any leftover refresh tokens.
    const initialPassword = this.generateInitialPassword();
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: member.id },
        data: { password_hash: passwordHash },
      }),
      this.prisma.staffMember.update({
        where: { id: member.id },
        data: { invite_expires_at: inviteExpiresAt },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { account_id: member.id },
      }),
    ]);

    await this.audit.log(
      byAccountId,
      'staff.reinvited',
      'account',
      member.id,
      { target_email: member.account.email },
      ip,
    );

    void this.mail.sendStaffInvite(
      member.account.email,
      member.display_name,
      initialPassword,
      inviteExpiresAt,
    );

    return { ok: true, invite_expires_at: inviteExpiresAt };
  }

  // ─── Change role ───────────────────────────────────────────────

  async changeRole(
    staffMemberId: bigint,
    newRole: 'ADMIN' | 'MODERATOR',
    byAccountId: bigint,
    ip?: string,
  ) {
    const member = await this.prisma.staffMember.findUnique({
      where: { id: staffMemberId },
      include: { account: { select: { email: true, status: true } } },
    });
    if (!member) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'Staff member not found.',
      });
    }
    if (member.staff_role === newRole) {
      throw new BadRequestException({
        code: 'NO_CHANGE',
        message: `Already ${newRole}.`,
      });
    }
    // Demoting yourself from admin would lock you out of admin actions.
    if (member.id === byAccountId && newRole !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'CANNOT_DEMOTE_SELF',
        message: 'You cannot demote yourself from admin.',
      });
    }
    // Demoting the last admin would lock everyone out.
    if (member.staff_role === 'ADMIN' && newRole === 'MODERATOR') {
      await this.assertNotLastAdmin(member.id, 'demote');
    }

    const updated = await this.prisma.staffMember.update({
      where: { id: staffMemberId },
      data: { staff_role: newRole },
    });

    await this.audit.log(
      byAccountId,
      'staff.role_changed',
      'account',
      member.id,
      {
        target_email: member.account.email,
        from: member.staff_role,
        to: newRole,
      },
      ip,
    );

    return {
      id: updated.id.toString(),
      staff_role: updated.staff_role,
    };
  }

  // ─── Deactivate / Reactivate ───────────────────────────────────

  async deactivate(staffMemberId: bigint, byAccountId: bigint, ip?: string) {
    const member = await this.prisma.staffMember.findUnique({
      where: { id: staffMemberId },
      include: { account: true },
    });
    if (!member) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'Staff member not found.',
      });
    }
    if (member.id === byAccountId) {
      throw new ForbiddenException({
        code: 'CANNOT_DEACTIVATE_SELF',
        message: 'You cannot deactivate your own account.',
      });
    }
    if (member.account.status === 'DEACTIVATED') {
      throw new BadRequestException({
        code: 'ALREADY_DEACTIVATED',
        message: 'This account is already deactivated.',
      });
    }
    if (member.staff_role === 'ADMIN') {
      await this.assertNotLastAdmin(member.id, 'deactivate');
    }

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: member.id },
        data: { status: 'DEACTIVATED' },
      }),
      this.prisma.staffMember.update({
        where: { id: member.id },
        data: { is_on_duty: false },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { account_id: member.id },
      }),
    ]);

    // Redistribute their open verification queue to the next available
    // on-duty staff (admin reassignment, audit-logged per doc).
    const reassigned = await this.assignment.reassignFromStaff(
      member.id,
      'admin_reassign',
      byAccountId,
      ip,
    );

    await this.audit.log(
      byAccountId,
      'staff.deactivated',
      'account',
      member.id,
      {
        staff_role: member.staff_role,
        target_email: member.account.email,
        reassigned_count: reassigned,
      },
      ip,
    );
    return { ok: true, reassigned };
  }

  /**
   * Admin force-reset of a staff member's password. Generates a fresh
   * password, revokes all of their refresh tokens, and emails the new
   * credentials. Used because staff cannot self-reset via /forgot-password.
   */
  async resetPassword(staffMemberId: bigint, byAccountId: bigint, ip?: string) {
    const member = await this.prisma.staffMember.findUnique({
      where: { id: staffMemberId },
      include: { account: true },
    });
    if (!member) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'Staff member not found.',
      });
    }
    if (member.account.status === 'DEACTIVATED') {
      throw new ConflictException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Reactivate the account first.',
      });
    }

    const newPassword = this.generateInitialPassword();
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: member.id },
        data: { password_hash: passwordHash },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { account_id: member.id },
      }),
    ]);

    await this.audit.log(
      byAccountId,
      'staff.password_reset',
      'account',
      member.id,
      { target_email: member.account.email },
      ip,
    );

    void this.mail.sendStaffPasswordReset(
      member.account.email,
      member.display_name,
      newPassword,
    );

    return { ok: true };
  }

  async reactivate(staffMemberId: bigint, byAccountId: bigint, ip?: string) {
    const member = await this.prisma.staffMember.findUnique({
      where: { id: staffMemberId },
      include: { account: true },
    });
    if (!member) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'Staff member not found.',
      });
    }
    if (member.account.status === 'ACTIVE') {
      throw new BadRequestException({
        code: 'ALREADY_ACTIVE',
        message: 'This account is already active.',
      });
    }
    await this.prisma.account.update({
      where: { id: member.id },
      data: { status: 'ACTIVE' },
    });
    await this.audit.log(
      byAccountId,
      'staff.reactivated',
      'account',
      member.id,
      { staff_role: member.staff_role, target_email: member.account.email },
      ip,
    );
    return { ok: true };
  }
}
