import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const savedJobInclude = {
  job_post: {
    include: {
      employer: { include: { client_profile: true } },
      specialisations: { include: { specialisation: true } },
      tags: { include: { tag: true } },
      attachments: { orderBy: { created_at: 'asc' } },
      _count: { select: { applications: true } },
    },
  },
} satisfies Prisma.SavedJobInclude;

@Injectable()
export class SavedJobService {
  constructor(private readonly prisma: PrismaService) {}

  // Idempotent: saving an already-saved post is a no-op and returns the
  // existing row. The unique composite PK guarantees no duplicates.
  async save(workerId: bigint, jobPostId: bigint) {
    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
      select: { id: true },
    });
    if (!jobPost) throw new NotFoundException('Job post not found');

    return this.prisma.savedJob.upsert({
      where: {
        worker_id_job_post_id: { worker_id: workerId, job_post_id: jobPostId },
      },
      create: { worker_id: workerId, job_post_id: jobPostId },
      update: {},
    });
  }

  // Idempotent unsave: deleting a row that doesn't exist returns count=0
  // and we still respond 200 — the desired end state (not saved) holds.
  async unsave(workerId: bigint, jobPostId: bigint) {
    await this.prisma.savedJob.deleteMany({
      where: { worker_id: workerId, job_post_id: jobPostId },
    });
  }

  async listForWorker(
    workerId: bigint,
    page = 1,
    limit = 20,
  ): Promise<{
    items: Array<Prisma.SavedJobGetPayload<{ include: typeof savedJobInclude }>>;
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;
    const where: Prisma.SavedJobWhereInput = { worker_id: workerId };

    const [rows, total] = await Promise.all([
      this.prisma.savedJob.findMany({
        where,
        include: savedJobInclude,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.savedJob.count({ where }),
    ]);

    return { items: rows, total, page, limit };
  }

  // Returns the subset of jobPostIds that this worker has saved. Used to
  // enrich list/detail responses with an `is_saved` flag in one round-trip.
  async savedIdsForWorker(
    workerId: bigint,
    jobPostIds: bigint[],
  ): Promise<Set<bigint>> {
    if (jobPostIds.length === 0) return new Set();
    const rows = await this.prisma.savedJob.findMany({
      where: { worker_id: workerId, job_post_id: { in: jobPostIds } },
      select: { job_post_id: true },
    });
    return new Set(rows.map((r) => r.job_post_id));
  }
}
