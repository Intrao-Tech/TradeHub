// SavedJobService unit specs — pure-logic with deep-mocked Prisma.
// Covers: idempotent save, idempotent unsave, missing job → 404,
// list pagination shape, savedIdsForWorker batching.

import { NotFoundException } from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { SavedJobService } from './saved-job.service';
import { PrismaService } from '../prisma/prisma.service';

function build(): {
  service: SavedJobService;
  prisma: DeepMockProxy<PrismaService>;
} {
  const prisma = mockDeep<PrismaService>();
  const service = new SavedJobService(prisma);
  return { service, prisma };
}

const WORKER_ID = 11n;
const JOB_ID = 42n;

describe('SavedJobService.save()', () => {
  test('upserts the row and resolves with the saved record', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValue({ id: JOB_ID } as never);
    prisma.savedJob.upsert.mockResolvedValue({
      worker_id: WORKER_ID,
      job_post_id: JOB_ID,
      created_at: new Date('2026-05-24T10:00:00Z'),
    } as never);

    const result = await service.save(WORKER_ID, JOB_ID);

    expect(prisma.savedJob.upsert).toHaveBeenCalledWith({
      where: {
        worker_id_job_post_id: {
          worker_id: WORKER_ID,
          job_post_id: JOB_ID,
        },
      },
      create: { worker_id: WORKER_ID, job_post_id: JOB_ID },
      update: {},
    });
    expect(result.worker_id).toBe(WORKER_ID);
    expect(result.job_post_id).toBe(JOB_ID);
  });

  test('saving the same post twice is idempotent (no throw)', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValue({ id: JOB_ID } as never);
    prisma.savedJob.upsert.mockResolvedValue({
      worker_id: WORKER_ID,
      job_post_id: JOB_ID,
      created_at: new Date(),
    } as never);

    await expect(service.save(WORKER_ID, JOB_ID)).resolves.toBeDefined();
    await expect(service.save(WORKER_ID, JOB_ID)).resolves.toBeDefined();
    expect(prisma.savedJob.upsert).toHaveBeenCalledTimes(2);
  });

  test('throws NotFoundException when the job post does not exist', async () => {
    const { service, prisma } = build();
    prisma.jobPost.findUnique.mockResolvedValue(null);

    await expect(service.save(WORKER_ID, JOB_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.savedJob.upsert).not.toHaveBeenCalled();
  });
});

describe('SavedJobService.unsave()', () => {
  test('deletes the matching row', async () => {
    const { service, prisma } = build();
    prisma.savedJob.deleteMany.mockResolvedValue({ count: 1 } as never);

    await service.unsave(WORKER_ID, JOB_ID);

    expect(prisma.savedJob.deleteMany).toHaveBeenCalledWith({
      where: { worker_id: WORKER_ID, job_post_id: JOB_ID },
    });
  });

  test('unsaving a never-saved post is idempotent (no throw)', async () => {
    const { service, prisma } = build();
    prisma.savedJob.deleteMany.mockResolvedValue({ count: 0 } as never);

    await expect(service.unsave(WORKER_ID, JOB_ID)).resolves.toBeUndefined();
  });
});

describe('SavedJobService.listForWorker()', () => {
  test('returns paginated shape with items and total', async () => {
    const { service, prisma } = build();
    prisma.savedJob.findMany.mockResolvedValue([
      { worker_id: WORKER_ID, job_post_id: JOB_ID, created_at: new Date() },
    ] as never);
    prisma.savedJob.count.mockResolvedValue(1 as never);

    const result = await service.listForWorker(WORKER_ID, 1, 20);

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.items).toHaveLength(1);
  });

  test('honours page and limit args (computes correct skip)', async () => {
    const { service, prisma } = build();
    prisma.savedJob.findMany.mockResolvedValue([] as never);
    prisma.savedJob.count.mockResolvedValue(0 as never);

    await service.listForWorker(WORKER_ID, 3, 10);

    const args = prisma.savedJob.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
  });
});

describe('SavedJobService.savedIdsForWorker()', () => {
  test('returns the subset of ids that the worker has saved', async () => {
    const { service, prisma } = build();
    prisma.savedJob.findMany.mockResolvedValue([
      { job_post_id: 1n },
      { job_post_id: 3n },
    ] as never);

    const set = await service.savedIdsForWorker(WORKER_ID, [1n, 2n, 3n]);

    expect(set.has(1n)).toBe(true);
    expect(set.has(2n)).toBe(false);
    expect(set.has(3n)).toBe(true);
  });

  test('short-circuits and skips the query when the id list is empty', async () => {
    const { service, prisma } = build();

    const set = await service.savedIdsForWorker(WORKER_ID, []);

    expect(set.size).toBe(0);
    expect(prisma.savedJob.findMany).not.toHaveBeenCalled();
  });
});
