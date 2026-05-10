import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConversationService } from '../conversation/conversation.service';
import { MailService } from '../mail/mail.service';
import { readProjectRefCookie } from '../referral/referral-cookie';
import { REFERRAL_AUDIT_EVENTS } from '../referral/referral.constants';
import {
  CONTRACT_AUDIT_EVENTS,
  CONTRACT_BLOCKING_MILESTONE_STATES,
  CONTRACT_END_REASON,
  CONTRACT_STATUS,
  type ContractEndReason,
} from './contract.constants';
import { CreateContractDto } from './dto/create-contract.dto';
import { EndContractDto } from './dto/end-contract.dto';

@Injectable()
export class ContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly conversation: ConversationService,
    private readonly mail: MailService,
  ) {}

  /**
   * Create a new Contract under a relationship (Collaboration). Returns the
   * fresh Contract row in DRAFT (or PROPOSED if `propose=true`).
   *
   * Use cases: first contract on a brand-new collab; "Hire again" on an
   * existing collab that has only ENDED contracts.
   */
  async createContract(
    actorAccountId: bigint,
    collaborationId: bigint,
    dto: CreateContractDto,
    opts: { propose?: boolean; cookieHeader?: string } = {},
  ) {
    const collab = await this.prisma.collaboration.findUnique({
      where: { id: collaborationId },
      include: { contracts: { orderBy: { position: 'desc' }, take: 1 } },
    });
    if (!collab) throw new NotFoundException('Collaboration not found');
    if (
      collab.worker_id !== actorAccountId &&
      collab.employer_id !== actorAccountId
    ) {
      throw new ForbiddenException('Not a participant of this relationship');
    }

    const inFlight = await this.prisma.contract.findFirst({
      where: {
        collaboration_id: collaborationId,
        status: {
          in: [
            CONTRACT_STATUS.DRAFT,
            CONTRACT_STATUS.PROPOSED,
            CONTRACT_STATUS.ACTIVE,
          ],
        },
      },
    });
    if (inFlight) {
      throw new ConflictException(
        'There is already an active or pending contract on this relationship',
      );
    }

    const nextPos = (collab.contracts[0]?.position ?? 0) + 1;
    const status = opts.propose
      ? CONTRACT_STATUS.PROPOSED
      : CONTRACT_STATUS.DRAFT;

    // E→E project ref attribution: only when employer initiates the contract,
    // cookie target_role=EMPLOYER, target_id matches this collab's worker_id,
    // and referrer != employer (anti self-ref).
    let projectReferrerId: bigint | null = null;
    let projectReferrerRole: 'WORKER' | 'EMPLOYER' | null = null;
    let referrerForNotify: {
      id: bigint;
      email: string;
      display_name: string;
    } | null = null;
    const refCookie = readProjectRefCookie(opts.cookieHeader);
    if (
      refCookie &&
      refCookie.target_role === 'EMPLOYER' &&
      String(refCookie.target_id) === String(collab.worker_id) &&
      dto.initiated_by === 'EMPLOYER' &&
      actorAccountId === collab.employer_id
    ) {
      const referrer = await this.prisma.account.findUnique({
        where: { referral_code: refCookie.code.toUpperCase() },
        include: {
          client_profile: { select: { display_name: true } },
        },
      });
      if (referrer && referrer.id !== collab.employer_id) {
        projectReferrerId = referrer.id;
        projectReferrerRole = 'EMPLOYER';
        referrerForNotify = {
          id: referrer.id,
          email: referrer.email,
          display_name: referrer.client_profile?.display_name ?? referrer.email,
        };
      }
    }

    // W→W project ref backfill: when contract is created from a JobPost the
    // worker applied to, copy any project_referrer_id captured on the matching
    // JobApplication. Otherwise the chain (link click → application → hire →
    // commission) is broken at the hire step. E→E cookie above takes priority.
    if (!projectReferrerId && dto.job_post_id) {
      const app = await this.prisma.jobApplication.findUnique({
        where: {
          job_post_id_worker_id: {
            job_post_id: BigInt(dto.job_post_id),
            worker_id: collab.worker_id,
          },
        },
        select: {
          project_referrer_id: true,
          project_referrer_role: true,
        },
      });
      if (
        app?.project_referrer_id &&
        app.project_referrer_role === 'WORKER' &&
        app.project_referrer_id !== collab.worker_id &&
        app.project_referrer_id !== collab.employer_id
      ) {
        projectReferrerId = app.project_referrer_id;
        projectReferrerRole = 'WORKER';
        const referrerAcc = await this.prisma.account.findUnique({
          where: { id: app.project_referrer_id },
          include: { client_profile: { select: { display_name: true } } },
        });
        if (referrerAcc) {
          referrerForNotify = {
            id: referrerAcc.id,
            email: referrerAcc.email,
            display_name:
              referrerAcc.client_profile?.display_name ?? referrerAcc.email,
          };
        }
      }
    }

    const contract = await this.prisma.contract.create({
      data: {
        collaboration_id: collaborationId,
        position: nextPos,
        status,
        agreed_amount: dto.agreed_amount
          ? new Prisma.Decimal(dto.agreed_amount)
          : null,
        project_type: dto.project_type,
        site_postcode: dto.site_postcode ?? null,
        job_post_id: dto.job_post_id ? BigInt(dto.job_post_id) : null,
        initiated_by: dto.initiated_by,
        project_referrer_id: projectReferrerId,
        project_referrer_role: projectReferrerRole,
      },
    });

    if (referrerForNotify && projectReferrerRole) {
      await this.audit.log(
        actorAccountId,
        REFERRAL_AUDIT_EVENTS.PROJECT_ATTRIBUTED,
        'contract',
        contract.id,
        {
          referrer_id: String(referrerForNotify.id),
          referrer_role: projectReferrerRole,
          target_worker_id: String(collab.worker_id),
        },
      );
      const workerName =
        (
          await this.prisma.clientProfile.findUnique({
            where: { id: collab.worker_id },
            select: { display_name: true },
          })
        )?.display_name ?? 'a worker';
      const actorName =
        (
          await this.prisma.clientProfile.findUnique({
            where: { id: actorAccountId },
            select: { display_name: true },
          })
        )?.display_name ?? 'An employer';
      void this.mail
        .sendReferralProjectAttributed(
          referrerForNotify.email,
          referrerForNotify.display_name,
          workerName,
          projectReferrerRole === 'WORKER' ? 'JOB' : 'WORKER',
          actorName,
        )
        .catch(() => undefined);
    }

    await this.prisma.collaboration.update({
      where: { id: collaborationId },
      data: { last_contract_id: contract.id },
    });

    await this.audit.log(
      actorAccountId,
      CONTRACT_AUDIT_EVENTS.CREATED,
      'contract',
      contract.id,
      { position: nextPos, status, collaboration_id: String(collaborationId) },
    );

    if (status === CONTRACT_STATUS.PROPOSED) {
      await this.audit.log(
        actorAccountId,
        CONTRACT_AUDIT_EVENTS.PROPOSED,
        'contract',
        contract.id,
        {},
      );
      await this.postSystemMessage(
        collaborationId,
        contract.id,
        `Contract #${nextPos} proposed: ${dto.project_type}.`,
      );
    }

    return contract;
  }

  /** DRAFT → PROPOSED. Only the contract initiator can propose. */
  async proposeContract(actorAccountId: bigint, contractId: bigint) {
    const contract = await this.requireContract(contractId);
    await this.requireParticipant(contract.collaboration_id, actorAccountId);
    if (contract.status !== CONTRACT_STATUS.DRAFT) {
      throw new BadRequestException('Only DRAFT contracts can be proposed');
    }
    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: { status: CONTRACT_STATUS.PROPOSED },
    });
    await this.audit.log(
      actorAccountId,
      CONTRACT_AUDIT_EVENTS.PROPOSED,
      'contract',
      contractId,
      {},
    );
    await this.postSystemMessage(
      contract.collaboration_id,
      contractId,
      `Contract #${contract.position} proposed.`,
    );
    return updated;
  }

  /** PROPOSED → ACTIVE (accept) or ENDED (decline). */
  async respondToContract(
    actorAccountId: bigint,
    contractId: bigint,
    accept: boolean,
  ) {
    const contract = await this.requireContract(contractId);
    const collab = await this.requireParticipant(
      contract.collaboration_id,
      actorAccountId,
    );
    if (contract.status !== CONTRACT_STATUS.PROPOSED) {
      throw new BadRequestException('Contract is not awaiting response');
    }
    // Only the counterparty (not the initiator) can respond.
    const initiatorIsWorker = contract.initiated_by === 'WORKER';
    const counterpartyId = initiatorIsWorker
      ? collab.employer_id
      : collab.worker_id;
    if (actorAccountId !== counterpartyId) {
      throw new ForbiddenException('Only the counterparty can respond');
    }

    if (accept) {
      const updated = await this.prisma.$transaction(async (tx) => {
        const c = await tx.contract.update({
          where: { id: contractId },
          data: {
            status: CONTRACT_STATUS.ACTIVE,
            started_at: new Date(),
          },
        });
        await tx.collaboration.update({
          where: { id: contract.collaboration_id },
          data: {
            last_contract_id: contractId,
            first_contracted_at: collab.first_contracted_at ?? new Date(),
          },
        });
        return c;
      });
      await this.audit.log(
        actorAccountId,
        CONTRACT_AUDIT_EVENTS.ACCEPTED,
        'contract',
        contractId,
        {},
      );
      await this.postSystemMessage(
        contract.collaboration_id,
        contractId,
        `Contract #${contract.position} accepted — work can start.`,
      );
      return updated;
    } else {
      const updated = await this.prisma.contract.update({
        where: { id: contractId },
        data: {
          status: CONTRACT_STATUS.ENDED,
          end_reason: CONTRACT_END_REASON.CANCELED,
          ended_at: new Date(),
        },
      });
      await this.audit.log(
        actorAccountId,
        CONTRACT_AUDIT_EVENTS.DECLINED,
        'contract',
        contractId,
        {},
      );
      await this.postSystemMessage(
        contract.collaboration_id,
        contractId,
        `Contract #${contract.position} declined.`,
      );
      return updated;
    }
  }

  /**
   * ACTIVE → ENDED. Refuses if any milestone is in a blocking state
   * (FUNDED / SUBMITTED / DISPUTED / RELEASE_FAILED). PENDING milestones
   * are auto-canceled on success.
   */
  async endContract(
    actorAccountId: bigint,
    contractId: bigint,
    dto: EndContractDto,
  ) {
    const contract = await this.requireContract(contractId);
    await this.requireParticipant(contract.collaboration_id, actorAccountId);

    if (contract.status === CONTRACT_STATUS.ENDED) {
      return contract; // idempotent
    }
    if (
      contract.status !== CONTRACT_STATUS.ACTIVE &&
      contract.status !== CONTRACT_STATUS.PROPOSED &&
      contract.status !== CONTRACT_STATUS.DRAFT
    ) {
      throw new BadRequestException('Contract cannot be ended from this state');
    }

    const blocking = await this.prisma.escrowMilestone.findFirst({
      where: {
        escrow: { contract_id: contractId },
        status: {
          in: CONTRACT_BLOCKING_MILESTONE_STATES as unknown as string[],
        },
      },
    });
    if (blocking) {
      throw new ConflictException(
        'Resolve in-flight milestones before ending the contract',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // PENDING milestones → CANCELED.
      await tx.escrowMilestone.updateMany({
        where: { escrow: { contract_id: contractId }, status: 'PENDING' },
        data: { status: 'CANCELED' },
      });
      const c = await tx.contract.update({
        where: { id: contractId },
        data: {
          status: CONTRACT_STATUS.ENDED,
          end_reason: dto.end_reason as ContractEndReason,
          ended_at: new Date(),
        },
      });
      await tx.collaboration.update({
        where: { id: contract.collaboration_id },
        data: { last_contract_id: contractId },
      });
      return c;
    });

    await this.audit.log(
      actorAccountId,
      CONTRACT_AUDIT_EVENTS.ENDED,
      'contract',
      contractId,
      { end_reason: dto.end_reason },
    );
    await this.postSystemMessage(
      contract.collaboration_id,
      contractId,
      `Contract #${contract.position} ended (${dto.end_reason.toLowerCase()}).`,
    );
    return updated;
  }

  /** Public read — any participant of the relationship. */
  async getContract(actorAccountId: bigint, contractId: bigint) {
    const contract = await this.requireContract(contractId);
    await this.requireParticipant(contract.collaboration_id, actorAccountId);

    const full = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        collaboration: {
          include: {
            worker: {
              include: { client_profile: { select: { display_name: true } } },
            },
            employer: {
              include: { client_profile: { select: { display_name: true } } },
            },
            conversation: { select: { id: true } },
          },
        },
        project_referrer: {
          select: { id: true, email: true, referral_code: true },
        },
        escrow_transaction: {
          select: { id: true, status: true },
        },
        reviews: true,
      },
    });
    return full;
  }

  /** List all contracts under a relationship. */
  async listContractsForCollab(
    actorAccountId: bigint,
    collaborationId: bigint,
  ) {
    await this.requireParticipant(collaborationId, actorAccountId);
    return this.prisma.contract.findMany({
      where: { collaboration_id: collaborationId },
      orderBy: { position: 'asc' },
      include: {
        escrow_transaction: { select: { id: true, status: true } },
      },
    });
  }

  // ─────────────────── Helpers ───────────────────

  private async requireContract(contractId: bigint) {
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!c) throw new NotFoundException('Contract not found');
    return c;
  }

  private async requireParticipant(
    collaborationId: bigint,
    actorAccountId: bigint,
  ) {
    const collab = await this.prisma.collaboration.findUnique({
      where: { id: collaborationId },
    });
    if (!collab) throw new NotFoundException('Collaboration not found');
    if (
      collab.worker_id !== actorAccountId &&
      collab.employer_id !== actorAccountId
    ) {
      throw new ForbiddenException('Not a participant of this relationship');
    }
    return collab;
  }

  private async postSystemMessage(
    collaborationId: bigint,
    _contractId: bigint,
    body: string,
  ) {
    try {
      await this.conversation.postSystemMessageForCollaboration(
        collaborationId,
        body,
      );
    } catch {
      // Chat might not exist yet for this collab — system msg is best-effort.
    }
  }
}
