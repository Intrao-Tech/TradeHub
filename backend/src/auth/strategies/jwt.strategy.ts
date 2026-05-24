import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccountStatus } from '../../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: { sub: string; email: string; vs?: AccountStatus }) {
    const account = await this.prisma.account.findUnique({
      where: { id: BigInt(payload.sub) },
      include: {
        client_profile: {
          include: {
            worker_profile: true,
            employer_profile: true,
          },
        },
        staff_member: {
          include: {
            // Admin panel: roles via staff_member_role junction. We pull
            // every role (not just first) plus their permissions so the
            // PermissionsGuard can do its check on every request.
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

    if (!account) throw new UnauthorizedException();

    if (account.status === 'DEACTIVATED') {
      throw new UnauthorizedException('Account deactivated');
    }

    const memberRoles = account.staff_member?.member_roles ?? [];
    // Primary role for legacy @Roles('ADMIN') / @Roles('STAFF') checks.
    // If user has ADMIN among their roles, that's their primary (so admin
    // checks always pass regardless of role assignment order).
    const roleNames = memberRoles.map((m) => m.staff_role.name);
    const primaryRole = roleNames.includes('ADMIN')
      ? 'ADMIN'
      : (roleNames[0] ?? null);

    // Flatten permissions across all assigned roles.
    const permissionSet = new Set<string>();
    for (const m of memberRoles) {
      for (const rp of m.staff_role.role_permissions) {
        permissionSet.add(rp.permission.key);
      }
    }

    return {
      accountId: account.id,
      email: account.email,
      clientProfileId: account.client_profile?.id ?? null,
      isWorker: !!account.client_profile?.worker_profile,
      isEmployer: !!account.client_profile?.employer_profile,
      isStaff: !!account.staff_member,
      staffRole: primaryRole,
      permissions: Array.from(permissionSet),
      verificationState: account.status as AccountStatus,
    };
  }
}
