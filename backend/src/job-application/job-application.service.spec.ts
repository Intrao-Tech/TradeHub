// TEST-JOBS-020 / 021 / 022 / 023 / 024 / 025 — JobApplicationService unit specs.
//
// Pure-logic tests with deep-mocked Prisma. Each test cites the JOBS-NNN
// clause from tasks/done/jobs-applications/spec.md it guards. The status
// state-machine is the privilege-escalation surface for this feature, so
// authorisation paths are covered exhaustively.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { JobApplicationService } from './job-application.service';
import { PrismaService } from '../prisma/prisma.service';

function build(): {
  service: JobApplicationService;
  prisma: DeepMockProxy<PrismaService>;
} {
  const prisma = mockDeep<PrismaService>();
  const service = new JobApplicationService(prisma);
  return { service, prisma };
}

const JOB_ID = 100n;
const WORKER_ID = 7n;
const EMPLOYER_ID = 8n;
const OTHER_EMPLOYER_ID = 999n;

describe('TEST-JOBS-020 JobApplicationService.apply() — JOBS-012 / BE-JOBS-2 / BE-JOBS-3', () => {
  test('JOBS-012 — worker apply on OPEN post creates a PENDING/WORKER application', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'OPEN',
    } as never);
    prisma.jobApplication.findUnique.mockResolvedValueOnce(null as never);
    prisma.jobApplication.create.mockResolvedValueOnce({
      id: 1n,
      status: 'PENDING',
      initiated_by: 'WORKER',
    } as never);

    const result = await service.apply(JOB_ID, WORKER_ID, {
      cover_message: 'Hi',
      proposed_rate: 220,
    });

    expect(result).toMatchObject({ status: 'PENDING', initiated_by: 'WORKER' });
    const args = prisma.jobApplication.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.job_post_id).toBe(JOB_ID);
    expect(args.data.worker_id).toBe(WORKER_ID);
    expect(args.data.initiated_by).toBe('WORKER');
    expect(args.data.cover_message).toBe('Hi');
  });

  test('BE-JOBS-3 / JOBS-013 — apply on CLOSED post → 400 with code JOB_CLOSED', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'CLOSED',
    } as never);

    const err = await service
      .apply(JOB_ID, WORKER_ID, {})
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as {
      code: string;
      message: string;
    };
    expect(body.code).toBe('JOB_CLOSED');
    expect(prisma.jobApplication.create).not.toHaveBeenCalled();
  });

  test('BE-JOBS-3 — apply on FILLED / CANCELLED post → 400 JOB_CLOSED', async () => {
    for (const status of ['FILLED', 'CANCELLED'] as const) {
      const { service, prisma } = build();
      prisma.jobPost.findUnique.mockResolvedValueOnce({
        id: JOB_ID,
        status,
      } as never);

      const err = await service
        .apply(JOB_ID, WORKER_ID, {})
        .catch((e: BadRequestException) => e);
      const body = (err as BadRequestException).getResponse() as {
        code: string;
      };
      expect(body.code).toBe('JOB_CLOSED');
    }
  });

  test('BE-JOBS-2 / JOBS-013 — re-apply on the same post → 409 ALREADY_APPLIED', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'OPEN',
    } as never);
    prisma.jobApplication.findUnique.mockResolvedValueOnce({
      id: 1n,
      status: 'WITHDRAWN',
    } as never);

    const err = await service
      .apply(JOB_ID, WORKER_ID, {})
      .catch((e: ConflictException) => e);
    expect(err).toBeInstanceOf(ConflictException);
    const body = (err as ConflictException).getResponse() as { code: string };
    expect(body.code).toBe('ALREADY_APPLIED');
    expect(prisma.jobApplication.create).not.toHaveBeenCalled();
  });

  test('JOBS-012 — missing post → NotFoundException (no JOB_CLOSED leak)', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce(null as never);
    await expect(service.apply(JOB_ID, WORKER_ID, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('TEST-JOBS-021 JobApplicationService.invite() — JOBS-039', () => {
  test('JOBS-039 — owner invite creates a PENDING/EMPLOYER application + a Conversation in a tx', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      employer_id: EMPLOYER_ID,
    } as never);
    prisma.jobApplication.findUnique.mockResolvedValueOnce(null as never);
    prisma.$transaction.mockImplementation(
      async (fn: (tx: PrismaService) => Promise<unknown>) =>
        fn(prisma as unknown as PrismaService),
    );
    prisma.conversation.create.mockResolvedValueOnce({ id: 50n } as never);
    prisma.conversationParticipant.createMany.mockResolvedValueOnce({
      count: 2,
    } as never);
    prisma.message.create.mockResolvedValueOnce({
      id: 1n,
      created_at: new Date(),
    } as never);
    prisma.conversation.update.mockResolvedValueOnce({} as never);
    prisma.jobApplication.create.mockResolvedValueOnce({
      id: 11n,
      status: 'PENDING',
      initiated_by: 'EMPLOYER',
    } as never);

    const result = await service.invite(
      JOB_ID,
      WORKER_ID,
      EMPLOYER_ID,
      'come work',
    );
    expect(result).toMatchObject({ initiated_by: 'EMPLOYER' });
    expect(prisma.conversation.create).toHaveBeenCalled();
    expect(prisma.conversationParticipant.createMany).toHaveBeenCalledWith({
      data: [
        { conversation_id: 50n, account_id: EMPLOYER_ID },
        { conversation_id: 50n, account_id: WORKER_ID },
      ],
    });
    const msgArgs = prisma.message.create.mock.calls[0][0] as {
      data: { content: string; message_type: string };
    };
    expect(msgArgs.data.content).toBe('come work');
    expect(msgArgs.data.message_type).toBe('JOB_INVITATION');
  });

  test('JOBS-039 — non-owner employer → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      employer_id: OTHER_EMPLOYER_ID,
    } as never);

    await expect(
      service.invite(JOB_ID, WORKER_ID, EMPLOYER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('JOBS-039 — empty/whitespace message defaults to canned invitation copy', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      employer_id: EMPLOYER_ID,
    } as never);
    prisma.jobApplication.findUnique.mockResolvedValueOnce(null as never);
    prisma.$transaction.mockImplementation(
      async (fn: (tx: PrismaService) => Promise<unknown>) =>
        fn(prisma as unknown as PrismaService),
    );
    prisma.conversation.create.mockResolvedValueOnce({ id: 50n } as never);
    prisma.conversationParticipant.createMany.mockResolvedValueOnce({
      count: 2,
    } as never);
    prisma.message.create.mockResolvedValueOnce({
      id: 1n,
      created_at: new Date(),
    } as never);
    prisma.conversation.update.mockResolvedValueOnce({} as never);
    prisma.jobApplication.create.mockResolvedValueOnce({} as never);

    await service.invite(JOB_ID, WORKER_ID, EMPLOYER_ID, '   ');
    const msgArgs = prisma.message.create.mock.calls[0][0] as {
      data: { content: string };
    };
    expect(msgArgs.data.content).toBe(
      'You have been invited to apply for this job.',
    );
  });

  test('JOBS-039 — invite-after-apply collision → BadRequestException', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      employer_id: EMPLOYER_ID,
    } as never);
    prisma.jobApplication.findUnique.mockResolvedValueOnce({
      id: 1n,
    } as never);

    await expect(
      service.invite(JOB_ID, WORKER_ID, EMPLOYER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TEST-JOBS-022 JobApplicationService.updateStatus() authorisation — JOBS-037 / JOBS-044', () => {
  function appRow(
    status: string,
    overrides: { worker_id?: bigint; employer_id?: bigint } = {},
  ) {
    return {
      id: 1n,
      worker_id: overrides.worker_id ?? WORKER_ID,
      status,
      job_post: {
        id: JOB_ID,
        employer_id: overrides.employer_id ?? EMPLOYER_ID,
      },
    } as never;
  }

  test('JOBS-044 — worker WITHDRAWS own PENDING → 200, status flipped (no responded_at)', async () => {
    const { service, prisma } = build();
    prisma.jobApplication.findUnique.mockResolvedValueOnce(appRow('PENDING'));
    prisma.jobApplication.update.mockResolvedValueOnce({} as never);
    prisma.jobApplication.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1n,
      status: 'WITHDRAWN',
    } as never);

    await service.updateStatus(1n, 'WITHDRAWN', WORKER_ID);
    const args = prisma.jobApplication.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data.status).toBe('WITHDRAWN');
    expect(args.data.responded_at).toBeUndefined();
  });

  test("JOBS-044 — worker tries to WITHDRAW someone else's application → ForbiddenException", async () => {
    const { service, prisma } = build();
    prisma.jobApplication.findUnique.mockResolvedValueOnce(
      appRow('PENDING', { worker_id: 999n }),
    );

    await expect(
      service.updateStatus(1n, 'WITHDRAWN', WORKER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('JOBS-037 — worker tries to ACCEPT own application → ForbiddenException (privilege-escalation guard)', async () => {
    const { service, prisma } = build();
    prisma.jobApplication.findUnique.mockResolvedValueOnce(appRow('PENDING'));

    await expect(
      service.updateStatus(1n, 'ACCEPTED', WORKER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test.each(['REVIEWED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'] as const)(
    'JOBS-037 — owner employer transitions PENDING→%s → 200',
    async (status) => {
      const { service, prisma } = build();
      prisma.jobApplication.findUnique.mockResolvedValueOnce(appRow('PENDING'));
      prisma.jobApplication.update.mockResolvedValueOnce({} as never);
      prisma.jobApplication.findUniqueOrThrow.mockResolvedValueOnce({
        id: 1n,
        status,
      } as never);

      await service.updateStatus(1n, status, EMPLOYER_ID);
      const args = prisma.jobApplication.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(args.data.status).toBe(status);
    },
  );

  test.each(['REVIEWED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'] as const)(
    'JOBS-037 — non-owner employer transitions to %s → ForbiddenException',
    async (status) => {
      const { service, prisma } = build();
      prisma.jobApplication.findUnique.mockResolvedValueOnce(appRow('PENDING'));

      await expect(
        service.updateStatus(1n, status, OTHER_EMPLOYER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  test('JOBS-037 — employer tries to WITHDRAW (which is worker-only) → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.jobApplication.findUnique.mockResolvedValueOnce(appRow('PENDING'));

    await expect(
      service.updateStatus(1n, 'WITHDRAWN', EMPLOYER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test.each(['ACCEPTED', 'REJECTED'] as const)(
    'JOBS-037 — %s sets responded_at to now()',
    async (status) => {
      const { service, prisma } = build();
      prisma.jobApplication.findUnique.mockResolvedValueOnce(appRow('PENDING'));
      prisma.jobApplication.update.mockResolvedValueOnce({} as never);
      prisma.jobApplication.findUniqueOrThrow.mockResolvedValueOnce({
        id: 1n,
        status,
      } as never);

      await service.updateStatus(1n, status, EMPLOYER_ID);
      const args = prisma.jobApplication.update.mock.calls[0][0] as {
        data: { status: string; responded_at?: Date };
      };
      expect(args.data.responded_at).toBeInstanceOf(Date);
    },
  );

  test('JOBS-037 — missing application → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.jobApplication.findUnique.mockResolvedValueOnce(null as never);
    await expect(
      service.updateStatus(1n, 'REVIEWED', EMPLOYER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TEST-JOBS-023 illegal transitions', () => {
  test('JOBS-037 — same-status transition → 400 STATUS_UNCHANGED (structured code)', async () => {
    const { service, prisma } = build();
    prisma.jobApplication.findUnique.mockResolvedValueOnce({
      id: 1n,
      worker_id: WORKER_ID,
      status: 'PENDING',
      job_post: { employer_id: EMPLOYER_ID },
    } as never);

    const err = await service
      .updateStatus(1n, 'PENDING', EMPLOYER_ID)
      .catch((e: BadRequestException) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as {
      code: string;
    };
    expect(body.code).toBe('STATUS_UNCHANGED');
  });

  // followup: the service does NOT block transitions out of WITHDRAWN /
  // ACCEPTED / REJECTED. Legal-transition policing is enforced by the
  // frontend action menu (JOBS-037) — pin the current backend behaviour.
  test('JOBS-037 / followup — service permits WITHDRAWN → REVIEWED if caller is the owner employer', async () => {
    const { service, prisma } = build();
    prisma.jobApplication.findUnique.mockResolvedValueOnce({
      id: 1n,
      worker_id: WORKER_ID,
      status: 'WITHDRAWN',
      job_post: { employer_id: EMPLOYER_ID },
    } as never);
    prisma.jobApplication.update.mockResolvedValueOnce({} as never);
    prisma.jobApplication.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1n,
      status: 'REVIEWED',
    } as never);

    await expect(
      service.updateStatus(1n, 'REVIEWED', EMPLOYER_ID),
    ).resolves.toBeDefined();
  });
});

describe('TEST-JOBS-024 JobApplicationService.toCollaboration() — JOBS-037', () => {
  test('JOBS-037 — ACCEPTED + owner → creates a Collaboration row', async () => {
    const { service, prisma } = build();
    prisma.jobApplication.findUnique.mockResolvedValueOnce({
      id: 1n,
      worker_id: WORKER_ID,
      job_post_id: JOB_ID,
      initiated_by: 'WORKER',
      status: 'ACCEPTED',
      job_post: { employer_id: EMPLOYER_ID },
    } as never);
    prisma.collaboration.create.mockResolvedValueOnce({ id: 200n } as never);

    const result = await service.toCollaboration(1n, EMPLOYER_ID);
    expect(result).toEqual({ id: 200n });
    const args = prisma.collaboration.create.mock.calls[0][0] as {
      data: { worker_id: bigint; employer_id: bigint };
    };
    expect(args.data.worker_id).toBe(WORKER_ID);
    expect(args.data.employer_id).toBe(EMPLOYER_ID);
  });

  test('JOBS-037 — non-ACCEPTED status → BadRequestException', async () => {
    const { service, prisma } = build();
    prisma.jobApplication.findUnique.mockResolvedValueOnce({
      id: 1n,
      status: 'PENDING',
      job_post: { employer_id: EMPLOYER_ID },
    } as never);

    await expect(
      service.toCollaboration(1n, EMPLOYER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('JOBS-037 — non-owner employer → ForbiddenException', async () => {
    const { service, prisma } = build();
    prisma.jobApplication.findUnique.mockResolvedValueOnce({
      id: 1n,
      status: 'ACCEPTED',
      job_post: { employer_id: OTHER_EMPLOYER_ID },
    } as never);

    await expect(
      service.toCollaboration(1n, EMPLOYER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('JOBS-037 — missing application → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.jobApplication.findUnique.mockResolvedValueOnce(null as never);
    await expect(
      service.toCollaboration(1n, EMPLOYER_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TEST-JOBS-025 list paths', () => {
  test('JOBS-041 — getMyApplications scopes by worker_id and honours filters', async () => {
    const { service, prisma } = build();
    prisma.jobApplication.findMany.mockResolvedValue([] as never);
    prisma.jobApplication.count.mockResolvedValue(0 as never);

    await service.getMyApplications(WORKER_ID, {
      status: 'PENDING',
      initiated_by: 'EMPLOYER',
    });
    const args = prisma.jobApplication.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
    };
    expect(args.where.worker_id).toBe(WORKER_ID);
    expect(args.where.status).toBe('PENDING');
    expect(args.where.initiated_by).toBe('EMPLOYER');
    expect(args.orderBy).toEqual({ created_at: 'desc' });
  });

  test('JOBS-033 — getByJobPost is owner-gated (non-owner → ForbiddenException)', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      employer_id: EMPLOYER_ID,
    } as never);

    await expect(
      service.getByJobPost(JOB_ID, OTHER_EMPLOYER_ID, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('JOBS-033 — owner gets the post-scoped list', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      employer_id: EMPLOYER_ID,
    } as never);
    prisma.jobApplication.findMany.mockResolvedValueOnce([] as never);
    prisma.jobApplication.count.mockResolvedValueOnce(3 as never);

    const out = await service.getByJobPost(JOB_ID, EMPLOYER_ID, {
      status: 'SHORTLISTED',
    });
    expect(out.total).toBe(3);
    const args = prisma.jobApplication.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where.job_post_id).toBe(JOB_ID);
    expect(args.where.status).toBe('SHORTLISTED');
  });

  test('JOBS-033 — getByJobPost on missing post → NotFoundException', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce(null as never);
    await expect(
      service.getByJobPost(JOB_ID, EMPLOYER_ID, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
