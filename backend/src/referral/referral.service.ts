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
import { CreateReferralDto } from './dto/create-referral.dto';
import { CreateReferralOfferDto } from './dto/create-referral-offer.dto';
import { ReferralSearchDto } from './dto/referral-search.dto';
import { RespondToOfferDto } from './dto/respond-to-offer.dto';
import { UpdateReferralDto } from './dto/update-referral.dto';

@Injectable()
export class ReferralService {
  constructor(private readonly prisma: PrismaService) {}

  async create(referrerId: bigint, dto: CreateReferralDto) {
    return this.prisma.referral.create({
      data: {
        referrer_id: referrerId,
        title: dto.title,
        description: dto.description ?? null,
        project_type: dto.project_type ?? null,
        postcode_area: dto.postcode_area ?? null,
        estimated_value:
          dto.estimated_value != null
            ? new Prisma.Decimal(dto.estimated_value)
            : null,
        commission_pct:
          dto.commission_pct != null
            ? new Prisma.Decimal(dto.commission_pct)
            : null,
        platform_fee_pct: new Prisma.Decimal(dto.platform_fee_pct ?? 2),
        client_name: dto.client_name ?? null,
        client_phone: dto.client_phone ?? null,
        client_email: dto.client_email ?? null,
      },
    });
  }

  async getById(id: bigint, user: CurrentUserPayload) {
    await this.assertReferralAccess(id, user);
    return this.prisma.referral.findUniqueOrThrow({
      where: { id },
      include: { referral_offers: { orderBy: { created_at: 'desc' } } },
    });
  }

  async search(query: ReferralSearchDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ReferralWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.postcode_area) where.postcode_area = query.postcode_area;
    if (query.project_type) where.project_type = query.project_type;

    const [items, total] = await Promise.all([
      this.prisma.referral.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.referral.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async getByReferrer(referrerId: bigint, query: ReferralSearchDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ReferralWhereInput = { referrer_id: referrerId };
    if (query.status) where.status = query.status;
    if (query.postcode_area) where.postcode_area = query.postcode_area;
    if (query.project_type) where.project_type = query.project_type;

    const [items, total] = await Promise.all([
      this.prisma.referral.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { referral_offers: true },
      }),
      this.prisma.referral.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async update(id: bigint, referrerId: bigint, dto: UpdateReferralDto) {
    const referral = await this.prisma.referral.findUnique({ where: { id } });
    if (!referral) throw new NotFoundException('Referral not found');
    if (referral.referrer_id !== referrerId) {
      throw new ForbiddenException('Not your referral');
    }
    if (referral.status !== 'OPEN') {
      throw new BadRequestException('Only open referrals can be updated');
    }

    const data: Prisma.ReferralUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.project_type !== undefined) data.project_type = dto.project_type;
    if (dto.postcode_area !== undefined) data.postcode_area = dto.postcode_area;
    if (dto.estimated_value !== undefined) {
      data.estimated_value =
        dto.estimated_value != null
          ? new Prisma.Decimal(dto.estimated_value)
          : null;
    }
    if (dto.commission_pct !== undefined) {
      data.commission_pct =
        dto.commission_pct != null
          ? new Prisma.Decimal(dto.commission_pct)
          : null;
    }
    if (dto.platform_fee_pct !== undefined) {
      data.platform_fee_pct = new Prisma.Decimal(dto.platform_fee_pct);
    }
    if (dto.client_name !== undefined) data.client_name = dto.client_name;
    if (dto.client_phone !== undefined) data.client_phone = dto.client_phone;
    if (dto.client_email !== undefined) data.client_email = dto.client_email;

    return this.prisma.referral.update({
      where: { id },
      data,
    });
  }

  async cancel(id: bigint, referrerId: bigint) {
    const referral = await this.prisma.referral.findUnique({ where: { id } });
    if (!referral) throw new NotFoundException('Referral not found');
    if (referral.referrer_id !== referrerId) {
      throw new ForbiddenException('Not your referral');
    }
    return this.prisma.referral.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async createOffer(
    referralId: bigint,
    referrerId: bigint,
    dto: CreateReferralOfferDto,
  ) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
    });
    if (!referral) throw new NotFoundException('Referral not found');
    if (referral.referrer_id !== referrerId) {
      throw new ForbiddenException('Only the referrer can send offers');
    }
    if (referral.status !== 'OPEN') {
      throw new BadRequestException('Referral is not open for offers');
    }

    const recipientId = BigInt(dto.recipient_id);
    if (recipientId === referrerId) {
      throw new BadRequestException('Cannot send an offer to yourself');
    }

    const worker = await this.prisma.workerProfile.findUnique({
      where: { id: recipientId },
    });
    if (!worker) throw new NotFoundException('Worker profile not found');

    try {
      return await this.prisma.referralOffer.create({
        data: {
          referral_id: referralId,
          recipient_id: recipientId,
          message: dto.message ?? null,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Offer already exists for this worker');
      }
      throw e;
    }
  }

  async respondToOffer(
    offerId: bigint,
    recipientId: bigint,
    dto: RespondToOfferDto,
  ) {
    const offer = await this.prisma.referralOffer.findUnique({
      where: { id: offerId },
      include: { referral: true },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.recipient_id !== recipientId) {
      throw new ForbiddenException('Not your offer');
    }
    if (offer.status !== 'PENDING') {
      throw new BadRequestException('Offer is no longer pending');
    }

    if (!dto.accept) {
      return this.prisma.referralOffer.update({
        where: { id: offerId },
        data: { status: 'DECLINED', responded_at: new Date() },
      });
    }

    const referrer = await this.prisma.clientProfile.findUnique({
      where: { id: offer.referral.referrer_id },
      include: { employer_profile: true },
    });
    if (!referrer?.employer_profile) {
      throw new BadRequestException(
        'Referrer must have an employer profile to start a collaboration',
      );
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.referralOffer.update({
        where: { id: offerId },
        data: { status: 'ACCEPTED', responded_at: new Date() },
      }),
      this.prisma.collaboration.create({
        data: {
          worker_id: offer.recipient_id,
          employer_id: referrer.employer_profile.id,
          initiated_by: 'WORKER',
          referral_id: offer.referral_id,
          status: 'PENDING',
          project_type: offer.referral.project_type,
          site_postcode: offer.referral.postcode_area,
          agreed_amount: offer.referral.estimated_value,
        },
      }),
    ]);

    return updated;
  }

  async getOffersForWorker(workerId: bigint, query: ReferralSearchDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ReferralOfferWhereInput = { recipient_id: workerId };
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.referralOffer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { referral: true },
      }),
      this.prisma.referralOffer.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  private async assertReferralAccess(
    id: bigint,
    user: CurrentUserPayload,
  ): Promise<void> {
    const referral = await this.prisma.referral.findUnique({
      where: { id },
    });
    if (!referral) throw new NotFoundException('Referral not found');
    if (user.isStaff) return;
    const cp = user.clientProfileId;
    if (cp != null && referral.referrer_id === cp) return;
    if (user.isWorker && cp != null) {
      const hasOffer = await this.prisma.referralOffer.findFirst({
        where: { referral_id: id, recipient_id: cp },
      });
      if (hasOffer) return;
    }
    throw new ForbiddenException('Cannot access this referral');
  }
}
