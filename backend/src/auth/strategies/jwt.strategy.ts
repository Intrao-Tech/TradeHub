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
        staff_member: true,
      },
    });

    if (!account) throw new UnauthorizedException();

    // DEACTIVATED accounts cannot use any token, even a valid one.
    if (account.status === 'DEACTIVATED') {
      throw new UnauthorizedException('Account deactivated');
    }

    // PENDING_EMAIL_VERIFICATION accounts CAN authenticate (so they can hit
    // /auth/verify-email/send and resume the flow), but trust-sensitive routes
    // are blocked downstream by AccountStateGuard.
    return {
      accountId: account.id,
      email: account.email,
      clientProfileId: account.client_profile?.id ?? null,
      isWorker: !!account.client_profile?.worker_profile,
      isEmployer: !!account.client_profile?.employer_profile,
      isStaff: !!account.staff_member,
      staffRole: account.staff_member?.staff_role ?? null,
      verificationState: account.status as AccountStatus,
    };
  }
}
