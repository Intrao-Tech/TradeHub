import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { ReferralService } from '../referral/referral.service';
import { REFERRAL_AUDIT_EVENTS } from '../referral/referral.constants';
import { ConversationService } from '../conversation/conversation.service';
import type { ApplicationQueryDto } from './dto/application-query.dto';
import type { ApplyJobDto } from './dto/apply-job.dto';

const applicationInclude = {
  job_post: { include: { employer: { include: { client_profile: true } } } },
  worker_profile: { include: { client_profile: true } },
  attachments: { orderBy: { created_at: 'asc' } },
} satisfies Prisma.JobApplicationInclude;

const collaborationInclude = {
  worker: { include: { client_profile: true } },
  employer: { include: { client_profile: true } },
  contracts: { orderBy: { position: 'asc' } },
  conversation: { select: { id: true } },
} satisfies Prisma.CollaborationInclude;

@Injectable()
export class JobApplicationService {
  private readonly logger = new Logger(JobApplicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly referrals: ReferralService,
    @Inject(forwardRef(() => ConversationService))
    private readonly conversations: ConversationService,
  ) {}

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

    // Project-ref attribution: look up the latest active intent recorded
    // for (this worker, target_role=WORKER, target_id=jobPostId). Replaces
    // the prior cookie-based attribution.
    let projectReferrerId: bigint | null = null;
    let projectReferrerRole: 'WORKER' | 'EMPLOYER' | null = null;
    let referrerForNotify: {
      id: bigint;
      email: string;
      display_name: string;
    } | null = null;
    const intent = await this.referrals.findActiveIntent(
      workerId,
      'WORKER',
      jobPostId,
    );
    if (intent && intent.referrer_id !== workerId) {
      // W2W referral rewards introducing a NEW worker↔employer pairing. If
      // the worker already collaborates with this job's employer, the
      // referrer introduced nothing — skip the attribution.
      const priorCollab = await this.prisma.collaboration.findFirst({
        where: { worker_id: workerId, employer_id: jobPost.employer_id },
        select: { id: true },
      });
      if (!priorCollab) {
        const referrerAcc = await this.prisma.account.findUnique({
          where: { id: intent.referrer_id },
          include: { client_profile: { select: { display_name: true } } },
        });
        if (referrerAcc) {
          projectReferrerId = referrerAcc.id;
          projectReferrerRole = 'WORKER';
          referrerForNotify = {
            id: referrerAcc.id,
            email: referrerAcc.email,
            display_name:
              referrerAcc.client_profile?.display_name ?? referrerAcc.email,
          };
        }
      }
    }

    const created = await this.prisma.jobApplication.create({
      data: {
        job_post_id: jobPostId,
        worker_id: workerId,
        initiated_by: 'WORKER',
        cover_message: dto.cover_message ?? null,
        proposed_rate:
          dto.proposed_rate != null
            ? new Prisma.Decimal(dto.proposed_rate)
            : null,
        project_referrer_id: projectReferrerId,
        project_referrer_role: projectReferrerRole,
      },
      include: applicationInclude,
    });

    if (referrerForNotify) {
      await this.audit.log(
        workerId,
        REFERRAL_AUDIT_EVENTS.PROJECT_ATTRIBUTED,
        'job_application',
        created.id,
        {
          referrer_id: String(referrerForNotify.id),
          job_post_id: String(jobPostId),
          target_role: 'WORKER',
        },
      );
      // Best-effort: tell the referrer that someone used their job link.
      void (async () => {
        try {
          const applicant = await this.prisma.clientProfile.findUnique({
            where: { id: workerId },
            select: { display_name: true },
          });
          await this.mail.sendReferralProjectAttributed(
            referrerForNotify.email,
            referrerForNotify.display_name,
            jobPost.title,
            'JOB',
            applicant?.display_name ?? 'A worker',
          );
        } catch (err) {
          this.logger.warn(
            `Failed to send project-referral notification: ${(err as Error).message}`,
          );
        }
      })();
    }

    return created;
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

    // Chat is collaboration-scoped now — find-or-create the worker<->employer
    // relationship so the invitation lands in their shared conversation.
    let collab = await this.prisma.collaboration.findFirst({
      where: { worker_id: workerId, employer_id: employerId },
    });
    if (!collab) {
      collab = await this.prisma.collaboration.create({
        data: { worker_id: workerId, employer_id: employerId },
      });
    }
    const collabId = collab.id;

    let newConvId: bigint | null = null;
    const application = await this.prisma.$transaction(async (tx) => {
      newConvId = await this.conversations.ensureCollaborationConversation(
        tx,
        collabId,
      );

      const createdMessage = await tx.message.create({
        data: {
          conversation_id: collabId,
          sender_id: employerId,
          content,
          message_type: 'JOB_INVITATION',
          metadata: { job_post_id: jobPostId.toString() },
        },
      });

      await tx.conversation.update({
        where: { id: collabId },
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

    if (newConvId !== null) {
      this.conversations.announceConversationCreated(newConvId, [
        workerId,
        employerId,
      ]);
    }
    return application;
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

    // ACCEPTED: spin up just the working relationship + persistent chat.
    // The employer creates Contract(s) later from the Collaboration page,
    // each tied to a specific JobPost they pick (Upwork-style workroom).
    if (status === 'ACCEPTED') {
      await this.spinUpRelationshipAndChat(application);
    }

    return this.prisma.jobApplication.findUniqueOrThrow({
      where: { id },
      include: applicationInclude,
    });
  }

  /**
   * Find-or-create the worker↔employer Collaboration + ensure the persistent
   * chat conversation exists. Posts a system message referencing the job
   * that triggered the acceptance so participants have context. Idempotent.
   */
  private async spinUpRelationshipAndChat(application: {
    id: bigint;
    worker_id: bigint;
    job_post: {
      id: bigint;
      employer_id: bigint;
      title: string;
      postcode_area: string | null;
      fixed_price: Prisma.Decimal | null;
    };
  }) {
    const workerId = application.worker_id;
    const employerId = application.job_post.employer_id;

    let collab = await this.prisma.collaboration.findFirst({
      where: { worker_id: workerId, employer_id: employerId },
    });
    let isNewCollab = false;
    if (!collab) {
      collab = await this.prisma.collaboration.create({
        data: { worker_id: workerId, employer_id: employerId },
      });
      isNewCollab = true;
    }

    let convId: bigint | null = null;
    try {
      await this.prisma.$transaction(async (tx) => {
        convId = await this.conversations.ensureCollaborationConversation(
          tx,
          collab.id,
        );
      });
      if (convId !== null) {
        this.conversations.announceConversationCreated(convId, [
          workerId,
          employerId,
        ]);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to ensure conversation for collab=${collab.id}: ${(err as Error).message}`,
      );
    }

    // Post a context system message so the chat opens with the job linked.
    if (isNewCollab || convId !== null) {
      try {
        await this.conversations.postSystemMessageForCollaboration(
          collab.id,
          `Job accepted: "${application.job_post.title}". Discuss scope here, then the employer can create a contract from this conversation.`,
          employerId,
        );
      } catch {
        // Non-fatal.
      }
    }
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

    // Create-or-find relationship; first-contract creation belongs to
    // ContractService and the new collaboration POST handler. Returning
    // just the relationship here so existing callers keep working —
    // they used to read `referral_id`/`status` etc., now those live on
    // Contract and require a separate fetch.
    const existing = await this.prisma.collaboration.findFirst({
      where: {
        worker_id: application.worker_id,
        employer_id: application.job_post.employer_id,
      },
      include: collaborationInclude,
    });
    if (existing) return existing;

    return this.prisma.collaboration.create({
      data: {
        worker_id: application.worker_id,
        employer_id: application.job_post.employer_id,
      },
      include: collaborationInclude,
    });
  }
}
