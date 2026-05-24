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

// Single role per staff in MVP (multi-role supported by the junction schema —
// add more rows to extend later).
// Any role name resolved against staff_role table. Validation happens at
// the service boundary — we no longer hardcode the union.
export type StaffRoleName = string;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly assignment: DocumentAssignmentService,
  ) {}

  // ─── Role helpers (via staff_member_role junction) ─────────────

  /** Get a staff member's primary role name, or null if no roles assigned. */
  private async getRoleName(staffMemberId: bigint): Promise<StaffRoleName | null> {
    const link = await this.prisma.staffMemberRole.findFirst({
      where: { staff_member_id: staffMemberId },
      include: { staff_role: { select: { name: true } } },
      orderBy: { granted_at: 'asc' },
    });
    return (link?.staff_role.name as StaffRoleName | undefined) ?? null;
  }

  /**
   * Replace all roles of a staff with one new role. Resolves the role lookup
   * by name. Throws if the role name isn't seeded.
   */
  private async setRole(
    staffMemberId: bigint,
    roleName: StaffRoleName,
    grantedByStaffId: bigint | null,
  ): Promise<void> {
    const role = await this.prisma.staffRole.findUniqueOrThrow({
      where: { name: roleName },
    });
    await this.prisma.$transaction([
      this.prisma.staffMemberRole.deleteMany({
        where: { staff_member_id: staffMemberId },
      }),
      this.prisma.staffMemberRole.create({
        data: {
          staff_member_id: staffMemberId,
          staff_role_id: role.id,
          granted_by_staff_id: grantedByStaffId,
        },
      }),
    ]);
  }

  /** 16-char password meeting checkPasswordPolicy — used as initial password for fresh staff accounts. */
  private generateInitialPassword(): string {
    return generateInitialPassword();
  }

  /**
   * Refuses to take an action that would leave zero active admins.
   * Used by deactivate / role-change. Counts via staff_member_role junction.
   */
  private async assertNotLastAdmin(targetStaffId: bigint, action: string) {
    const adminRole = await this.prisma.staffRole.findUniqueOrThrow({
      where: { name: 'ADMIN' },
    });
    const activeAdmins = await this.prisma.staffMemberRole.count({
      where: {
        staff_role_id: adminRole.id,
        staff_member: { account: { status: 'ACTIVE' } },
      },
    });
    if (activeAdmins <= 1) {
      const targetIsAdmin = await this.prisma.staffMemberRole.findFirst({
        where: {
          staff_member_id: targetStaffId,
          staff_role_id: adminRole.id,
          staff_member: { account: { status: 'ACTIVE' } },
        },
      });
      if (targetIsAdmin) {
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
   * open document review assignments are redistributed to the next available
   * on-duty staff via DocumentAssignmentService.
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
        member_roles: {
          include: { staff_role: { select: { name: true } } },
          orderBy: { granted_at: 'asc' },
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
      const roleNames = r.member_roles.map((m) => m.staff_role.name);
      // Primary role: ADMIN if present, else first one assigned.
      const primary = roleNames.includes('ADMIN')
        ? 'ADMIN'
        : (roleNames[0] ?? null);
      return {
        id: r.id.toString(),
        email: r.account.email,
        display_name: r.display_name,
        staff_role: primary,
        staff_roles: roleNames,
        status: r.account.status,
        is_on_duty: r.is_on_duty,
        last_login_at: r.account.last_login_at,
        created_at: r.created_at,
        invite_expires_at: inviteExpiresAt,
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

    if (existing && existing.staff_member) {
      throw new ConflictException({
        code: 'ALREADY_STAFF',
        message:
          'This email is already a staff member. Use "Resend invite" or change the role instead.',
      });
    }

    // Path B: email belongs to a marketplace client — promote.
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
          id: existing.id,
          display_name: dto.display_name,
        },
      });
      await this.setRole(promoted.id, dto.staff_role, createdByAccountId);

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

    // Path C: brand-new account.
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
            invite_expires_at: inviteExpiresAt,
          },
        },
      },
      include: { staff_member: true },
    });
    await this.setRole(account.id, dto.staff_role, createdByAccountId);

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
    newRole: StaffRoleName,
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
    const currentRole = await this.getRoleName(staffMemberId);
    if (currentRole === newRole) {
      throw new BadRequestException({
        code: 'NO_CHANGE',
        message: `Already ${newRole}.`,
      });
    }
    if (member.id === byAccountId && newRole !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'CANNOT_DEMOTE_SELF',
        message: 'You cannot demote yourself from admin.',
      });
    }
    if (currentRole === 'ADMIN' && newRole === 'STAFF') {
      await this.assertNotLastAdmin(member.id, 'demote');
    }

    await this.setRole(staffMemberId, newRole, byAccountId);

    await this.audit.log(
      byAccountId,
      'staff.role_changed',
      'account',
      member.id,
      {
        target_email: member.account.email,
        from: currentRole,
        to: newRole,
      },
      ip,
    );

    return {
      id: member.id.toString(),
      staff_role: newRole,
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
    const currentRole = await this.getRoleName(member.id);
    if (currentRole === 'ADMIN') {
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
        staff_role: currentRole,
        target_email: member.account.email,
        reassigned_count: reassigned,
      },
      ip,
    );
    return { ok: true, reassigned };
  }

  /**
   * Admin force-reset of a staff member's password.
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
    const currentRole = await this.getRoleName(member.id);
    await this.audit.log(
      byAccountId,
      'staff.reactivated',
      'account',
      member.id,
      { staff_role: currentRole, target_email: member.account.email },
      ip,
    );
    return { ok: true };
  }
}
