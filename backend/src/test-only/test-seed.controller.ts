// Test-only HTTP route gated by NODE_ENV === 'test' (followups.md FU-7).
// Lets Playwright bootstrap an admin staff account on a fresh DB so the
// staff-invite e2e flow can drive the SPA Members tab without a chicken-
// and-egg problem (every /staff mutation requires an existing admin).

import {
  Body,
  Controller,
  ForbiddenException,
  OnModuleInit,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { generateInitialPassword } from '../common/validators/generate-initial-password';

@ApiExcludeController()
@Controller('test/seed')
export class TestSeedController implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(
        'TestSeedController must not mount outside NODE_ENV=test',
      );
    }
  }

  @Post('admin')
  async seedAdmin(@Body() body: { email?: string; password?: string }) {
    if (process.env.NODE_ENV !== 'test') {
      throw new ForbiddenException();
    }
    const email = body?.email ?? `pw-seed-admin-${Date.now()}@example.com`;
    const password = body?.password ?? generateInitialPassword();
    const passwordHash = await bcrypt.hash(password, 4);
    const account = await this.prisma.account.create({
      data: {
        email,
        password_hash: passwordHash,
        status: 'ACTIVE',
        email_verified_at: new Date(),
        last_login_at: new Date(),
        staff_member: {
          create: {
            display_name: 'PW Seed Admin',
            staff_role: 'ADMIN',
          },
        },
      },
    });
    return {
      id: account.id.toString(),
      email: account.email,
      password,
    };
  }
}
