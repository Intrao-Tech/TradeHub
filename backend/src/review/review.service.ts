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

  async create(
    collaborationId: bigint,
    clientProfileId: bigint,
    dto: CreateReviewDto,
  ) {
    const collaboration = await this.prisma.collaboration.findUnique({
      where: { id: collaborationId },
    });
    if (!collaboration) throw new NotFoundException('Collaboration not found');
    if (collaboration.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Reviews can only be created for completed collaborations',
      );
    }

    let reviewer_role: string;
    if (collaboration.worker_id === clientProfileId) {
      reviewer_role = 'WORKER';
    } else if (collaboration.employer_id === clientProfileId) {
      reviewer_role = 'EMPLOYER';
    } else {
      throw new ForbiddenException('Not a participant in this collaboration');
    }

    const existing = await this.prisma.review.findFirst({
      where: {
        collaboration_id: collaborationId,
        reviewer_role,
      },
    });
    if (existing) {
      throw new BadRequestException(
        `A ${reviewer_role} review already exists for this collaboration`,
      );
    }

    return this.prisma.review.create({
      data: {
        collaboration_id: collaborationId,
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

  async getByCollaboration(collaborationId: bigint) {
    return this.prisma.review.findMany({
      where: { collaboration_id: collaborationId },
      orderBy: { created_at: 'asc' },
    });
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
      collaboration: collaborationWhere,
    };

    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { published_at: 'desc' },
        include: { collaboration: true },
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
      updated.collaboration_id,
      updated.reviewer_role,
    );

    return updated;
  }

  async getById(id: bigint, user?: CurrentUserPayload) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: { collaboration: true },
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

    const { collaboration } = review;
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
            collaboration: { worker_id: workerId },
          },
          _avg: { overall_rating: true },
        }),
        this.prisma.review.count({
          where: {
            is_published: true,
            reviewer_role: 'EMPLOYER',
            collaboration: { worker_id: workerId },
          },
        }),
      ]);
      const avg = agg._avg.overall_rating;
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
            collaboration: { employer_id: employerId },
          },
          _avg: { overall_rating: true },
        }),
        this.prisma.review.count({
          where: {
            is_published: true,
            reviewer_role: 'WORKER',
            collaboration: { employer_id: employerId },
          },
        }),
      ]);
      const avg = agg._avg.overall_rating;
      await this.prisma.employerProfile.update({
        where: { id: employerId },
        data: {
          rating_avg: new Prisma.Decimal(avg ?? 0),
          rating_count: count,
        },
      });
    }
  }

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
