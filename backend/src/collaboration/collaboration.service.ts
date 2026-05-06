import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationService } from '../conversation/conversation.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import {
  CollaborationQueryDto,
  CreateCollaborationDto,
} from './dto/collaboration.dto';

const collaborationInclude = {
  worker: { include: { client_profile: true } },
  employer: { include: { client_profile: true } },
  reviews: true,
  escrow_transaction: true,
  referral: true,
} satisfies Prisma.CollaborationInclude;

@Injectable()
export class CollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ConversationService))
    private readonly conversations?: ConversationService,
  ) {}

  async create(
    dto: CreateCollaborationDto,
    initiatorRole: 'WORKER' | 'EMPLOYER',
    initiatorId: bigint,
  ) {
    let worker_id: bigint;
    let employer_id: bigint;
    const initiated_by = initiatorRole;

    if (initiatorRole === 'WORKER') {
      if (dto.employer_id == null) {
        throw new BadRequestException(
          'employer_id is required when worker initiates',
        );
      }
      if (dto.worker_id != null) {
        throw new BadRequestException(
          'Do not pass worker_id when worker initiates',
        );
      }
      worker_id = initiatorId;
      employer_id = BigInt(dto.employer_id);
    } else {
      if (dto.worker_id == null) {
        throw new BadRequestException(
          'worker_id is required when employer initiates',
        );
      }
      if (dto.employer_id != null) {
        throw new BadRequestException(
          'Do not pass employer_id when employer initiates',
        );
      }
      employer_id = initiatorId;
      worker_id = BigInt(dto.worker_id);
    }

    if (worker_id === employer_id) {
      throw new BadRequestException('worker_id and employer_id must differ');
    }

    return this.prisma.collaboration.create({
      data: {
        worker_id,
        employer_id,
        initiated_by,
        referral_id: dto.referral_id != null ? BigInt(dto.referral_id) : null,
        project_type: dto.project_type ?? null,
        site_postcode: dto.site_postcode ?? null,
        agreed_amount:
          dto.agreed_amount != null
            ? new Prisma.Decimal(dto.agreed_amount)
            : null,
      },
      include: collaborationInclude,
    });
  }

  async getById(id: bigint) {
    const row = await this.prisma.collaboration.findUnique({
      where: { id },
      include: collaborationInclude,
    });
    if (!row) throw new NotFoundException('Collaboration not found');
    return row;
  }

  async getByIdForUser(id: bigint, user: CurrentUserPayload) {
    const row = await this.getById(id);
    this.assertCanView(row, user);
    return row;
  }

  async getByUser(clientProfileId: bigint, query: CollaborationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CollaborationWhereInput = {
      OR: [{ worker_id: clientProfileId }, { employer_id: clientProfileId }],
      ...(query.status != null ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.collaboration.findMany({
        where,
        include: collaborationInclude,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.collaboration.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async updateStatus(id: bigint, nextStatus: string, userId: bigint) {
    const collab = await this.prisma.collaboration.findUnique({
      where: { id },
    });
    if (!collab) throw new NotFoundException('Collaboration not found');

    const isParticipant =
      userId === collab.worker_id || userId === collab.employer_id;
    if (!isParticipant) {
      throw new ForbiddenException('Only participants can update status');
    }

    const current = collab.status;
    if (current === nextStatus) {
      throw new BadRequestException('Status is already ' + current);
    }

    const isResponder =
      collab.initiated_by === 'WORKER'
        ? userId === collab.employer_id
        : userId === collab.worker_id;

    const data: Prisma.CollaborationUpdateInput = { status: nextStatus };

    if (nextStatus === 'DISPUTED') {
      data.flagged = true;
    }

    if (current === 'PENDING' && nextStatus === 'CONFIRMED') {
      if (!isResponder) {
        throw new ForbiddenException('Only the responder can confirm');
      }
      data.confirmed_at = new Date();
    } else if (current === 'PENDING' && nextStatus === 'REJECTED') {
      if (!isResponder) {
        throw new ForbiddenException('Only the responder can reject');
      }
    } else if (current === 'CONFIRMED' && nextStatus === 'IN_PROGRESS') {
      data.started_at = collab.started_at ?? new Date();
    } else if (current === 'IN_PROGRESS' && nextStatus === 'COMPLETED') {
      data.ended_at = new Date();
    } else if (nextStatus === 'DISPUTED') {
      // allowed from any state for participants
    } else {
      throw new BadRequestException(
        `Invalid status transition: ${current} -> ${nextStatus}`,
      );
    }

    // CHAT-010..012 — auto-create the chat thread inside the same
    // transaction as the status update, idempotently. The conversation
    // service is optional in tests that pre-date this contract.
    let createdConversationId: bigint | null = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.collaboration.update({ where: { id }, data });
      if (
        current === 'PENDING' &&
        nextStatus === 'CONFIRMED' &&
        this.conversations
      ) {
        // Account ids equal worker/employer profile ids by the
        // shared-PK pattern (Account → ClientProfile → Worker/Employer).
        createdConversationId =
          await this.conversations.ensureCollaborationConversation(
            tx,
            collab.id,
            collab.worker_id,
            collab.employer_id,
            userId,
          );
      }
    });

    if (createdConversationId !== null && this.conversations) {
      await this.conversations.announceConversationCreated(
        createdConversationId,
        [collab.worker_id, collab.employer_id],
      );
    }

    return this.getById(id);
  }

  async flag(id: bigint, reason: string, user: CurrentUserPayload) {
    const collab = await this.prisma.collaboration.findUnique({
      where: { id },
    });
    if (!collab) throw new NotFoundException('Collaboration not found');

    const cp = user.clientProfileId;
    const isParty =
      cp != null && (cp === collab.worker_id || cp === collab.employer_id);
    const isStaff = user.isStaff;

    if (!isParty && !isStaff) {
      throw new ForbiddenException('Only participants or staff can flag');
    }

    await this.prisma.collaboration.update({
      where: { id },
      data: {
        flagged: true,
        flag_reason: reason,
      },
    });
    return this.getById(id);
  }

  private assertCanView(
    collab: { worker_id: bigint; employer_id: bigint },
    user: CurrentUserPayload,
  ) {
    if (user.isStaff) return;
    const cp = user.clientProfileId;
    if (cp == null) {
      throw new ForbiddenException('No client profile');
    }
    if (cp !== collab.worker_id && cp !== collab.employer_id) {
      throw new ForbiddenException('Not allowed to view this collaboration');
    }
  }
}
