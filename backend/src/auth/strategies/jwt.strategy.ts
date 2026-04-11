import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

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

  async validate(payload: { sub: string; email: string }) {
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

    if (!account || account.status !== 'ACTIVE')
      throw new UnauthorizedException();

    return {
      accountId: account.id,
      email: account.email,
      clientProfileId: account.client_profile?.id ?? null,
      isWorker: !!account.client_profile?.worker_profile,
      isEmployer: !!account.client_profile?.employer_profile,
      isStaff: !!account.staff_member,
      staffRole: account.staff_member?.staff_role ?? null,
    };
  }
}
