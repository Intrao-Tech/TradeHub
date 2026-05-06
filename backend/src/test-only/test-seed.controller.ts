// Test-only HTTP route gated by NODE_ENV === 'test' (followups.md FU-7).
// Lets Playwright bootstrap an admin staff account on a fresh DB so the
// staff-invite e2e flow can drive the SPA Members tab without a chicken-
// and-egg problem (every /staff mutation requires an existing admin).
//
// Also exposes a `POST /test/seed/collab-conversation` route so chat
// e2e specs can plant a collab + auto-created conversation between two
// already-registered accounts. Resolves [CHAT-200-001] in
// `tasks/done/chat/followups.md`.

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
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

  /**
   * Plant a Collaboration between two already-registered worker / employer
   * accounts. When `status === 'CONFIRMED'` (the default), also creates the
   * linked Conversation + two participants + the SYSTEM welcome message —
   * mirroring what `ConversationService.ensureCollaborationConversation`
   * produces on the auto-create-on-confirm seam (CHAT-010..013).
   *
   * Used by the Playwright chat suite (TEST-CHAT-200, 210, 220..222,
   * 230..232, 240) to bypass the post-a-job → apply → accept UI fixture
   * and start each spec from a known thread state.
   */
  @Post('collab-conversation')
  async seedCollabConversation(
    @Body()
    body: {
      workerEmail?: string;
      employerEmail?: string;
      status?: 'PENDING' | 'CONFIRMED';
      welcomeContent?: string;
    },
  ): Promise<{
    collaborationId: string;
    conversationId: string | null;
    workerAccountId: string;
    employerAccountId: string;
  }> {
    if (process.env.NODE_ENV !== 'test') {
      throw new ForbiddenException();
    }
    if (!body?.workerEmail || !body?.employerEmail) {
      throw new BadRequestException(
        'workerEmail and employerEmail are required',
      );
    }
    const status = body.status ?? 'CONFIRMED';
    const worker = await this.prisma.account.findUnique({
      where: { email: body.workerEmail },
      include: { client_profile: { include: { worker_profile: true } } },
    });
    const employer = await this.prisma.account.findUnique({
      where: { email: body.employerEmail },
      include: { client_profile: { include: { employer_profile: true } } },
    });
    if (!worker?.client_profile?.worker_profile) {
      throw new NotFoundException(
        `worker not found / not a worker account: ${body.workerEmail}`,
      );
    }
    if (!employer?.client_profile?.employer_profile) {
      throw new NotFoundException(
        `employer not found / not an employer account: ${body.employerEmail}`,
      );
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const collab = await tx.collaboration.create({
        data: {
          worker_id: worker.id,
          employer_id: employer.id,
          initiated_by: 'EMPLOYER',
          status,
          confirmed_at: status === 'CONFIRMED' ? now : null,
        },
      });
      if (status !== 'CONFIRMED') {
        return { collaborationId: collab.id, conversationId: null as bigint | null };
      }
      const conv = await tx.conversation.create({
        data: {
          collaboration_id: collab.id,
          last_message_at: now,
          participants: {
            create: [
              { account_id: worker.id },
              { account_id: employer.id },
            ],
          },
        },
      });
      await tx.message.create({
        data: {
          conversation_id: conv.id,
          sender_id: employer.id,
          content:
            body.welcomeContent ??
            'Collaboration confirmed. You can now message each other about the project.',
          message_type: 'SYSTEM',
        },
      });
      return { collaborationId: collab.id, conversationId: conv.id };
    });

    return {
      collaborationId: result.collaborationId.toString(),
      conversationId:
        result.conversationId != null ? result.conversationId.toString() : null,
      workerAccountId: worker.id.toString(),
      employerAccountId: employer.id.toString(),
    };
  }

  /**
   * Plant a JobPost owned by an already-registered employer account.
   * Used by the Playwright Jobs scenarios (TEST-JOBS-200..204) to skip
   * the "Post a job" Sheet UI and start each spec from a known job-post
   * state. Optionally also plants a JobApplication from a worker so the
   * employer-reviews / accepts paths can be exercised without driving
   * the worker-side Apply Sheet.
   */
  @Post('job-post')
  async seedJobPost(
    @Body()
    body: {
      employerEmail?: string;
      title?: string;
      payType?: 'DAY_RATE' | 'FIXED_PRICE';
      dayRateMin?: number;
      dayRateMax?: number;
      fixedPrice?: number;
      postcodeArea?: string;
      durationDays?: number;
      isUrgent?: boolean;
      status?: 'OPEN' | 'CLOSED' | 'FILLED' | 'CANCELLED';
      withApplicationFromWorkerEmail?: string;
      applicationStatus?:
        | 'PENDING'
        | 'REVIEWED'
        | 'SHORTLISTED'
        | 'ACCEPTED'
        | 'REJECTED'
        | 'WITHDRAWN';
    },
  ): Promise<{
    jobPostId: string;
    employerAccountId: string;
    applicationId: string | null;
    workerAccountId: string | null;
  }> {
    if (process.env.NODE_ENV !== 'test') {
      throw new ForbiddenException();
    }
    if (!body?.employerEmail) {
      throw new BadRequestException('employerEmail is required');
    }
    const employer = await this.prisma.account.findUnique({
      where: { email: body.employerEmail },
      include: { client_profile: { include: { employer_profile: true } } },
    });
    if (!employer?.client_profile?.employer_profile) {
      throw new NotFoundException(
        `employer not found / not an employer account: ${body.employerEmail}`,
      );
    }

    const { Prisma } = await import('@prisma/client');
    const payType = body.payType ?? 'DAY_RATE';
    const post = await this.prisma.jobPost.create({
      data: {
        employer_id: employer.id,
        title: body.title ?? 'Test job post',
        description: null,
        postcode_area: body.postcodeArea ?? 'NW1',
        pay_type: payType,
        day_rate_min:
          payType === 'DAY_RATE'
            ? new Prisma.Decimal(body.dayRateMin ?? 200)
            : null,
        day_rate_max:
          payType === 'DAY_RATE'
            ? new Prisma.Decimal(body.dayRateMax ?? 280)
            : null,
        fixed_price:
          payType === 'FIXED_PRICE' && body.fixedPrice != null
            ? new Prisma.Decimal(body.fixedPrice)
            : null,
        duration_days: body.durationDays ?? null,
        status: body.status ?? 'OPEN',
        is_urgent: body.isUrgent ?? false,
      },
    });

    let application: { id: bigint; worker_id: bigint } | null = null;
    if (body.withApplicationFromWorkerEmail) {
      const worker = await this.prisma.account.findUnique({
        where: { email: body.withApplicationFromWorkerEmail },
        include: { client_profile: { include: { worker_profile: true } } },
      });
      if (!worker?.client_profile?.worker_profile) {
        throw new NotFoundException(
          `worker not found / not a worker account: ${body.withApplicationFromWorkerEmail}`,
        );
      }
      application = await this.prisma.jobApplication.create({
        data: {
          job_post_id: post.id,
          worker_id: worker.id,
          initiated_by: 'WORKER',
          status: body.applicationStatus ?? 'PENDING',
        },
        select: { id: true, worker_id: true },
      });
    }

    return {
      jobPostId: post.id.toString(),
      employerAccountId: employer.id.toString(),
      applicationId: application ? application.id.toString() : null,
      workerAccountId: application ? application.worker_id.toString() : null,
    };
  }
}
