import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClientProfileQueryDto } from './dto/client-profile-query.dto';
import { UpdateClientProfileDto } from './dto/update-client-profile.dto';

@Injectable()
export class ClientProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getBySlug(slug: string) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { slug },
    });
    if (!profile) throw new NotFoundException('Client profile not found');
    return profile;
  }

  async getById(id: bigint) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { id },
    });
    if (!profile) throw new NotFoundException('Client profile not found');
    return profile;
  }

  async update(id: bigint, dto: UpdateClientProfileDto) {
    const data: Prisma.ClientProfileUpdateInput = {};
    if (dto.display_name !== undefined) data.display_name = dto.display_name;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.postcode_area !== undefined) data.postcode_area = dto.postcode_area;
    if (dto.avatar_url !== undefined) data.avatar_url = dto.avatar_url;

    try {
      return await this.prisma.clientProfile.update({
        where: { id },
        data,
      });
    } catch {
      throw new NotFoundException('Client profile not found');
    }
  }

  async search(query: ClientProfileQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ClientProfileWhereInput = {
      ...(query.postcode_area != null && query.postcode_area !== ''
        ? { postcode_area: query.postcode_area }
        : {}),
      ...(query.verification_level != null && query.verification_level !== ''
        ? { verification_level: query.verification_level }
        : {}),
      ...(query.search != null && query.search !== ''
        ? {
            display_name: {
              contains: query.search,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.clientProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { display_name: 'asc' },
      }),
      this.prisma.clientProfile.count({ where }),
    ]);

    return { data: items, total, page, limit };
  }
}
