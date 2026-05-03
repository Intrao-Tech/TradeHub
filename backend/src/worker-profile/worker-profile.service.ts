import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateWorkerProfileDto } from './dto/update-worker-profile.dto';
import { WorkerSearchQueryDto } from './dto/worker-search-query.dto';

@Injectable()
export class WorkerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: bigint) {
    const profile = await this.prisma.workerProfile.findUnique({
      where: { id },
      include: {
        client_profile: true,
        worker_specialisations: { include: { specialisation: true } },
        portfolio_items: true,
      },
    });
    if (!profile) throw new NotFoundException('Worker profile not found');
    return profile;
  }

  async linkSpecialisation(
    workerId: bigint,
    specialisationId: number,
    isPrimary: boolean,
  ) {
    return this.prisma.workerSpecialisation.upsert({
      where: {
        worker_id_specialisation_id: {
          worker_id: workerId,
          specialisation_id: specialisationId,
        },
      },
      create: {
        worker_id: workerId,
        specialisation_id: specialisationId,
        is_primary: isPrimary,
      },
      update: { is_primary: isPrimary },
    });
  }

  async unlinkSpecialisation(workerId: bigint, specialisationId: number) {
    await this.prisma.workerSpecialisation.deleteMany({
      where: {
        worker_id: workerId,
        specialisation_id: specialisationId,
      },
    });
  }

  async update(id: bigint, dto: UpdateWorkerProfileDto) {
    const data: Prisma.WorkerProfileUpdateInput = {};
    if (dto.years_experience !== undefined)
      data.years_experience = dto.years_experience;
    if (dto.day_rate_min !== undefined)
      data.day_rate_min = new Prisma.Decimal(dto.day_rate_min);
    if (dto.day_rate_max !== undefined)
      data.day_rate_max = new Prisma.Decimal(dto.day_rate_max);
    if (dto.available_from !== undefined)
      data.available_from = dto.available_from;
    if (dto.is_available !== undefined) data.is_available = dto.is_available;

    try {
      return await this.prisma.workerProfile.update({
        where: { id },
        data,
        include: {
          worker_specialisations: { include: { specialisation: true } },
          portfolio_items: true,
        },
      });
    } catch {
      throw new NotFoundException('Worker profile not found');
    }
  }

  async search(query: WorkerSearchQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const rateFilters: Prisma.WorkerProfileWhereInput[] = [];
    if (query.day_rate_min !== undefined) {
      rateFilters.push({
        OR: [
          { day_rate_max: null },
          { day_rate_max: { gte: query.day_rate_min } },
        ],
      });
    }
    if (query.day_rate_max !== undefined) {
      rateFilters.push({
        OR: [
          { day_rate_min: null },
          { day_rate_min: { lte: query.day_rate_max } },
        ],
      });
    }

    const where: Prisma.WorkerProfileWhereInput = {
      ...(query.is_available !== undefined
        ? { is_available: query.is_available }
        : {}),
      ...(query.min_rating !== undefined
        ? { rating_avg: { gte: new Prisma.Decimal(query.min_rating) } }
        : {}),
      ...(query.postcode_area != null && query.postcode_area !== ''
        ? { client_profile: { postcode_area: query.postcode_area } }
        : {}),
      ...(query.specialisation_id !== undefined
        ? {
            worker_specialisations: {
              some: { specialisation_id: query.specialisation_id },
            },
          }
        : {}),
      ...(rateFilters.length ? { AND: rateFilters } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.workerProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ rating_avg: 'desc' }, { rating_count: 'desc' }],
        include: {
          worker_specialisations: { include: { specialisation: true } },
          portfolio_items: true,
          client_profile: true,
        },
      }),
      this.prisma.workerProfile.count({ where }),
    ]);

    return { data: items, total, page, limit };
  }
}
