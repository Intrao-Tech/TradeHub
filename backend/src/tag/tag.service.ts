import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    const name = dto.name.trim();
    const existing = await this.prisma.tag.findUnique({ where: { name } });
    if (existing) {
      throw new ConflictException({
        code: 'TAG_EXISTS',
        message: `A tag named "${name}" already exists.`,
      });
    }
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let n = 0;
    while (await this.prisma.tag.findUnique({ where: { slug } })) {
      n += 1;
      slug = `${baseSlug}-${n}`;
    }

    try {
      return await this.prisma.tag.create({
        data: { name, slug },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'TAG_EXISTS',
          message: `A tag named "${name}" already exists.`,
        });
      }
      throw err;
    }
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
