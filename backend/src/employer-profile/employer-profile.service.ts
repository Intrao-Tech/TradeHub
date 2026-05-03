import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmployerSearchQueryDto } from './dto/employer-search-query.dto';
import { UpdateEmployerProfileDto } from './dto/update-employer-profile.dto';

@Injectable()
export class EmployerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: bigint) {
    const profile = await this.prisma.employerProfile.findUnique({
      where: { id },
      include: { client_profile: true },
    });
    if (!profile) throw new NotFoundException('Employer profile not found');
    return profile;
  }

  async update(id: bigint, dto: UpdateEmployerProfileDto) {
    const data: Prisma.EmployerProfileUpdateInput = {};
    if (dto.company_name !== undefined) data.company_name = dto.company_name;
    if (dto.company_number !== undefined)
      data.company_number = dto.company_number;
    if (dto.team_size !== undefined) data.team_size = dto.team_size;

    try {
      return await this.prisma.employerProfile.update({
        where: { id },
        data,
        include: { client_profile: true },
      });
    } catch {
      throw new NotFoundException('Employer profile not found');
    }
  }

  async search(query: EmployerSearchQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployerProfileWhereInput = {
      ...(query.company_number != null && query.company_number !== ''
        ? { company_number: query.company_number }
        : {}),
      ...(query.search != null && query.search !== ''
        ? {
            company_name: {
              contains: query.search,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.employerProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ rating_avg: 'desc' }, { rating_count: 'desc' }],
        include: { client_profile: true },
      }),
      this.prisma.employerProfile.count({ where }),
    ]);

    return { data: items, total, page, limit };
  }
}
