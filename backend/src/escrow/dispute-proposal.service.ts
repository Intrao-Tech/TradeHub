import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import { EscrowService } from './escrow.service';

export interface ProposeResolutionInput {
  worker_pct: number;
  employer_refund_pct: number;
  keep_platform_fee: boolean;
  reasoning: string;
}

export type DecisionVerdict = 'ACCEPT' | 'REJECT';

/**
 * Staff dispute-resolution proposals.
 *
 * Replaces the single-shot `resolveDispute` admin flow with a two-party
 * approval gate:
 *   1. Staff proposes a split via `propose()`. A new proposal row is created
 *      with status=PENDING_RESPONSE; both parties' decisions are PENDING.
 *      Dispute status transitions to MEDIATION.
 *   2. Worker and employer each call `decide()` with ACCEPT or REJECT.
 *   3. When BOTH accept → we call `escrowService.resolveDispute()` to do
 *      the actual Stripe transfers, then mark the proposal EXECUTED and
 *      dispute RESOLVED.
 *   4. If EITHER rejects → proposal goes REJECTED. Staff can propose again
 *      (old PENDING gets SUPERSEDED first) or call `escalate()` to move the
 *      dispute to ARBITRATION_PENDING (we don't handle arbitration in app).
 */
@Injectable()
export class DisputeProposalService {
  private readonly logger = new Logger(DisputeProposalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly escrow: EscrowService,
  ) {}

  // ─── Staff: create a proposal ───────────────────────────────

  async propose(
    disputeId: bigint,
    staffAccountId: bigint,
    input: ProposeResolutionInput,
    ip?: string,
  ) {
    this.validateInput(input);
    const dispute = await this.loadDisputeWithParties(disputeId);
    if (
      dispute.status === 'RESOLVED' ||
      dispute.status === 'ARBITRATION_PENDING'
    ) {
      throw new ConflictException({
        code: 'DISPUTE_CLOSED',
        message: `Dispute is ${dispute.status}; cannot create new proposals.`,
      });
    }

    const proposal = await this.prisma.$transaction(async (tx) => {
      // Supersede any previous PENDING proposal — only one open at a time
      // (also enforced by the partial UNIQUE index).
      await tx.escrowDisputeProposal.updateMany({
        where: { dispute_id: disputeId, status: 'PENDING_RESPONSE' },
        data: { status: 'SUPERSEDED', resolved_at: new Date() },
      });
      // Move dispute to MEDIATION while a proposal sits there
      if (dispute.status !== 'MEDIATION') {
        await tx.escrowDispute.update({
          where: { id: disputeId },
          data: { status: 'MEDIATION' },
        });
      }
      return tx.escrowDisputeProposal.create({
        data: {
          dispute_id: disputeId,
          proposed_by_staff_id: staffAccountId,
          worker_pct: input.worker_pct,
          employer_refund_pct: input.employer_refund_pct,
          keep_platform_fee: input.keep_platform_fee,
          reasoning: input.reasoning.trim(),
        },
      });
    });

    await this.audit.log(
      staffAccountId,
      'escrow.dispute.proposed',
      'escrow_dispute_proposal',
      proposal.id,
      {
        dispute_id: disputeId.toString(),
        worker_pct: input.worker_pct,
        employer_refund_pct: input.employer_refund_pct,
        keep_platform_fee: input.keep_platform_fee,
      },
      ip,
    );

    void this.notifyParties(dispute, {
      type: 'DISPUTE_PROPOSAL',
      title: 'Mediator proposed a resolution',
      body: `Worker ${input.worker_pct}% · Employer refund ${input.employer_refund_pct}%. Open the dispute to accept or reject.`,
      data: {
        dispute_id: disputeId.toString(),
        proposal_id: proposal.id.toString(),
      },
    });

    return this.getCurrent(disputeId);
  }

  // ─── Party: accept / reject ─────────────────────────────────

  async decide(
    disputeId: bigint,
    proposalId: bigint,
    clientProfileId: bigint,
    verdict: DecisionVerdict,
    note: string | undefined,
    ip?: string,
  ) {
    const proposal = await this.prisma.escrowDisputeProposal.findUnique({
      where: { id: proposalId },
    });
    if (!proposal || proposal.dispute_id !== disputeId) {
      throw new NotFoundException({ code: 'PROPOSAL_NOT_FOUND' });
    }
    if (proposal.status !== 'PENDING_RESPONSE') {
      throw new ConflictException({
        code: 'PROPOSAL_CLOSED',
        message: `Proposal is ${proposal.status}; cannot record a new decision.`,
      });
    }
    const dispute = await this.loadDisputeWithParties(disputeId);
    const role = this.partyRole(dispute, clientProfileId);

    const fieldDecision = role === 'WORKER' ? 'worker_decision' : 'employer_decision';
    const fieldAt = role === 'WORKER' ? 'worker_decided_at' : 'employer_decided_at';
    const fieldNote = role === 'WORKER' ? 'worker_decision_note' : 'employer_decision_note';
    if (proposal[fieldDecision] !== 'PENDING') {
      throw new ConflictException({
        code: 'ALREADY_DECIDED',
        message: `${role} has already ${proposal[fieldDecision].toLowerCase()} this proposal.`,
      });
    }

    const updated = await this.prisma.escrowDisputeProposal.update({
      where: { id: proposalId },
      data: {
        [fieldDecision]: verdict === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
        [fieldAt]: new Date(),
        [fieldNote]: note?.trim() || null,
      },
    });

    await this.audit.log(
      clientProfileId,
      `escrow.dispute.proposal.${verdict.toLowerCase()}`,
      'escrow_dispute_proposal',
      proposalId,
      {
        dispute_id: disputeId.toString(),
        role,
        note: note?.trim() ?? null,
      },
      ip,
    );

    // Reject → proposal terminates; staff can propose again or escalate.
    if (verdict === 'REJECT') {
      await this.prisma.escrowDisputeProposal.update({
        where: { id: proposalId },
        data: { status: 'REJECTED', resolved_at: now() },
      });
      void this.notifyParties(
        dispute,
        {
          type: 'DISPUTE_PROPOSAL_REJECTED',
          title: 'Proposal rejected',
          body: `${role.toLowerCase()} rejected the latest mediator proposal.`,
          data: {
            dispute_id: disputeId.toString(),
            proposal_id: proposalId.toString(),
          },
        },
        // Also ping the mediator so they know to take next step
        proposal.proposed_by_staff_id,
      );
      return this.getCurrent(disputeId);
    }

    // Accept — check whether both sides have accepted now
    const bothAccepted =
      (role === 'WORKER'
        ? updated.employer_decision
        : updated.worker_decision) === 'ACCEPTED';

    if (!bothAccepted) {
      // Notify the other party / mediator that one side has signed off
      void this.notifyParties(
        dispute,
        {
          type: 'DISPUTE_PROPOSAL_PARTIAL_ACCEPT',
          title: 'Other party accepted the proposal',
          body:
            role === 'WORKER'
              ? 'Worker accepted. Awaiting employer.'
              : 'Employer accepted. Awaiting worker.',
          data: {
            dispute_id: disputeId.toString(),
            proposal_id: proposalId.toString(),
          },
        },
        proposal.proposed_by_staff_id,
      );
      return this.getCurrent(disputeId);
    }

    // Both accepted — execute via existing escrow.resolveDispute
    try {
      await this.escrow.resolveDispute(
        disputeId,
        proposal.proposed_by_staff_id, // moderator who proposed
        proposal.worker_pct,
        proposal.employer_refund_pct,
        proposal.keep_platform_fee,
        proposal.reasoning,
        ip,
      );
      // Find the audit row written by resolveDispute (best-effort lookup)
      const auditRow = await this.prisma.auditLog.findFirst({
        where: {
          entity_type: 'escrow_milestone',
          action: { contains: 'dispute' },
          created_at: { gte: new Date(Date.now() - 60_000) },
        },
        orderBy: { created_at: 'desc' },
      });
      await this.prisma.escrowDisputeProposal.update({
        where: { id: proposalId },
        data: {
          status: 'EXECUTED',
          resolved_at: now(),
          execution_audit_id: auditRow?.id ?? null,
        },
      });
      void this.notifyParties(
        dispute,
        {
          type: 'DISPUTE_RESOLVED',
          title: 'Dispute resolved',
          body: `Worker ${proposal.worker_pct}% · Employer refund ${proposal.employer_refund_pct}%. Funds have moved.`,
          data: {
            dispute_id: disputeId.toString(),
            proposal_id: proposalId.toString(),
          },
        },
        proposal.proposed_by_staff_id,
      );
    } catch (err) {
      this.logger.error(
        `Failed to execute resolved proposal ${proposalId}: ${(err as Error).message}`,
      );
      throw err;
    }

    return this.getCurrent(disputeId);
  }

  // ─── Staff: escalate to arbitration ─────────────────────────

  async escalate(
    disputeId: bigint,
    staffAccountId: bigint,
    reason: string,
    ip?: string,
  ) {
    if (!reason?.trim() || reason.trim().length < 10) {
      throw new BadRequestException({
        code: 'REASON_TOO_SHORT',
        message: 'Reason is required (≥10 chars).',
      });
    }
    const dispute = await this.loadDisputeWithParties(disputeId);
    if (dispute.status === 'RESOLVED') {
      throw new ConflictException({ code: 'ALREADY_RESOLVED' });
    }
    if (dispute.status === 'ARBITRATION_PENDING') {
      throw new ConflictException({ code: 'ALREADY_ESCALATED' });
    }
    await this.prisma.$transaction([
      this.prisma.escrowDispute.update({
        where: { id: disputeId },
        data: {
          status: 'ARBITRATION_PENDING',
          arbitration_required: true,
        },
      }),
      // Any open proposal is superseded — out of platform now.
      this.prisma.escrowDisputeProposal.updateMany({
        where: { dispute_id: disputeId, status: 'PENDING_RESPONSE' },
        data: { status: 'SUPERSEDED', resolved_at: new Date() },
      }),
    ]);

    await this.audit.log(
      staffAccountId,
      'escrow.dispute.escalated',
      'escrow_dispute',
      disputeId,
      { reason: reason.trim() },
      ip,
    );

    void this.notifyParties(dispute, {
      type: 'DISPUTE_ESCALATED',
      title: 'Dispute escalated to arbitration',
      body: 'In-platform mediation ended. We will be in touch by email about next steps.',
      data: {
        dispute_id: disputeId.toString(),
      },
    });
    return { ok: true };
  }

  // ─── Read: current proposal + history ───────────────────────

  // ─── Party (filer): cancel an open dispute ─────────────────

  /**
   * Allow the original filer to drop a dispute they opened by mistake.
   * Only permitted while status is still OPEN — once the counter-party has
   * responded or staff has proposed a resolution, the dispute can only be
   * closed via the proposal flow or escalation.
   */
  async cancelByFiler(
    disputeId: bigint,
    clientProfileId: bigint,
    ip?: string,
  ) {
    const dispute = await this.loadDisputeWithParties(disputeId);
    if (dispute.status !== 'OPEN') {
      throw new ConflictException({
        code: 'CANNOT_CANCEL',
        message: `Dispute is ${dispute.status}; can only cancel while OPEN.`,
      });
    }
    const role = this.partyRole(dispute, clientProfileId);
    if (role !== dispute.filed_by_role) {
      throw new ForbiddenException({
        code: 'NOT_FILER',
        message: 'Only the party that filed the dispute can cancel it.',
      });
    }

    const milestone = dispute.milestone;
    // Restore the milestone status the dispute came from. FUNDED if the
    // worker hadn't submitted yet, otherwise SUBMITTED.
    const restoredStatus = milestone.worker_submitted_at
      ? 'SUBMITTED'
      : 'FUNDED';

    await this.prisma.$transaction([
      this.prisma.escrowMilestone.update({
        where: { id: milestone.id },
        data: { status: restoredStatus, disputed_at: null },
      }),
      this.prisma.escrowDispute.update({
        where: { id: disputeId },
        data: { status: 'CANCELED', resolved_at: new Date() },
      }),
    ]);

    await this.audit.log(
      clientProfileId,
      'escrow.dispute.canceled',
      'escrow_dispute',
      disputeId,
      { milestone_id: milestone.id.toString(), filed_by_role: role },
      ip,
    );

    void this.notifyParties(dispute, {
      type: 'DISPUTE_CANCELED',
      title: 'Dispute cancelled',
      body: `${role.toLowerCase()} cancelled the dispute on milestone "${milestone.title}". The milestone is back in ${restoredStatus} state.`,
      data: {
        dispute_id: disputeId.toString(),
        milestone_id: milestone.id.toString(),
      },
    });

    return { ok: true, restored_status: restoredStatus };
  }

  async getCurrent(disputeId: bigint) {
    const dispute = await this.prisma.escrowDispute.findUnique({
      where: { id: disputeId },
    });
    if (!dispute) throw new NotFoundException({ code: 'DISPUTE_NOT_FOUND' });
    const current = await this.prisma.escrowDisputeProposal.findFirst({
      where: { dispute_id: disputeId, status: 'PENDING_RESPONSE' },
      include: {
        proposed_by: { select: { id: true, display_name: true } },
      },
    });
    const history = await this.prisma.escrowDisputeProposal.findMany({
      where: { dispute_id: disputeId, status: { not: 'PENDING_RESPONSE' } },
      orderBy: { proposed_at: 'desc' },
      take: 10,
      include: {
        proposed_by: { select: { id: true, display_name: true } },
      },
    });
    return {
      dispute_id: disputeId.toString(),
      dispute_status: dispute.status,
      arbitration_required: dispute.arbitration_required,
      current: current ? this.serialize(current) : null,
      history: history.map((p) => this.serialize(p)),
    };
  }

  // ─── Internals ──────────────────────────────────────────────

  private validateInput(input: ProposeResolutionInput) {
    if (
      typeof input.worker_pct !== 'number' ||
      typeof input.employer_refund_pct !== 'number' ||
      input.worker_pct < 0 ||
      input.worker_pct > 100 ||
      input.employer_refund_pct < 0 ||
      input.employer_refund_pct > 100
    ) {
      throw new BadRequestException({
        code: 'INVALID_SPLIT',
        message: 'worker_pct and employer_refund_pct must each be 0..100.',
      });
    }
    if (input.worker_pct + input.employer_refund_pct !== 100) {
      throw new BadRequestException({
        code: 'INVALID_SPLIT',
        message: 'worker_pct + employer_refund_pct must equal 100.',
      });
    }
    if (!input.reasoning?.trim() || input.reasoning.trim().length < 30) {
      throw new BadRequestException({
        code: 'REASONING_TOO_SHORT',
        message: 'Reasoning must be ≥30 characters.',
      });
    }
  }

  private async loadDisputeWithParties(disputeId: bigint) {
    const dispute = await this.prisma.escrowDispute.findUnique({
      where: { id: disputeId },
      include: {
        milestone: {
          include: {
            contract: {
              include: {
                collaboration: {
                  select: { worker_id: true, employer_id: true },
                },
              },
            },
          },
        },
      },
    });
    if (!dispute) throw new NotFoundException({ code: 'DISPUTE_NOT_FOUND' });
    return dispute;
  }

  private partyRole(
    dispute: Awaited<ReturnType<DisputeProposalService['loadDisputeWithParties']>>,
    clientProfileId: bigint,
  ): 'WORKER' | 'EMPLOYER' {
    const collab = dispute.milestone.contract.collaboration;
    if (collab.worker_id === clientProfileId) return 'WORKER';
    if (collab.employer_id === clientProfileId) return 'EMPLOYER';
    throw new ForbiddenException({
      code: 'NOT_A_PARTY',
      message: 'You are not a party to this dispute.',
    });
  }

  private async notifyParties(
    dispute: Awaited<ReturnType<DisputeProposalService['loadDisputeWithParties']>>,
    notif: {
      type: string;
      title: string;
      body: string;
      data?: Record<string, unknown>;
    },
    alsoStaffId?: bigint,
  ) {
    const collab = dispute.milestone.contract.collaboration;
    const recipients = new Set<bigint>([collab.worker_id, collab.employer_id]);
    if (alsoStaffId) recipients.add(alsoStaffId);
    for (const r of recipients) {
      try {
        await this.notifications.create(r, {
          type: notif.type,
          title: notif.title,
          body: notif.body,
          data: (notif.data ?? {}) as Prisma.InputJsonValue as Record<
            string,
            unknown
          >,
          channel: 'IN_APP',
        });
      } catch (err) {
        this.logger.warn(
          `Failed to notify ${r}: ${(err as Error).message}`,
        );
      }
    }
  }

  private serialize(p: {
    id: bigint;
    dispute_id: bigint;
    worker_pct: number;
    employer_refund_pct: number;
    keep_platform_fee: boolean;
    reasoning: string;
    status: string;
    worker_decision: string;
    worker_decided_at: Date | null;
    worker_decision_note: string | null;
    employer_decision: string;
    employer_decided_at: Date | null;
    employer_decision_note: string | null;
    proposed_at: Date;
    resolved_at: Date | null;
    proposed_by: { id: bigint; display_name: string };
  }) {
    return {
      id: p.id.toString(),
      dispute_id: p.dispute_id.toString(),
      worker_pct: p.worker_pct,
      employer_refund_pct: p.employer_refund_pct,
      keep_platform_fee: p.keep_platform_fee,
      reasoning: p.reasoning,
      status: p.status,
      worker_decision: p.worker_decision,
      worker_decided_at: p.worker_decided_at,
      worker_decision_note: p.worker_decision_note,
      employer_decision: p.employer_decision,
      employer_decided_at: p.employer_decided_at,
      employer_decision_note: p.employer_decision_note,
      proposed_at: p.proposed_at,
      resolved_at: p.resolved_at,
      proposed_by: {
        id: p.proposed_by.id.toString(),
        display_name: p.proposed_by.display_name,
      },
    };
  }
}

function now() {
  return new Date();
}
