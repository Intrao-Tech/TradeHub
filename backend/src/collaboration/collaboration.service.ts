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
import { ContractService } from '../contract/contract.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CONTRACT_STATUS } from '../contract/contract.constants';
import {
  CollaborationQueryDto,
  CreateCollaborationDto,
} from './dto/collaboration.dto';

const collaborationInclude = {
  worker: { include: { client_profile: true } },
  employer: { include: { client_profile: true } },
  contracts: {
    orderBy: { position: 'asc' },
    include: { escrow_transaction: { select: { id: true, status: true } } },
  },
  conversation: { select: { id: true } },
} satisfies Prisma.CollaborationInclude;

@Injectable()
export class CollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ConversationService))
    private readonly conversations?: ConversationService,
    @Inject(forwardRef(() => ContractService))
    private readonly contracts?: ContractService,
  ) {}

  /**
   * Create-or-find relationship + propose first contract in one flow.
   * Replaces the legacy "create Collaboration with status PENDING" flow.
   */
  async create(
    dto: CreateCollaborationDto,
    initiatorRole: 'WORKER' | 'EMPLOYER',
    initiatorId: bigint,
  ) {
    let worker_id: bigint;
    let employer_id: bigint;

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

    // Find-or-create the relationship binding.
    let collab = await this.prisma.collaboration.findFirst({
      where: { worker_id, employer_id },
    });
    if (!collab) {
      collab = await this.prisma.collaboration.create({
        data: { worker_id, employer_id },
      });
    }

    // Bring up the chat thread eagerly so participants can talk before any
    // contract is funded (former CHAT-010 invariant — kept after refactor).
    if (this.conversations) {
      await this.prisma.$transaction(async (tx) => {
        const id = await this.conversations!.ensureCollaborationConversation(
          tx,
          collab.id,
          worker_id,
          employer_id,
          initiatorId,
        );
        if (id !== null) {
          this.conversations!.announceConversationCreated(id, [
            worker_id,
            employer_id,
          ]);
        }
      });
    }

    // Propose the first contract (replaces what the old "PENDING collaboration"
    // represented). Skipped if there is no project shape provided.
    if (dto.project_type && this.contracts) {
      await this.contracts.createContract(
        initiatorId,
        collab.id,
        {
          project_type: dto.project_type,
          site_postcode: dto.site_postcode ?? undefined,
          agreed_amount: dto.agreed_amount ?? undefined,
          initiated_by: initiatorRole,
        },
        { propose: true },
      );
    }

    return this.getById(collab.id);
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
    };
    // Optional filter by latest contract status — passed through `status`.
    if (query.status) {
      where.contracts = { some: { status: query.status } };
    }

    const [items, total] = await Promise.all([
      this.prisma.collaboration.findMany({
        where,
        include: collaborationInclude,
        orderBy: [{ first_contracted_at: 'desc' }, { created_at: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.collaboration.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Hire-again flow: spawns a new contract on an existing relationship.
   * Refuses if there is already an in-flight contract.
   */
  async hireAgain(
    collabId: bigint,
    actorId: bigint,
    dto: CreateCollaborationDto,
  ) {
    const collab = await this.prisma.collaboration.findUnique({
      where: { id: collabId },
    });
    if (!collab) throw new NotFoundException('Collaboration not found');
    if (actorId !== collab.worker_id && actorId !== collab.employer_id) {
      throw new ForbiddenException('Not a participant of this relationship');
    }

    const initiatorRole: 'WORKER' | 'EMPLOYER' =
      actorId === collab.worker_id ? 'WORKER' : 'EMPLOYER';

    if (!this.contracts) {
      throw new BadRequestException('Contract module not available');
    }

    return this.contracts.createContract(
      actorId,
      collabId,
      {
        project_type: dto.project_type ?? 'Untitled',
        site_postcode: dto.site_postcode ?? undefined,
        agreed_amount: dto.agreed_amount ?? undefined,
        initiated_by: initiatorRole,
      },
      { propose: true },
    );
  }

  /**
   * Find the relationship between a worker + employer pair, scoped to the
   * caller (must be a participant or staff). Used by post-accept UI to
   * deep-link to /collaborations/:id without listing.
   */
  async findByPair(
    workerId: bigint,
    employerId: bigint,
    user: CurrentUserPayload,
  ) {
    const cp = user.clientProfileId;
    if (
      !user.isStaff &&
      (cp == null || (cp !== workerId && cp !== employerId))
    ) {
      throw new ForbiddenException('Not a participant of this pair');
    }
    const collab = await this.prisma.collaboration.findFirst({
      where: { worker_id: workerId, employer_id: employerId },
      select: { id: true },
    });
    if (!collab) throw new NotFoundException('No collaboration for this pair');
    return collab;
  }

  /**
   * Public: lookup the latest active contract for a relationship.
   * Used by clients still calling old escrow-by-collab routes.
   */
  async getLatestActiveContract(collabId: bigint) {
    return this.prisma.contract.findFirst({
      where: {
        collaboration_id: collabId,
        status: { in: [CONTRACT_STATUS.ACTIVE, CONTRACT_STATUS.PROPOSED] },
      },
      orderBy: { position: 'desc' },
    });
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
