// TEST-HANDOFF-001..010 — HandoffService guard + branch logic.
// Pure-logic tests with deep-mocked Prisma; no DB, no mail, no notifications.
//
// Rules under test:
//  - a handoff can only be created for an OPEN job
//  - you cannot hand a job off to yourself (to_worker == from_worker)
//  - a targeted handoff rejects a claim/decline from anyone but the target
//  - you cannot take your own handoff
//  - an expired or already-consumed handoff cannot be claimed
//  - revoke is owner-only and refuses a handoff that was already taken
//  - consumeForApplication only matches the actor's own claimed/targeted,
//    still-open, non-expired handoff for the job

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { HandoffService } from './handoff.service';
import { PrismaService } from '../prisma/prisma.service';
import { HANDOFF_STATUS } from './handoff.constants';

function build(): {
  service: HandoffService;
  prisma: DeepMockProxy<PrismaService>;
} {
  const prisma = mockDeep<PrismaService>();
  const mail = {
    sendJobHandoffReceived: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue('http://localhost:3000') };
  const service = new HandoffService(
    prisma,
    mail as never,
    audit as never,
    notifications as never,
    config as never,
  );
  return { service, prisma };
}

const HANDER = 100n;
const FRIEND = 200n;
const OTHER = 300n;
const JOB_ID = 7001n;
const HANDOFF_ID = 9001n;

function handoffRow(over: Record<string, unknown> = {}) {
  return {
    id: HANDOFF_ID,
    job_post_id: JOB_ID,
    from_worker_id: HANDER,
    to_worker_id: null,
    claimed_by_id: null,
    token: 'tok-abc',
    status: HANDOFF_STATUS.PENDING,
    message: null,
    earn_commission: true,
    expires_at: new Date(Date.now() + 86_400_000),
    created_at: new Date(),
    job_post: {
      id: JOB_ID,
      title: 'Rewire',
      postcode_area: 'E1',
      pay_type: 'DAY_RATE',
      day_rate_min: null,
      day_rate_max: null,
      fixed_price: null,
      status: 'OPEN',
      employer: { client_profile: { display_name: 'ACME' } },
    },
    from_worker: { client_profile: { display_name: 'Mike' } },
    to_worker: null,
    ...over,
  };
}

describe('TEST-HANDOFF-001..010 HandoffService', () => {
  test('TEST-HANDOFF-001 — createHandoff refuses a non-OPEN job', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'FILLED',
      title: 'Rewire',
      employer: { client_profile: { display_name: 'ACME' } },
    } as never);

    await expect(
      service.createHandoff(HANDER, JOB_ID, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('TEST-HANDOFF-002 — createHandoff rejects handing off to yourself', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'OPEN',
      title: 'Rewire',
      employer: { client_profile: { display_name: 'ACME' } },
    } as never);

    await expect(
      service.createHandoff(HANDER, JOB_ID, { to_worker_id: String(HANDER) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('TEST-HANDOFF-003 — createHandoff rejects an unknown target worker', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'OPEN',
      title: 'Rewire',
      employer: { client_profile: { display_name: 'ACME' } },
    } as never);
    prisma.workerProfile.findUnique.mockResolvedValueOnce(null as never);

    await expect(
      service.createHandoff(HANDER, JOB_ID, { to_worker_id: String(FRIEND) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('TEST-HANDOFF-004 — createHandoff (open link) returns a shareable link, defaults commission on', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'OPEN',
      title: 'Rewire',
      employer: { client_profile: { display_name: 'ACME' } },
    } as never);
    prisma.jobHandoff.create.mockResolvedValueOnce(handoffRow() as never);

    const res = await service.createHandoff(HANDER, JOB_ID, {});
    expect(res.token).toBe('tok-abc');
    expect(res.link).toContain('/handoff/tok-abc');
    expect(res.earn_commission).toBe(true);
    expect(res.status).toBe('PENDING');
  });

  test('TEST-HANDOFF-005 — claim rejects the hander taking their own handoff', async () => {
    const { service, prisma } = build();
    prisma.jobHandoff.findUnique.mockResolvedValueOnce(handoffRow() as never);

    await expect(
      service.claimHandoff('tok-abc', HANDER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('TEST-HANDOFF-006 — claim rejects a non-target on a targeted handoff', async () => {
    const { service, prisma } = build();
    prisma.jobHandoff.findUnique.mockResolvedValueOnce(
      handoffRow({ to_worker_id: FRIEND }) as never,
    );

    await expect(service.claimHandoff('tok-abc', OTHER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  test('TEST-HANDOFF-007 — claim rejects an expired handoff', async () => {
    const { service, prisma } = build();
    prisma.jobHandoff.findUnique.mockResolvedValueOnce(
      handoffRow({ expires_at: new Date(Date.now() - 1000) }) as never,
    );
    prisma.jobHandoff.update.mockResolvedValue(handoffRow() as never);

    await expect(
      service.claimHandoff('tok-abc', FRIEND),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  test('TEST-HANDOFF-008 — claim sets CLAIMED + claimed_by for an eligible friend', async () => {
    const { service, prisma } = build();
    prisma.jobHandoff.findUnique.mockResolvedValueOnce(handoffRow() as never);
    prisma.jobHandoff.update.mockResolvedValueOnce(
      handoffRow({
        status: HANDOFF_STATUS.CLAIMED,
        claimed_by_id: FRIEND,
      }) as never,
    );

    const res = await service.claimHandoff('tok-abc', FRIEND);
    expect(res.status).toBe('CLAIMED');
    expect(res.claimed_by_id).toBe(String(FRIEND));
    expect(prisma.jobHandoff.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: HANDOFF_STATUS.CLAIMED,
          claimed_by_id: FRIEND,
        }),
      }),
    );
  });

  test('TEST-HANDOFF-009 — revoke is owner-only and refuses an already-applied handoff', async () => {
    const { service, prisma } = build();
    // not the owner
    prisma.jobHandoff.findUnique.mockResolvedValueOnce(handoffRow() as never);
    await expect(
      service.revokeHandoff(HANDOFF_ID, OTHER),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // owner, but already consumed
    prisma.jobHandoff.findUnique.mockResolvedValueOnce(
      handoffRow({ status: HANDOFF_STATUS.APPLIED }) as never,
    );
    await expect(
      service.revokeHandoff(HANDOFF_ID, HANDER),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  test('TEST-HANDOFF-010 — consumeForApplication scopes to actor + job + open + not-expired', async () => {
    const { service, prisma } = build();
    prisma.jobHandoff.findFirst.mockResolvedValueOnce({
      id: HANDOFF_ID,
      from_worker_id: HANDER,
      earn_commission: true,
    } as never);

    const res = await service.consumeForApplication(FRIEND, JOB_ID);
    expect(res?.id).toBe(HANDOFF_ID);
    expect(res?.from_worker_id).toBe(HANDER);

    const where = prisma.jobHandoff.findFirst.mock.calls[0][0]?.where as Record<
      string,
      unknown
    >;
    expect(where.job_post_id).toBe(JOB_ID);
    expect(where.from_worker_id).toEqual({ not: FRIEND });
    expect(where.OR).toEqual([
      { claimed_by_id: FRIEND },
      { to_worker_id: FRIEND },
    ]);
    expect(where.expires_at).toHaveProperty('gt');
  });

  test('TEST-HANDOFF-011 — getByToken on an unknown token throws NotFound', async () => {
    const { service, prisma } = build();
    prisma.jobHandoff.findUnique.mockResolvedValueOnce(null as never);
    await expect(service.getByToken('nope', null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
