import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecialisationDto } from './dto/create-specialisation.dto';
import { UpdateSpecialisationDto } from './dto/update-specialisation.dto';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class SpecialisationService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.specialisation.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateSpecialisationDto) {
    const baseSlug = slugify(dto.name);
    let slug = baseSlug;
    let n = 0;
    while (
      await this.prisma.specialisation.findUnique({ where: { slug } })
    ) {
      n += 1;
      slug = `${baseSlug}-${n}`;
    }

    return this.prisma.specialisation.create({
      data: {
        name: dto.name.trim(),
        slug,
      },
    });
  }

  async update(id: number, dto: UpdateSpecialisationDto) {
    const existing = await this.prisma.specialisation.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Specialisation not found');

    if (dto.name === undefined) {
      throw new BadRequestException('No fields to update');
    }

    const name = dto.name.trim();
    let slug: string | undefined;
    if (name !== existing.name) {
      const baseSlug = slugify(name);
      slug = baseSlug;
      let suffix = 0;
      while (true) {
        const clash = await this.prisma.specialisation.findFirst({
          where: { slug, NOT: { id } },
        });
        if (!clash) break;
        suffix += 1;
        slug = `${baseSlug}-${suffix}`;
      }
    }

    return this.prisma.specialisation.update({
      where: { id },
      data: {
        name,
        ...(slug !== undefined ? { slug } : {}),
      },
    });
  }

  async delete(id: number) {
    const result = await this.prisma.specialisation.deleteMany({
      where: { id },
    });
    if (result.count === 0)
      throw new NotFoundException('Specialisation not found');
  }

  async getWorkersBySpecialisation(
    specId: number,
    page: number,
    limit: number,
  ) {
    const spec = await this.prisma.specialisation.findUnique({
      where: { id: specId },
    });
    if (!spec) throw new NotFoundException('Specialisation not found');

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.workerSpecialisation.count({
        where: { specialisation_id: specId },
      }),
      this.prisma.workerSpecialisation.findMany({
        where: { specialisation_id: specId },
        skip,
        take: safeLimit,
        include: {
          worker_profile: {
            include: {
              client_profile: true,
            },
          },
        },
        orderBy: [{ is_primary: 'desc' }, { worker_id: 'asc' }],
      }),
    ]);

    return {
      items: rows,
      total,
      page: safePage,
      limit: safeLimit,
    };
  }
}
