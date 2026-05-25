import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Pull enough of the bookmarked worker to render the existing WorkerCard
// without extra round-trips — same shape WorkerProfileService.search uses.
const savedWorkerInclude = {
  worker_profile: {
    include: {
      client_profile: true,
      worker_specialisations: { include: { specialisation: true } },
      worker_tags: { include: { tag: true } },
    },
  },
} satisfies Prisma.SavedWorkerInclude;

@Injectable()
export class SavedWorkerService {
  constructor(private readonly prisma: PrismaService) {}

  // Idempotent: saving an already-saved worker is a no-op and returns the
  // existing row. The composite PK guarantees no duplicates.
  async save(employerId: bigint, workerId: bigint) {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: workerId },
      select: { id: true },
    });
    if (!worker) throw new NotFoundException('Worker not found');

    return this.prisma.savedWorker.upsert({
      where: {
        employer_id_worker_id: {
          employer_id: employerId,
          worker_id: workerId,
        },
      },
      create: { employer_id: employerId, worker_id: workerId },
      update: {},
    });
  }

  // Idempotent unsave: deleting a row that doesn't exist returns count=0
  // and we still respond 204 — the desired end state (not saved) holds.
  async unsave(employerId: bigint, workerId: bigint) {
    await this.prisma.savedWorker.deleteMany({
      where: { employer_id: employerId, worker_id: workerId },
    });
  }

  async listForEmployer(
    employerId: bigint,
    page = 1,
    limit = 20,
  ): Promise<{
    items: Array<
      Prisma.SavedWorkerGetPayload<{ include: typeof savedWorkerInclude }>
    >;
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;
    const where: Prisma.SavedWorkerWhereInput = { employer_id: employerId };

    const [rows, total] = await Promise.all([
      this.prisma.savedWorker.findMany({
        where,
        include: savedWorkerInclude,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.savedWorker.count({ where }),
    ]);

    return { items: rows, total, page, limit };
  }

  // Returns the subset of workerIds that this employer has saved. Used to
  // enrich list / detail responses with an `is_saved` flag in one round-trip.
  async savedIdsForEmployer(
    employerId: bigint,
    workerIds: bigint[],
  ): Promise<Set<bigint>> {
    if (workerIds.length === 0) return new Set();
    const rows = await this.prisma.savedWorker.findMany({
      where: { employer_id: employerId, worker_id: { in: workerIds } },
      select: { worker_id: true },
    });
    return new Set(rows.map((r) => r.worker_id));
  }
}
