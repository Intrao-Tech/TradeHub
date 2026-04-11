import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { SubscriptionPlansQueryDto } from './dto/subscription-plans-query.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlans(query?: SubscriptionPlansQueryDto) {
    const activeOnly = query?.active_only === true;
    return this.prisma.subscriptionPlan.findMany({
      where: activeOnly ? { is_active: true } : {},
      orderBy: { id: 'asc' },
    });
  }

  async createPlan(dto: CreatePlanDto) {
    return this.prisma.subscriptionPlan.create({
      data: {
        name: dto.name,
        price_monthly: new Prisma.Decimal(dto.price_monthly),
        price_yearly:
          dto.price_yearly != null
            ? new Prisma.Decimal(dto.price_yearly)
            : null,
        max_referrals: dto.max_referrals ?? null,
        features: (dto.features ?? {}) as Prisma.InputJsonValue,
        is_active: dto.is_active ?? false,
      },
    });
  }

  async updatePlan(id: number, dto: UpdatePlanDto) {
    const data: Prisma.SubscriptionPlanUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.price_monthly !== undefined) {
      data.price_monthly = new Prisma.Decimal(dto.price_monthly);
    }
    if (dto.price_yearly !== undefined) {
      data.price_yearly =
        dto.price_yearly != null
          ? new Prisma.Decimal(dto.price_yearly)
          : null;
    }
    if (dto.max_referrals !== undefined) {
      data.max_referrals = dto.max_referrals;
    }
    if (dto.features !== undefined) {
      data.features = dto.features as Prisma.InputJsonValue;
    }
    if (dto.is_active !== undefined) data.is_active = dto.is_active;

    try {
      return await this.prisma.subscriptionPlan.update({
        where: { id },
        data,
      });
    } catch {
      throw new NotFoundException('Subscription plan not found');
    }
  }

  async subscribe(clientProfileId: bigint, planId: number) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.userSubscription.updateMany({
        where: {
          client_profile_id: clientProfileId,
          is_current: true,
        },
        data: { is_current: false },
      });

      return tx.userSubscription.create({
        data: {
          client_profile_id: clientProfileId,
          plan_id: planId,
          status: 'active',
          is_current: true,
        },
        include: { plan: true },
      });
    });
  }

  async getCurrentSubscription(clientProfileId: bigint) {
    return this.prisma.userSubscription.findFirst({
      where: {
        client_profile_id: clientProfileId,
        is_current: true,
      },
      include: { plan: true },
    });
  }

  async cancelSubscription(subscriptionId: bigint, clientProfileId: bigint) {
    const existing = await this.prisma.userSubscription.findFirst({
      where: {
        id: subscriptionId,
        client_profile_id: clientProfileId,
      },
    });
    if (!existing) {
      throw new NotFoundException('Subscription not found');
    }

    return this.prisma.userSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'cancelled',
        is_current: false,
      },
      include: { plan: true },
    });
  }
}
