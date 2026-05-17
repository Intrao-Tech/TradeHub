import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewQueryDto } from './dto/review-query.dto';

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reviews are now scoped to a Contract (post-CR-008). The HTTP path still
   * accepts a contract_id; the legacy "by collaboration" surface forwards
   * to the latest ENDED contract under that collab.
   */
  async create(
    contractId: bigint,
    clientProfileId: bigint,
    dto: CreateReviewDto,
  ) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { collaboration: true },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== 'ENDED') {
      throw new BadRequestException(
        'Reviews can only be created for ended contracts',
      );
    }

    let reviewer_role: string;
    if (contract.collaboration.worker_id === clientProfileId) {
      reviewer_role = 'WORKER';
    } else if (contract.collaboration.employer_id === clientProfileId) {
      reviewer_role = 'EMPLOYER';
    } else {
      throw new ForbiddenException('Not a participant in this contract');
    }

    const existing = await this.prisma.review.findFirst({
      where: { contract_id: contractId, reviewer_role },
    });
    if (existing) {
      throw new BadRequestException(
        `A ${reviewer_role} review already exists for this contract`,
      );
    }

    return this.prisma.review.create({
      data: {
        contract_id: contractId,
        reviewer_role,
        overall_rating: dto.overall_rating,
        quality_rating: dto.quality_rating ?? null,
        reliability_rating: dto.reliability_rating ?? null,
        communication_rating: dto.communication_rating ?? null,
        payment_rating: dto.payment_rating ?? null,
        safety_rating: dto.safety_rating ?? null,
        comment: dto.comment ?? null,
      },
    });
  }

  async getByContract(contractId: bigint) {
    return this.prisma.review.findMany({
      where: { contract_id: contractId },
      orderBy: { created_at: 'asc' },
    });
  }

  /** Back-compat alias — collab → all reviews across all contracts under it. */
  async getByCollaboration(collaborationId: bigint) {
    return this.prisma.review.findMany({
      where: { contract: { collaboration_id: collaborationId } },
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * Back-compat surface used by /reviews/collaboration/:id POST. Resolves
   * the latest ENDED contract under the collab, then creates the review
   * against that contract. Returns 400 if no ended contract exists.
   */
  async createForCollaboration(
    collaborationId: bigint,
    clientProfileId: bigint,
    dto: CreateReviewDto,
  ) {
    const contract = await this.prisma.contract.findFirst({
      where: { collaboration_id: collaborationId, status: 'ENDED' },
      orderBy: { position: 'desc' },
    });
    if (!contract) {
      throw new BadRequestException(
        'No ended contract under this relationship — cannot review',
      );
    }
    return this.create(contract.id, clientProfileId, dto);
  }

  async getBySubject(
    subjectId: bigint,
    query: ReviewQueryDto,
    role: 'WORKER' | 'EMPLOYER',
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const collaborationWhere =
      role === 'WORKER' ? { worker_id: subjectId } : { employer_id: subjectId };
    const reviewer_role = role === 'WORKER' ? 'EMPLOYER' : 'WORKER';

    const where = {
      is_published: true,
      reviewer_role,
      contract: { collaboration: collaborationWhere },
    } as Prisma.ReviewWhereInput;

    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { published_at: 'desc' },
        include: { contract: { include: { collaboration: true } } },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async getUnpublished(query: ReviewQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ReviewWhereInput = { is_published: false };

    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { contract: { include: { collaboration: true } } },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async publish(reviewId: bigint) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { contract: { select: { collaboration_id: true } } },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.is_published) {
      return review;
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        is_published: true,
        published_at: new Date(),
      },
    });

    await this.recalculateRatings(
      review.contract.collaboration_id,
      review.reviewer_role,
    );

    return updated;
  }

  async getById(id: bigint, user?: CurrentUserPayload) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: { contract: { include: { collaboration: true } } },
    });
    if (!review) throw new NotFoundException('Review not found');

    if (review.is_published) {
      return review;
    }

    if (user?.isStaff) {
      return review;
    }

    const cp = user?.clientProfileId;
    if (cp == null) {
      throw new ForbiddenException('This review is not published');
    }

    const collaboration = review.contract.collaboration;
    const isReviewer =
      (review.reviewer_role === 'WORKER' && collaboration.worker_id === cp) ||
      (review.reviewer_role === 'EMPLOYER' && collaboration.employer_id === cp);

    if (!isReviewer) {
      throw new ForbiddenException('This review is not published');
    }

    return review;
  }

  private async recalculateRatings(
    collaborationId: bigint,
    reviewerRole: string,
  ) {
    const collab = await this.prisma.collaboration.findUniqueOrThrow({
      where: { id: collaborationId },
    });

    if (reviewerRole === 'EMPLOYER') {
      const workerId = collab.worker_id;
      const [agg, count] = await Promise.all([
        this.prisma.review.aggregate({
          where: {
            is_published: true,
            reviewer_role: 'EMPLOYER',
            contract: { collaboration: { worker_id: workerId } },
          },
          _avg: { overall_rating: true },
        }),
        this.prisma.review.count({
          where: {
            is_published: true,
            reviewer_role: 'EMPLOYER',
            contract: { collaboration: { worker_id: workerId } },
          },
        }),
      ]);
      const avg = agg._avg?.overall_rating ?? 0;
      await this.prisma.workerProfile.update({
        where: { id: workerId },
        data: {
          rating_avg: new Prisma.Decimal(avg ?? 0),
          rating_count: count,
        },
      });
    } else if (reviewerRole === 'WORKER') {
      const employerId = collab.employer_id;
      const [agg, count] = await Promise.all([
        this.prisma.review.aggregate({
          where: {
            is_published: true,
            reviewer_role: 'WORKER',
            contract: { collaboration: { employer_id: employerId } },
          },
          _avg: { overall_rating: true },
        }),
        this.prisma.review.count({
          where: {
            is_published: true,
            reviewer_role: 'WORKER',
            contract: { collaboration: { employer_id: employerId } },
          },
        }),
      ]);
      const avg = agg._avg?.overall_rating ?? 0;
      await this.prisma.employerProfile.update({
        where: { id: employerId },
        data: {
          rating_avg: new Prisma.Decimal(avg ?? 0),
          rating_count: count,
        },
      });
    }
  }

  async assertContractParticipant(
    contractId: bigint,
    user: CurrentUserPayload,
  ) {
    if (user.isStaff) return;
    const cp = user.clientProfileId;
    if (cp == null) throw new ForbiddenException('No client profile');
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { collaboration: true },
    });
    if (!c) throw new NotFoundException('Contract not found');
    if (
      c.collaboration.worker_id !== cp &&
      c.collaboration.employer_id !== cp
    ) {
      throw new ForbiddenException('Not a participant in this contract');
    }
  }

  /** Back-compat shim — old controllers may still call this name. */
  async assertCollaborationParticipant(
    collaborationId: bigint,
    user: CurrentUserPayload,
  ) {
    if (user.isStaff) return;
    const cp = user.clientProfileId;
    if (cp == null) throw new ForbiddenException('No client profile');
    const c = await this.prisma.collaboration.findUnique({
      where: { id: collaborationId },
    });
    if (!c) throw new NotFoundException('Collaboration not found');
    if (c.worker_id !== cp && c.employer_id !== cp) {
      throw new ForbiddenException('Not a participant in this collaboration');
    }
  }
}
