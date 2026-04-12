import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.account.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const slug = this.generateSlug(dto.display_name);

    const account = await this.prisma.account.create({
      data: {
        email: dto.email,
        password_hash: passwordHash,
        phone: dto.phone,
        client_profile: {
          create: {
            display_name: dto.display_name,
            slug,
            ...(dto.role === 'WORKER'
              ? { worker_profile: { create: {} } }
              : { employer_profile: { create: {} } }),
          },
        },
      },
      include: { client_profile: true },
    });

    void this.mail.sendWelcome(account.email, dto.display_name);

    return this.issueTokens(account.id, account.email);
  }

  async login(dto: LoginDto) {
    const account = await this.prisma.account.findUnique({
      where: { email: dto.email },
    });
    if (!account || !account.password_hash)
      throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, account.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.account.update({
      where: { id: account.id },
      data: { last_login_at: new Date() },
    });

    return this.issueTokens(account.id, account.email);
  }

  async refreshTokens(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);

    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        account_id: BigInt(payload.sub),
        expires_at: { gt: new Date() },
      },
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: BigInt(payload.sub) },
    });

    return this.issueTokens(account.id, account.email);
  }

  async handleGoogleLogin(profile: {
    email: string;
    googleId: string;
    displayName: string;
    role?: 'WORKER' | 'EMPLOYER';
  }) {
    let account = await this.prisma.account.findUnique({
      where: { google_id: profile.googleId },
    });

    if (!account) {
      account = await this.prisma.account.findUnique({
        where: { email: profile.email },
      });

      if (account) {
        account = await this.prisma.account.update({
          where: { id: account.id },
          data: { google_id: profile.googleId },
        });
      } else {
        const slug = this.generateSlug(profile.displayName);
        account = await this.prisma.account.create({
          data: {
            email: profile.email,
            google_id: profile.googleId,
            client_profile: {
              create: {
                display_name: profile.displayName,
                slug,
                ...(profile.role === 'EMPLOYER'
                  ? { employer_profile: { create: {} } }
                  : { worker_profile: { create: {} } }),
              },
            },
          },
        });
        void this.mail.sendWelcome(account.email, profile.displayName);
      }
    }

    await this.prisma.account.update({
      where: { id: account.id },
      data: { last_login_at: new Date() },
    });

    return this.issueTokens(account.id, account.email);
  }

  async staffLogin(dto: LoginDto) {
    const account = await this.prisma.account.findUnique({
      where: { email: dto.email },
      include: { staff_member: true },
    });
    if (!account || !account.password_hash)
      throw new UnauthorizedException('Invalid credentials');
    if (!account.staff_member)
      throw new UnauthorizedException('Not a staff account');

    const valid = await bcrypt.compare(dto.password, account.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.account.update({
      where: { id: account.id },
      data: { last_login_at: new Date() },
    });

    return this.issueTokens(account.id, account.email);
  }

  async logout(accountId: bigint, refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { account_id: accountId, token: refreshToken },
    });
  }

  async logoutAll(accountId: bigint) {
    await this.prisma.refreshToken.deleteMany({
      where: { account_id: accountId },
    });
  }

  private async issueTokens(accountId: bigint, email: string) {
    const payload = { sub: accountId.toString(), email };

    const accessToken = this.jwt.sign(payload as any);

    const refreshToken = this.jwt.sign(payload as any, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_TTL', '7d') as any,
    });

    await this.prisma.refreshToken.create({
      data: {
        account_id: accountId,
        token: refreshToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      account: {
        id: Number(accountId),
        email,
      },
    };
  }

  private async verifyRefreshToken(token: string) {
    try {
      return this.jwt.verify<{ sub: string; email: string }>(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
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
}
