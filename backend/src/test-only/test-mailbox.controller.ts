// Test-only HTTP route gated by NODE_ENV === 'test' (Decisions Log
// 2026-05-03). Lets Playwright fetch the latest verification / reset
// token for a given email address by reading the corresponding token
// row directly from the DB — sidesteps the SMTP layer entirely so the
// e2e suite stays hermetic.

import {
  ForbiddenException,
  Get,
  NotFoundException,
  OnModuleInit,
  Param,
  Controller,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiExcludeController()
@Controller('test/mailbox')
export class TestMailboxController implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error(
        'TestMailboxController must not mount outside NODE_ENV=test',
      );
    }
  }

  @Get(':address')
  async getMailbox(@Param('address') address: string) {
    if (process.env.NODE_ENV !== 'test') {
      throw new ForbiddenException();
    }
    const account = await this.prisma.account.findUnique({
      where: { email: address },
      include: {
        email_verification_tokens: {
          orderBy: { created_at: 'desc' },
          take: 1,
        },
        password_reset_tokens: {
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    });
    if (!account) {
      throw new NotFoundException({
        code: 'NO_ACCOUNT',
        message: `No account for ${address}`,
      });
    }
    // The hashed token is what's stored — Playwright doesn't have the raw
    // token, but the controller can also surface only the token rows so
    // the spec can assert presence. To make Playwright actually USABLE for
    // the verify-email flow, we additionally expose the latest "raw" token
    // via a process-global sink populated by AuthService when NODE_ENV=test.
    return {
      email: account.email,
      status: account.status,
      latest_verification: getLatestRaw('verify', account.email),
      latest_reset: getLatestRaw('reset', account.email),
      latest_staff_invite_password: getLatestRaw('staff_invite', account.email),
      verification_tokens: account.email_verification_tokens.map((t) => ({
        token_hash: t.token_hash,
        expires_at: t.expires_at,
        consumed_at: t.consumed_at,
        created_at: t.created_at,
      })),
      password_reset_tokens: account.password_reset_tokens.map((t) => ({
        token_hash: t.token_hash,
        expires_at: t.expires_at,
        consumed_at: t.consumed_at,
        created_at: t.created_at,
      })),
    };
  }
}

// ── Process-global raw-token sink ─────────────────────────────
// Populated by `recordRawToken` (called from the test harness or — for
// out-of-process Playwright — from a small monkey-patch in
// `test-only.module.ts` that wraps MailService.sendVerificationEmail).
//
// Living here keeps the surface in one file. Cleared per address on read
// so a re-issue test sees the freshest token.

type RawKind = 'verify' | 'reset' | 'staff_invite';
type RawSink = Map<string, { kind: RawKind; token: string }[]>;

declare global {
  var __TEST_MAILBOX__: RawSink | undefined;
}

function sink(): RawSink {
  if (!globalThis.__TEST_MAILBOX__) {
    globalThis.__TEST_MAILBOX__ = new Map();
  }
  return globalThis.__TEST_MAILBOX__;
}

export function recordRawToken(
  kind: RawKind,
  email: string,
  token: string,
): void {
  const list = sink().get(email) ?? [];
  list.push({ kind, token });
  sink().set(email, list);
}

function getLatestRaw(kind: RawKind, email: string): string | null {
  const list = sink().get(email) ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].kind === kind) return list[i].token;
  }
  return null;
}
