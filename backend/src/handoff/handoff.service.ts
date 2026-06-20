import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import {
  HANDOFF_AUDIT_EVENTS,
  HANDOFF_EXPIRY_DAYS,
  HANDOFF_NOTIFICATION_TYPE,
  HANDOFF_OPEN_STATUSES,
  HANDOFF_STATUS,
  generateHandoffToken,
} from './handoff.constants';
import type { CreateHandoffDto } from './dto/create-handoff.dto';

const handoffInclude = {
  job_post: {
    include: { employer: { include: { client_profile: true } } },
  },
  from_worker: { include: { client_profile: true } },
  to_worker: { include: { client_profile: true } },
} as const;

@Injectable()
export class HandoffService {
  private readonly logger = new Logger(HandoffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
  ) {}

  private get frontendUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  private linkFor(token: string): string {
    return `${this.frontendUrl}/handoff/${token}`;
  }

  /**
   * A worker hands a specific OPEN job to a mate. Generates a tokenised link;
   * if `to_worker_id` is supplied the targeted worker is notified in-app +
   * by email. The hander does not need to have applied to the job.
   */
  async createHandoff(
    fromWorkerId: bigint,
    jobPostId: bigint,
    dto: CreateHandoffDto,
  ) {
    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
      include: { employer: { include: { client_profile: true } } },
    });
    if (!jobPost) throw new NotFoundException('Job post not found');
    if (jobPost.status !== 'OPEN') {
      throw new BadRequestException({
        code: 'JOB_CLOSED',
        message: 'This job is not open, so it cannot be handed off',
      });
    }

    let toWorkerId: bigint | null = null;
    if (dto.to_worker_id != null) {
      toWorkerId = BigInt(dto.to_worker_id);
      if (toWorkerId === fromWorkerId) {
        throw new BadRequestException({
          code: 'SELF_HANDOFF',
          message: 'You cannot hand a job off to yourself',
        });
      }
      const target = await this.prisma.workerProfile.findUnique({
        where: { id: toWorkerId },
        select: { id: true },
      });
      if (!target) throw new BadRequestException('Target worker not found');
    }

    const expiresAt = new Date(
      Date.now() + HANDOFF_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    const handoff = await this.prisma.jobHandoff.create({
      data: {
        job_post_id: jobPostId,
        from_worker_id: fromWorkerId,
        to_worker_id: toWorkerId,
        token: generateHandoffToken(),
        message: dto.message?.trim() || null,
        earn_commission: dto.earn_commission ?? true,
        expires_at: expiresAt,
      },
      include: handoffInclude,
    });

    await this.audit.log(
      fromWorkerId,
      HANDOFF_AUDIT_EVENTS.CREATED,
      'job_handoff',
      handoff.id,
      {
        job_post_id: String(jobPostId),
        to_worker_id: toWorkerId ? String(toWorkerId) : null,
        earn_commission: handoff.earn_commission,
      },
    );

    if (toWorkerId) {
      await this.notifyTargetedRecipient(handoff, jobPost.title);
    }

    return this.shape(handoff);
  }

  /**
   * Landing-page read. Public: a logged-out friend can see the context and is
   * prompted to sign in. If a logged-in worker views their own targeted /
   * open handoff, it is bumped PENDING → VIEWED.
   */
  async getByToken(token: string, viewerWorkerId: bigint | null) {
    const handoff = await this.prisma.jobHandoff.findUnique({
      where: { token },
      include: handoffInclude,
    });
    if (!handoff) throw new NotFoundException('Handoff link not found');

    const expired = await this.expireIfStale(handoff);

    // Bump PENDING → VIEWED when the (eligible) recipient first opens it.
    if (
      !expired &&
      viewerWorkerId != null &&
      handoff.status === HANDOFF_STATUS.PENDING &&
      handoff.from_worker_id !== viewerWorkerId &&
      (handoff.to_worker_id == null || handoff.to_worker_id === viewerWorkerId)
    ) {
      try {
        // Guard the bump on `status = PENDING` so a concurrent claim that
        // already advanced the row is not clobbered back to VIEWED.
        await this.prisma.jobHandoff.update({
          where: { id: handoff.id, status: HANDOFF_STATUS.PENDING },
          data: { status: HANDOFF_STATUS.VIEWED },
        });
        handoff.status = HANDOFF_STATUS.VIEWED;
      } catch {
        /* non-fatal — a concurrent transition already moved the row */
      }
    }

    const status = expired ? HANDOFF_STATUS.EXPIRED : handoff.status;
    const isHander = handoff.from_worker_id === viewerWorkerId;
    const isTargetMismatch =
      handoff.to_worker_id != null && handoff.to_worker_id !== viewerWorkerId;
    const isOpenState = (HANDOFF_OPEN_STATUSES as string[]).includes(status);

    return {
      ...this.shape({ ...handoff, status }),
      viewer: {
        is_worker: viewerWorkerId != null,
        is_hander: isHander,
        // A worker (not the hander, matching any target) can take it while open.
        can_claim:
          viewerWorkerId != null &&
          !isHander &&
          !isTargetMismatch &&
          isOpenState,
        target_mismatch: isTargetMismatch,
      },
    };
  }

  /** A worker takes ownership of a handoff (resolves an open link). */
  async claimHandoff(token: string, claimerWorkerId: bigint) {
    const handoff = await this.loadClaimable(token, claimerWorkerId);

    // Idempotent: re-claiming one you already hold is a no-op success.
    if (
      handoff.status === HANDOFF_STATUS.CLAIMED &&
      handoff.claimed_by_id === claimerWorkerId
    ) {
      return this.shape(handoff);
    }

    // Atomic transition: the `status IN (open)` filter closes the TOCTOU gap
    // where two mates race to claim the same open link — the loser's update
    // matches no row (P2025) and gets a clean 409 instead of silently
    // clobbering the winner's claim.
    let updated;
    try {
      updated = await this.prisma.jobHandoff.update({
        where: {
          id: handoff.id,
          status: { in: HANDOFF_OPEN_STATUSES as string[] },
        },
        data: {
          status: HANDOFF_STATUS.CLAIMED,
          claimed_by_id: claimerWorkerId,
        },
        include: handoffInclude,
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') {
        throw new ConflictException({
          code: 'HANDOFF_CLOSED',
          message: 'This handoff is no longer available',
        });
      }
      throw err;
    }

    await this.audit.log(
      claimerWorkerId,
      HANDOFF_AUDIT_EVENTS.CLAIMED,
      'job_handoff',
      handoff.id,
      { job_post_id: String(handoff.job_post_id) },
    );
    void this.notifyHander(
      updated,
      'claimed',
      updated.job_post?.title ?? 'a job',
    );

    return this.shape(updated);
  }

  /** The recipient declines the handoff. */
  async declineHandoff(token: string, workerId: bigint) {
    const handoff = await this.loadClaimable(token, workerId);
    const updated = await this.prisma.jobHandoff.update({
      where: { id: handoff.id },
      data: { status: HANDOFF_STATUS.DECLINED, claimed_by_id: workerId },
      include: handoffInclude,
    });
    await this.audit.log(
      workerId,
      HANDOFF_AUDIT_EVENTS.DECLINED,
      'job_handoff',
      handoff.id,
      { job_post_id: String(handoff.job_post_id) },
    );
    void this.notifyHander(
      updated,
      'declined',
      updated.job_post?.title ?? 'a job',
    );
    return this.shape(updated);
  }

  /** The hander cancels a handoff that has not yet been consumed. */
  async revokeHandoff(id: bigint, fromWorkerId: bigint) {
    const handoff = await this.prisma.jobHandoff.findUnique({ where: { id } });
    if (!handoff) throw new NotFoundException('Handoff not found');
    if (handoff.from_worker_id !== fromWorkerId) {
      throw new ForbiddenException('You did not create this handoff');
    }
    if (handoff.status === HANDOFF_STATUS.APPLIED) {
      throw new ConflictException({
        code: 'HANDOFF_ALREADY_USED',
        message: 'This handoff was already taken and cannot be revoked',
      });
    }
    const updated = await this.prisma.jobHandoff.update({
      where: { id },
      data: { status: HANDOFF_STATUS.REVOKED },
      include: handoffInclude,
    });
    await this.audit.log(
      fromWorkerId,
      HANDOFF_AUDIT_EVENTS.REVOKED,
      'job_handoff',
      id,
      { job_post_id: String(handoff.job_post_id) },
    );
    return this.shape(updated);
  }

  /** Outgoing (handed off by me) + incoming (handed to / claimed by me). */
  async listMine(workerId: bigint) {
    const [outgoing, incoming] = await Promise.all([
      this.prisma.jobHandoff.findMany({
        where: { from_worker_id: workerId },
        orderBy: { created_at: 'desc' },
        include: handoffInclude,
      }),
      this.prisma.jobHandoff.findMany({
        where: {
          OR: [{ to_worker_id: workerId }, { claimed_by_id: workerId }],
          from_worker_id: { not: workerId },
        },
        orderBy: { created_at: 'desc' },
        include: handoffInclude,
      }),
    ]);
    return {
      outgoing: outgoing.map((h) => this.shape(h)),
      incoming: incoming.map((h) => this.shape(h)),
    };
  }

  /**
   * Apply-time lookup (called by JobApplicationService.apply). Returns the
   * latest still-open handoff for (this worker, this job) that the worker is
   * entitled to — i.e. they claimed it or it was targeted at them. Read-only;
   * the caller stamps the application and then calls `markApplied`.
   */
  async consumeForApplication(
    workerId: bigint,
    jobPostId: bigint,
  ): Promise<{
    id: bigint;
    from_worker_id: bigint;
    earn_commission: boolean;
  } | null> {
    const handoff = await this.prisma.jobHandoff.findFirst({
      where: {
        job_post_id: jobPostId,
        status: { in: HANDOFF_OPEN_STATUSES as string[] },
        expires_at: { gt: new Date() },
        from_worker_id: { not: workerId },
        OR: [{ claimed_by_id: workerId }, { to_worker_id: workerId }],
      },
      orderBy: { created_at: 'desc' },
      select: { id: true, from_worker_id: true, earn_commission: true },
    });
    return handoff;
  }

  /**
   * Flip a consumed handoff to APPLIED and notify the hander. Called by
   * JobApplicationService after it has stamped `application.handoff_id`.
   * Best-effort: never blocks the application.
   */
  async markApplied(
    handoffId: bigint,
    applicantWorkerId: bigint,
    commissionKept: boolean,
  ): Promise<void> {
    try {
      const updated = await this.prisma.jobHandoff.update({
        where: { id: handoffId },
        data: {
          status: HANDOFF_STATUS.APPLIED,
          claimed_by_id: applicantWorkerId,
        },
        include: handoffInclude,
      });
      await this.audit.log(
        applicantWorkerId,
        HANDOFF_AUDIT_EVENTS.APPLIED,
        'job_handoff',
        handoffId,
        {
          job_post_id: String(updated.job_post_id),
          commission_kept: commissionKept,
        },
      );
      void this.notifyHander(
        updated,
        'applied',
        updated.job_post?.title ?? 'a job',
        commissionKept,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to mark handoff ${String(handoffId)} applied: ${
          (err as Error).message
        }`,
      );
    }
  }

  // ── internals ─────────────────────────────────────────────────────────

  /** Lazily flip an open-but-expired handoff to EXPIRED. Returns true if expired. */
  private async expireIfStale(handoff: {
    id: bigint;
    status: string;
    expires_at: Date;
  }): Promise<boolean> {
    const isOpen = (HANDOFF_OPEN_STATUSES as string[]).includes(handoff.status);
    if (!isOpen || handoff.expires_at > new Date()) return false;
    try {
      await this.prisma.jobHandoff.update({
        where: { id: handoff.id },
        data: { status: HANDOFF_STATUS.EXPIRED },
      });
    } catch {
      /* non-fatal — the read still reports EXPIRED */
    }
    return true;
  }

  /** Load a handoff for a claim/decline, enforcing the recipient guards. */
  private async loadClaimable(token: string, workerId: bigint) {
    const handoff = await this.prisma.jobHandoff.findUnique({
      where: { token },
      include: handoffInclude,
    });
    if (!handoff) throw new NotFoundException('Handoff link not found');
    if (handoff.from_worker_id === workerId) {
      throw new BadRequestException({
        code: 'SELF_HANDOFF',
        message: 'You cannot take your own handoff',
      });
    }
    if (handoff.to_worker_id != null && handoff.to_worker_id !== workerId) {
      throw new ForbiddenException('This handoff was sent to someone else');
    }
    if (await this.expireIfStale(handoff)) {
      throw new ConflictException({
        code: 'HANDOFF_EXPIRED',
        message: 'This handoff link has expired',
      });
    }
    if (!(HANDOFF_OPEN_STATUSES as string[]).includes(handoff.status)) {
      throw new ConflictException({
        code: 'HANDOFF_CLOSED',
        message: `This handoff is no longer available (${handoff.status.toLowerCase()})`,
      });
    }
    return handoff;
  }

  private async notifyTargetedRecipient(
    handoff: {
      from_worker_id: bigint;
      to_worker_id: bigint | null;
      token: string;
      from_worker?: { client_profile: { display_name: string } | null } | null;
    },
    jobTitle: string,
  ): Promise<void> {
    if (handoff.to_worker_id == null) return;
    const target = await this.prisma.clientProfile.findUnique({
      where: { id: handoff.to_worker_id },
      select: { display_name: true, account: { select: { email: true } } },
    });
    const handerName =
      handoff.from_worker?.client_profile?.display_name ?? 'A tradesperson';
    try {
      await this.notifications.create(handoff.to_worker_id, {
        type: HANDOFF_NOTIFICATION_TYPE,
        title: `${handerName} handed you a job`.slice(0, 200),
        body: `Open "${jobTitle}" to take it or pass.`.slice(0, 1000),
        data: {
          handoff_token: handoff.token,
          job_title: jobTitle,
        },
        channel: 'IN_APP',
      });
    } catch (err) {
      this.logger.warn(
        `Handoff in-app notify failed: ${(err as Error).message}`,
      );
    }
    if (target?.account?.email) {
      try {
        await this.mail.sendJobHandoffReceived(
          target.account.email,
          target.display_name,
          handerName,
          jobTitle,
          this.linkFor(handoff.token),
        );
      } catch (err) {
        this.logger.warn(`Handoff email failed: ${(err as Error).message}`);
      }
    }
  }

  /** Tell the hander their handoff was claimed / applied / declined. */
  private notifyHander(
    handoff: {
      from_worker_id: bigint;
      claimed_by_id: bigint | null;
      to_worker_id: bigint | null;
    },
    event: 'claimed' | 'applied' | 'declined',
    jobTitle: string,
    commissionKept = false,
  ): void {
    void (async () => {
      try {
        const recipientId = handoff.claimed_by_id ?? handoff.to_worker_id;
        const recipient = recipientId
          ? await this.prisma.clientProfile.findUnique({
              where: { id: recipientId },
              select: { display_name: true },
            })
          : null;
        const who = recipient?.display_name ?? 'A tradesperson';
        const verb =
          event === 'applied'
            ? 'applied for'
            : event === 'declined'
              ? 'passed on'
              : 'opened';
        const commissionNote =
          event === 'applied' && commissionKept
            ? ' You’ll earn your referral commission if they’re hired for this job.'
            : '';
        await this.notifications.create(handoff.from_worker_id, {
          type: HANDOFF_NOTIFICATION_TYPE,
          title: `${who} ${verb} the job you handed off`.slice(0, 200),
          body: `${who} ${verb} "${jobTitle}".${commissionNote}`.slice(0, 1000),
          data: { job_title: jobTitle, event },
          channel: 'IN_APP',
        });
      } catch (err) {
        this.logger.warn(
          `Handoff hander notify (${event}) failed: ${(err as Error).message}`,
        );
      }
    })();
  }

  /** Serialise a handoff row (with includes) into a stable API shape. */
  private shape(h: {
    id: bigint;
    job_post_id: bigint;
    from_worker_id: bigint;
    to_worker_id: bigint | null;
    claimed_by_id: bigint | null;
    token: string;
    status: string;
    message: string | null;
    earn_commission: boolean;
    expires_at: Date;
    created_at: Date;
    job_post?: {
      id: bigint;
      title: string;
      postcode_area: string | null;
      pay_type: string;
      day_rate_min: unknown;
      day_rate_max: unknown;
      fixed_price: unknown;
      status: string;
      employer?: { client_profile: { display_name: string } | null } | null;
    } | null;
    from_worker?: { client_profile: { display_name: string } | null } | null;
    to_worker?: { client_profile: { display_name: string } | null } | null;
  }) {
    return {
      id: String(h.id),
      token: h.token,
      link: this.linkFor(h.token),
      status: h.status,
      message: h.message,
      earn_commission: h.earn_commission,
      expires_at: h.expires_at,
      created_at: h.created_at,
      job_post: h.job_post
        ? {
            id: String(h.job_post.id),
            title: h.job_post.title,
            postcode_area: h.job_post.postcode_area,
            pay_type: h.job_post.pay_type,
            day_rate_min: h.job_post.day_rate_min?.toString() ?? null,
            day_rate_max: h.job_post.day_rate_max?.toString() ?? null,
            fixed_price: h.job_post.fixed_price?.toString() ?? null,
            status: h.job_post.status,
            employer_name:
              h.job_post.employer?.client_profile?.display_name ?? null,
          }
        : null,
      from_worker: {
        id: String(h.from_worker_id),
        display_name: h.from_worker?.client_profile?.display_name ?? null,
      },
      to_worker: h.to_worker_id
        ? {
            id: String(h.to_worker_id),
            display_name: h.to_worker?.client_profile?.display_name ?? null,
          }
        : null,
      claimed_by_id: h.claimed_by_id ? String(h.claimed_by_id) : null,
    };
  }
}
