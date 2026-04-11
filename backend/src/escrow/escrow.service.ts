import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateEscrowDto } from './dto/create-escrow.dto';

const PLACEHOLDER_PI_PREFIX = 'pi_placeholder_';

@Injectable()
export class EscrowService {
  constructor(private readonly prisma: PrismaService) {}

  async create(collaborationId: bigint, employerClientProfileId: bigint, dto: CreateEscrowDto) {
    const collaboration = await this.prisma.collaboration.findUnique({
      where: { id: collaborationId },
    });
    if (!collaboration) throw new NotFoundException('Collaboration not found');
    if (collaboration.employer_id !== employerClientProfileId) {
      throw new ForbiddenException('Only the employer can create escrow');
    }
    if (
      collaboration.status !== 'CONFIRMED' &&
      collaboration.status !== 'IN_PROGRESS'
    ) {
      throw new BadRequestException(
        'Escrow can only be created for confirmed or in-progress collaborations',
      );
    }

    const existing = await this.prisma.escrowTransaction.findUnique({
      where: { collaboration_id: collaborationId },
    });
    if (existing) {
      throw new ConflictException('Escrow already exists for this collaboration');
    }

    const job = new Prisma.Decimal(dto.job_amount);
    const fee = new Prisma.Decimal(dto.platform_fee);
    const ref = new Prisma.Decimal(dto.referral_commission ?? 0);
    const worker_payout = job.minus(fee).minus(ref);

    if (worker_payout.lt(0)) {
      throw new BadRequestException('Worker payout cannot be negative');
    }

    return this.prisma.escrowTransaction.create({
      data: {
        collaboration_id: collaborationId,
        job_amount: job,
        platform_fee: fee,
        referral_commission: ref,
        worker_payout,
      },
    });
  }

  async getByCollaboration(
    collaborationId: bigint,
    user: CurrentUserPayload,
  ) {
    const collaboration = await this.prisma.collaboration.findUnique({
      where: { id: collaborationId },
    });
    if (!collaboration) throw new NotFoundException('Collaboration not found');

    if (!user.isStaff) {
      const cp = user.clientProfileId;
      if (
        cp == null ||
        (collaboration.worker_id !== cp && collaboration.employer_id !== cp)
      ) {
        throw new ForbiddenException('Cannot access this escrow');
      }
    }

    return this.prisma.escrowTransaction.findUnique({
      where: { collaboration_id: collaborationId },
    });
  }

  async getEscrowOrThrow(escrowId: bigint) {
    const escrow = await this.prisma.escrowTransaction.findUnique({
      where: { id: escrowId },
      include: { collaboration: true },
    });
    if (!escrow) throw new NotFoundException('Escrow not found');
    return escrow;
  }

  async initiateDeposit(escrowId: bigint, employerClientProfileId: bigint) {
    const escrow = await this.getEscrowOrThrow(escrowId);
    if (escrow.collaboration.employer_id !== employerClientProfileId) {
      throw new ForbiddenException('Only the employer can initiate deposit');
    }
    return this.prisma.escrowTransaction.update({
      where: { id: escrowId },
      data: {
        status: 'DEPOSIT_PENDING',
        stripe_payment_intent_id: `${PLACEHOLDER_PI_PREFIX}${escrowId}`,
      },
    });
  }

  async confirmDeposit(escrowId: bigint) {
    await this.getEscrowOrThrow(escrowId);
    return this.prisma.escrowTransaction.update({
      where: { id: escrowId },
      data: {
        status: 'HELD',
        deposit_confirmed_at: new Date(),
      },
    });
  }

  async release(escrowId: bigint) {
    await this.getEscrowOrThrow(escrowId);
    return this.prisma.escrowTransaction.update({
      where: { id: escrowId },
      data: {
        status: 'RELEASED',
        released_at: new Date(),
      },
    });
  }

  async refund(escrowId: bigint) {
    await this.getEscrowOrThrow(escrowId);
    return this.prisma.escrowTransaction.update({
      where: { id: escrowId },
      data: {
        status: 'REFUNDED',
        refunded_at: new Date(),
      },
    });
  }

  async dispute(escrowId: bigint, user: CurrentUserPayload) {
    const escrow = await this.getEscrowOrThrow(escrowId);
    const cp = user.clientProfileId;
    if (
      cp == null ||
      (escrow.collaboration.worker_id !== cp &&
        escrow.collaboration.employer_id !== cp)
    ) {
      throw new ForbiddenException('Only collaboration parties can dispute');
    }
    return this.prisma.escrowTransaction.update({
      where: { id: escrowId },
      data: {
        status: 'DISPUTED',
        disputed_at: new Date(),
      },
    });
  }
}
