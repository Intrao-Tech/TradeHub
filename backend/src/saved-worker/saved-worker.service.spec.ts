// SavedWorkerService unit specs — pure-logic with deep-mocked Prisma.
// Mirrors saved-job.service.spec.ts for the inverse direction:
// employers bookmark workers.

import { NotFoundException } from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { SavedWorkerService } from './saved-worker.service';
import { PrismaService } from '../prisma/prisma.service';

function build(): {
  service: SavedWorkerService;
  prisma: DeepMockProxy<PrismaService>;
} {
  const prisma = mockDeep<PrismaService>();
  const service = new SavedWorkerService(prisma);
  return { service, prisma };
}

const EMPLOYER_ID = 7n;
const WORKER_ID = 42n;

describe('SavedWorkerService.save()', () => {
  test('upserts the row and resolves with the saved record', async () => {
    const { service, prisma } = build();
    prisma.workerProfile.findUnique.mockResolvedValue({
      id: WORKER_ID,
    } as never);
    prisma.savedWorker.upsert.mockResolvedValue({
      employer_id: EMPLOYER_ID,
      worker_id: WORKER_ID,
      created_at: new Date('2026-05-25T10:00:00Z'),
    } as never);

    const result = await service.save(EMPLOYER_ID, WORKER_ID);

    expect(prisma.savedWorker.upsert).toHaveBeenCalledWith({
      where: {
        employer_id_worker_id: {
          employer_id: EMPLOYER_ID,
          worker_id: WORKER_ID,
        },
      },
      create: { employer_id: EMPLOYER_ID, worker_id: WORKER_ID },
      update: {},
    });
    expect(result.employer_id).toBe(EMPLOYER_ID);
    expect(result.worker_id).toBe(WORKER_ID);
  });

  test('saving the same worker twice is idempotent (no throw)', async () => {
    const { service, prisma } = build();
    prisma.workerProfile.findUnique.mockResolvedValue({
      id: WORKER_ID,
    } as never);
    prisma.savedWorker.upsert.mockResolvedValue({
      employer_id: EMPLOYER_ID,
      worker_id: WORKER_ID,
      created_at: new Date(),
    } as never);

    await expect(service.save(EMPLOYER_ID, WORKER_ID)).resolves.toBeDefined();
    await expect(service.save(EMPLOYER_ID, WORKER_ID)).resolves.toBeDefined();
    expect(prisma.savedWorker.upsert).toHaveBeenCalledTimes(2);
  });

  test('throws NotFoundException when the worker does not exist', async () => {
    const { service, prisma } = build();
    prisma.workerProfile.findUnique.mockResolvedValue(null);

    await expect(service.save(EMPLOYER_ID, WORKER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.savedWorker.upsert).not.toHaveBeenCalled();
  });
});

describe('SavedWorkerService.unsave()', () => {
  test('deletes the matching row', async () => {
    const { service, prisma } = build();
    prisma.savedWorker.deleteMany.mockResolvedValue({ count: 1 } as never);

    await service.unsave(EMPLOYER_ID, WORKER_ID);

    expect(prisma.savedWorker.deleteMany).toHaveBeenCalledWith({
      where: { employer_id: EMPLOYER_ID, worker_id: WORKER_ID },
    });
  });

  test('unsaving a never-saved worker is idempotent (no throw)', async () => {
    const { service, prisma } = build();
    prisma.savedWorker.deleteMany.mockResolvedValue({ count: 0 } as never);

    await expect(
      service.unsave(EMPLOYER_ID, WORKER_ID),
    ).resolves.toBeUndefined();
  });
});

describe('SavedWorkerService.listForEmployer()', () => {
  test('returns paginated shape with items and total', async () => {
    const { service, prisma } = build();
    prisma.savedWorker.findMany.mockResolvedValue([
      {
        employer_id: EMPLOYER_ID,
        worker_id: WORKER_ID,
        created_at: new Date(),
      },
    ] as never);
    prisma.savedWorker.count.mockResolvedValue(1 as never);

    const result = await service.listForEmployer(EMPLOYER_ID, 1, 20);

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.items).toHaveLength(1);
  });

  test('honours page and limit args (computes correct skip)', async () => {
    const { service, prisma } = build();
    prisma.savedWorker.findMany.mockResolvedValue([] as never);
    prisma.savedWorker.count.mockResolvedValue(0 as never);

    await service.listForEmployer(EMPLOYER_ID, 3, 10);

    const args = prisma.savedWorker.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
    };
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
  });
});

describe('SavedWorkerService.savedIdsForEmployer()', () => {
  test('returns the subset of ids that the employer has saved', async () => {
    const { service, prisma } = build();
    prisma.savedWorker.findMany.mockResolvedValue([
      { worker_id: 1n },
      { worker_id: 3n },
    ] as never);

    const set = await service.savedIdsForEmployer(EMPLOYER_ID, [1n, 2n, 3n]);

    expect(set.has(1n)).toBe(true);
    expect(set.has(2n)).toBe(false);
    expect(set.has(3n)).toBe(true);
  });

  test('short-circuits and skips the query when the id list is empty', async () => {
    const { service, prisma } = build();

    const set = await service.savedIdsForEmployer(EMPLOYER_ID, []);

    expect(set.size).toBe(0);
    expect(prisma.savedWorker.findMany).not.toHaveBeenCalled();
  });
});
