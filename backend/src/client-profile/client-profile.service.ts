import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Express } from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { ClientProfileQueryDto } from './dto/client-profile-query.dto';
import { UpdateClientProfileDto } from './dto/update-client-profile.dto';

const UPLOAD_SUBDIR = 'uploads';
const AVATAR_MIN_PX = 256;

@Injectable()
export class ClientProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getBySlug(slug: string) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { slug },
      include: { account: { select: { status: true } } },
    });
    if (!profile || profile.account.status !== 'ACTIVE') {
      throw new NotFoundException('Client profile not found');
    }
    const { account: _account, ...rest } = profile;
    return rest;
  }

  async getById(id: bigint) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { id },
      include: { account: { select: { status: true } } },
    });
    if (!profile || profile.account.status !== 'ACTIVE') {
      throw new NotFoundException('Client profile not found');
    }
    const { account: _account, ...rest } = profile;
    return rest;
  }

  async updateAvatar(id: bigint, file: Express.Multer.File) {
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(file.path).metadata();
    } catch {
      await fs.unlink(file.path).catch(() => {});
      throw new BadRequestException({
        code: 'INVALID_IMAGE',
        message: 'Could not read image — file may be corrupted.',
      });
    }
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width < AVATAR_MIN_PX || height < AVATAR_MIN_PX) {
      await fs.unlink(file.path).catch(() => {});
      throw new BadRequestException({
        code: 'IMAGE_TOO_SMALL',
        message: `Avatar must be at least ${AVATAR_MIN_PX}×${AVATAR_MIN_PX} px.`,
      });
    }

    const profile = await this.prisma.clientProfile.findUnique({
      where: { id },
    });
    if (!profile) {
      await fs.unlink(file.path).catch(() => {});
      throw new NotFoundException('Client profile not found');
    }

    const newUrl = `/${UPLOAD_SUBDIR}/${file.filename}`;
    await this.prisma.clientProfile.update({
      where: { id },
      data: { avatar_url: newUrl },
    });

    // Best-effort delete of the prior local avatar.
    if (profile.avatar_url?.startsWith(`/${UPLOAD_SUBDIR}/`)) {
      const priorPath = join(process.cwd(), profile.avatar_url.slice(1));
      await fs.unlink(priorPath).catch(() => {});
    }

    return { avatar_url: newUrl };
  }

  async update(id: bigint, dto: UpdateClientProfileDto) {
    const data: Prisma.ClientProfileUpdateInput = {};
    if (dto.display_name !== undefined) data.display_name = dto.display_name;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.postcode_area !== undefined)
      data.postcode_area = dto.postcode_area.toUpperCase();
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
