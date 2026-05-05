import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ApplicationQueryDto } from './dto/application-query.dto';
import type { ApplyJobDto } from './dto/apply-job.dto';

const applicationInclude = {
  job_post: { include: { employer: { include: { client_profile: true } } } },
  worker_profile: { include: { client_profile: true } },
} satisfies Prisma.JobApplicationInclude;

const collaborationInclude = {
  worker: { include: { client_profile: true } },
  employer: { include: { client_profile: true } },
  reviews: true,
  escrow_transaction: true,
  referral: true,
} satisfies Prisma.CollaborationInclude;

@Injectable()
export class JobApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(jobPostId: bigint, workerId: bigint, dto: ApplyJobDto) {
    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
    });
    if (!jobPost) throw new NotFoundException('Job post not found');
    if (jobPost.status !== 'OPEN') {
      throw new BadRequestException({
        code: 'JOB_CLOSED',
        message: 'This job post is not open for applications',
      });
    }

    const existing = await this.prisma.jobApplication.findUnique({
      where: {
        job_post_id_worker_id: { job_post_id: jobPostId, worker_id: workerId },
      },
    });
    if (existing) {
      throw new ConflictException({
        code: 'ALREADY_APPLIED',
        message: 'You have already applied to this job',
      });
    }

    return this.prisma.jobApplication.create({
      data: {
        job_post_id: jobPostId,
        worker_id: workerId,
        initiated_by: 'WORKER',
        cover_message: dto.cover_message ?? null,
        proposed_rate:
          dto.proposed_rate != null
            ? new Prisma.Decimal(dto.proposed_rate)
            : null,
      },
      include: applicationInclude,
    });
  }

  async invite(
    jobPostId: bigint,
    workerId: bigint,
    employerId: bigint,
    message?: string,
  ) {
    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
    });
    if (!jobPost) throw new NotFoundException('Job post not found');
    if (jobPost.employer_id !== employerId) {
      throw new ForbiddenException('You do not own this job post');
    }

    const existing = await this.prisma.jobApplication.findUnique({
      where: {
        job_post_id_worker_id: { job_post_id: jobPostId, worker_id: workerId },
      },
    });
    if (existing) {
      throw new BadRequestException(
        'An application or invitation already exists for this worker and job',
      );
    }

    const content =
      message != null && message.trim().length > 0
        ? message.trim()
        : 'You have been invited to apply for this job.';

    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({ data: {} });

      await tx.conversationParticipant.createMany({
        data: [
          { conversation_id: conversation.id, account_id: employerId },
          { conversation_id: conversation.id, account_id: workerId },
        ],
      });

      const createdMessage = await tx.message.create({
        data: {
          conversation_id: conversation.id,
          sender_id: employerId,
          content,
          message_type: 'JOB_INVITATION',
          metadata: { job_post_id: jobPostId.toString() },
        },
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: { last_message_at: createdMessage.created_at },
      });

      return tx.jobApplication.create({
        data: {
          job_post_id: jobPostId,
          worker_id: workerId,
          initiated_by: 'EMPLOYER',
          cover_message: message?.trim() || null,
        },
        include: applicationInclude,
      });
    });
  }

  async getByJobPost(
    jobPostId: bigint,
    employerId: bigint,
    query: ApplicationQueryDto,
  ) {
    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
    });
    if (!jobPost) throw new NotFoundException('Job post not found');
    if (jobPost.employer_id !== employerId) {
      throw new ForbiddenException('Only the job owner can list applications');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.JobApplicationWhereInput = {
      job_post_id: jobPostId,
      ...(query.status != null ? { status: query.status } : {}),
      ...(query.initiated_by != null
        ? { initiated_by: query.initiated_by }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where,
        include: applicationInclude,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.jobApplication.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getMyApplications(workerId: bigint, query: ApplicationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.JobApplicationWhereInput = {
      worker_id: workerId,
      ...(query.status != null ? { status: query.status } : {}),
      ...(query.initiated_by != null
        ? { initiated_by: query.initiated_by }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.jobApplication.findMany({
        where,
        include: applicationInclude,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.jobApplication.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async updateStatus(id: bigint, status: string, userId: bigint) {
    const application = await this.prisma.jobApplication.findUnique({
      where: { id },
      include: { job_post: true },
    });
    if (!application) throw new NotFoundException('Application not found');

    if (application.status === status) {
      throw new BadRequestException({
        code: 'STATUS_UNCHANGED',
        message: `Application is already ${status.toLowerCase()}.`,
      });
    }

    const isWorker = userId === application.worker_id;
    const isEmployer = userId === application.job_post.employer_id;

    if (status === 'WITHDRAWN') {
      if (!isWorker) {
        throw new ForbiddenException('Only the worker can withdraw');
      }
    } else if (
      status === 'REVIEWED' ||
      status === 'SHORTLISTED' ||
      status === 'ACCEPTED' ||
      status === 'REJECTED'
    ) {
      if (!isEmployer) {
        throw new ForbiddenException('Only the job owner can set this status');
      }
    }

    const data: Prisma.JobApplicationUpdateInput = { status };
    if (status === 'ACCEPTED' || status === 'REJECTED') {
      data.responded_at = new Date();
    }

    await this.prisma.jobApplication.update({
      where: { id },
      data,
    });

    return this.prisma.jobApplication.findUniqueOrThrow({
      where: { id },
      include: applicationInclude,
    });
  }

  async toCollaboration(id: bigint, userId: bigint) {
    const application = await this.prisma.jobApplication.findUnique({
      where: { id },
      include: { job_post: true },
    });
    if (!application) throw new NotFoundException('Application not found');

    if (application.job_post.employer_id !== userId) {
      throw new ForbiddenException(
        'Only the employer can create a collaboration',
      );
    }
    if (application.status !== 'ACCEPTED') {
      throw new BadRequestException(
        'Application must be accepted before creating a collaboration',
      );
    }

    return this.prisma.collaboration.create({
      data: {
        worker_id: application.worker_id,
        employer_id: application.job_post.employer_id,
        initiated_by: application.initiated_by,
        job_post_id: application.job_post_id,
      },
      include: collaborationInclude,
    });
  }
}
