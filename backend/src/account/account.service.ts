import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AddRoleDto } from './dto/add-role.dto';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(accountId: bigint) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: {
        client_profile: {
          include: {
            worker_profile: {
              include: {
                worker_specialisations: { include: { specialisation: true } },
                worker_languages: true,
              },
            },
            employer_profile: true,
          },
        },
        staff_member: {
          include: {
            member_roles: {
              include: {
                staff_role: {
                  include: {
                    role_permissions: {
                      include: {
                        permission: { select: { key: true } },
                      },
                    },
                  },
                },
              },
              orderBy: { granted_at: 'asc' },
            },
          },
        },
      },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (!account.staff_member) {
      return { ...account, permissions: [] as string[] };
    }
    const memberRoles = account.staff_member.member_roles;
    const roleNames = memberRoles.map((m) => m.staff_role.name);
    const primaryRole = roleNames.includes('ADMIN')
      ? 'ADMIN'
      : (roleNames[0] ?? null);
    const permissionSet = new Set<string>();
    for (const m of memberRoles) {
      for (const rp of m.staff_role.role_permissions) {
        permissionSet.add(rp.permission.key);
      }
    }
    return {
      ...account,
      staff_member: {
        ...account.staff_member,
        staff_role: primaryRole,
        staff_roles: roleNames,
      },
      permissions: Array.from(permissionSet),
    };
  }

  /**
   * Dual-role: add the second marketplace profile (worker/employer) to an
   * account that already has the other. Registration only ever creates one
   * profile; this is the "become a client / start working" path (Upwork-style).
   * The shared client_profile (and its referral_code, identity verification)
   * is reused — only the missing role-specific profile row is created.
   */
  async addRole(accountId: bigint, dto: AddRoleDto) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: {
        client_profile: {
          include: { worker_profile: true, employer_profile: true },
        },
      },
    });
    if (!account) throw new NotFoundException('Account not found');

    const cp = account.client_profile;
    if (!cp) {
      // Staff accounts have no client_profile and cannot hold marketplace roles.
      throw new BadRequestException({
        code: 'NO_CLIENT_PROFILE',
        message: 'This account cannot hold marketplace roles.',
      });
    }

    if (dto.role === 'WORKER') {
      if (cp.worker_profile) {
        throw new ConflictException({
          code: 'ROLE_EXISTS',
          message: 'This account already has a worker profile.',
        });
      }
      await this.prisma.workerProfile.create({ data: { id: cp.id } });
    } else {
      if (cp.employer_profile) {
        throw new ConflictException({
          code: 'ROLE_EXISTS',
          message: 'This account already has an employer profile.',
        });
      }
      await this.prisma.employerProfile.create({
        data: { id: cp.id, company_name: dto.company_name ?? null },
      });
    }

    return this.getMe(accountId);
  }

  async updateAccount(accountId: bigint, dto: UpdateAccountDto) {
    const data: { phone?: string; phone_verified?: boolean } = {};
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.phone_verified !== undefined)
      data.phone_verified = dto.phone_verified;

    try {
      return await this.prisma.account.update({
        where: { id: accountId },
        data,
        include: {
          client_profile: {
            include: {
              worker_profile: {
                include: {
                  worker_specialisations: { include: { specialisation: true } },
                },
              },
              employer_profile: true,
            },
          },
          staff_member: true,
        },
      });
    } catch {
      throw new NotFoundException('Account not found');
    }
  }

  async deactivateAccount(accountId: bigint) {
    try {
      return await this.prisma.account.update({
        where: { id: accountId },
        data: { status: 'DEACTIVATED' },
        include: {
          client_profile: {
            include: {
              worker_profile: {
                include: {
                  worker_specialisations: { include: { specialisation: true } },
                },
              },
              employer_profile: true,
            },
          },
          staff_member: true,
        },
      });
    } catch {
      throw new NotFoundException('Account not found');
    }
  }
}
