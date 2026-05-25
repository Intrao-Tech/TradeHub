import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAccountDto } from './dto/update-account.dto';

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
