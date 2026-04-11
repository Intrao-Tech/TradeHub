import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class TagService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateTagDto) {
    const baseSlug = slugify(dto.name);
    let slug = baseSlug;
    let n = 0;
    while (await this.prisma.tag.findUnique({ where: { slug } })) {
      n += 1;
      slug = `${baseSlug}-${n}`;
    }

    return this.prisma.tag.create({
      data: {
        name: dto.name.trim(),
        slug,
      },
    });
  }

  async update(id: number, dto: UpdateTagDto) {
    const existing = await this.prisma.tag.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Tag not found');

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
        const clash = await this.prisma.tag.findFirst({
          where: { slug, NOT: { id } },
        });
        if (!clash) break;
        suffix += 1;
        slug = `${baseSlug}-${suffix}`;
      }
    }

    return this.prisma.tag.update({
      where: { id },
      data: {
        name,
        ...(slug !== undefined ? { slug } : {}),
      },
    });
  }

  async delete(id: number) {
    const result = await this.prisma.tag.deleteMany({
      where: { id },
    });
    if (result.count === 0) throw new NotFoundException('Tag not found');
  }
}
