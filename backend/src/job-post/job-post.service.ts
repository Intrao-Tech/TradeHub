import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobPostDto } from './dto/create-job-post.dto';
import { JobPostQueryDto } from './dto/job-post-query.dto';
import { UpdateJobPostDto } from './dto/update-job-post.dto';

const jobPostInclude = {
  employer: { include: { client_profile: true } },
  specialisations: { include: { specialisation: true } },
  tags: { include: { tag: true } },
  attachments: { orderBy: { created_at: 'asc' } },
  _count: { select: { applications: true } },
} satisfies Prisma.JobPostInclude;

@Injectable()
export class JobPostService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateJobPostDto, employerId: bigint) {
    const created = await this.prisma.jobPost.create({
      data: {
        employer_id: employerId,
        title: dto.title,
        description: dto.description ?? null,
        postcode_area: dto.postcode_area ?? null,
        site_address: dto.site_address ?? null,
        pay_type: dto.pay_type,
        day_rate_min:
          dto.day_rate_min != null
            ? new Prisma.Decimal(dto.day_rate_min)
            : null,
        day_rate_max:
          dto.day_rate_max != null
            ? new Prisma.Decimal(dto.day_rate_max)
            : null,
        fixed_price:
          dto.fixed_price != null ? new Prisma.Decimal(dto.fixed_price) : null,
        duration_days: dto.duration_days ?? null,
        start_date: dto.start_date != null ? new Date(dto.start_date) : null,
        is_urgent: dto.is_urgent ?? false,
        expires_at: dto.expires_at != null ? new Date(dto.expires_at) : null,
        specialisations: {
          create:
            dto.specialisation_ids?.map((id) => ({
              specialisation_id: id,
            })) ?? [],
        },
        tags: {
          create:
            dto.tag_ids?.map((id) => ({
              tag_id: id,
            })) ?? [],
        },
      },
      include: jobPostInclude,
    });

    if (dto.attachment_ids && dto.attachment_ids.length > 0) {
      await attachOrphansToJobPost(
        this.prisma,
        dto.attachment_ids,
        created.id,
        employerId,
      );
      return this.prisma.jobPost.findUniqueOrThrow({
        where: { id: created.id },
        include: jobPostInclude,
      });
    }

    return created;
  }

  async findAll(query: JobPostQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // JOBS-002: anonymous browse defaults to OPEN. Callers that genuinely
    // want CLOSED / FILLED / CANCELLED rows must opt in by setting `status`
    // explicitly (any value, including the literal string "ALL", which the
    // service treats as "no status filter").
    const effectiveQuery: JobPostQueryDto =
      query.status == null ? { ...query, status: 'OPEN' } : query;
    const where = this.buildWhere(effectiveQuery);

    const [items, total] = await Promise.all([
      this.prisma.jobPost.findMany({
        where,
        include: jobPostInclude,
        orderBy: [{ is_urgent: 'desc' }, { created_at: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.jobPost.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: bigint) {
    const row = await this.prisma.jobPost.findUnique({
      where: { id },
      include: jobPostInclude,
    });
    if (!row) throw new NotFoundException('Job post not found');
    return row;
  }

  async findMyPosts(employerId: bigint, query: JobPostQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.JobPostWhereInput = {
      employer_id: employerId,
      ...this.buildWhere(query),
    };

    const [items, total] = await Promise.all([
      this.prisma.jobPost.findMany({
        where,
        include: jobPostInclude,
        orderBy: [{ is_urgent: 'desc' }, { created_at: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.jobPost.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async update(id: bigint, dto: UpdateJobPostDto, employerId: bigint) {
    const existing = await this.prisma.jobPost.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Job post not found');
    if (existing.employer_id !== employerId) {
      throw new ForbiddenException('Only the owner can update this job post');
    }

    const data = this.buildUpdateData(dto);

    await this.prisma.$transaction(async (tx) => {
      if (dto.specialisation_ids !== undefined) {
        await tx.jobPostSpecialisation.deleteMany({
          where: { job_post_id: id },
        });
        if (dto.specialisation_ids.length > 0) {
          await tx.jobPostSpecialisation.createMany({
            data: dto.specialisation_ids.map((sid) => ({
              job_post_id: id,
              specialisation_id: sid,
            })),
          });
        }
      }

      if (dto.tag_ids !== undefined) {
        await tx.jobPostTag.deleteMany({ where: { job_post_id: id } });
        if (dto.tag_ids.length > 0) {
          await tx.jobPostTag.createMany({
            data: dto.tag_ids.map((tid) => ({
              job_post_id: id,
              tag_id: tid,
            })),
          });
        }
      }

      if (dto.attachment_ids !== undefined) {
        const keepIds = dto.attachment_ids.map(BigInt);
        // Detach rows currently attached to this post but not in the new list.
        await tx.jobAttachment.updateMany({
          where: {
            job_post_id: id,
            ...(keepIds.length > 0 ? { id: { notIn: keepIds } } : {}),
          },
          data: { job_post_id: null },
        });
        // Attach any new orphans owned by the caller.
        if (keepIds.length > 0) {
          await attachOrphansToJobPost(tx, dto.attachment_ids, id, employerId, {
            allowAlreadyAttached: true,
          });
        }
      }

      if (Object.keys(data).length > 0) {
        await tx.jobPost.update({
          where: { id },
          data,
        });
      }
    });

    return this.findById(id);
  }

  async delete(id: bigint, employerId: bigint) {
    const existing = await this.prisma.jobPost.findUnique({
      where: { id },
      include: { _count: { select: { applications: true } } },
    });
    if (!existing) throw new NotFoundException('Job post not found');
    if (existing.employer_id !== employerId) {
      throw new ForbiddenException('Only the owner can delete this job post');
    }
    if (existing._count.applications > 0) {
      throw new ConflictException({
        code: 'HAS_APPLICATIONS',
        message: 'Close this job instead — applicants would lose their record.',
      });
    }

    await this.prisma.jobPost.delete({ where: { id } });
  }

  private buildWhere(query: JobPostQueryDto): Prisma.JobPostWhereInput {
    const search =
      query.search != null && query.search.trim() !== ''
        ? query.search.trim()
        : null;

    // `status: 'ALL'` is the explicit opt-out for anonymous + employer
    // dashboards that need to see every status.
    const status =
      query.status != null && query.status.toUpperCase() !== 'ALL'
        ? query.status
        : null;
    return {
      ...(status != null ? { status } : {}),
      ...(query.postcode_area != null
        ? { postcode_area: query.postcode_area }
        : {}),
      ...(query.specialisation_id != null
        ? {
            specialisations: {
              some: { specialisation_id: query.specialisation_id },
            },
          }
        : {}),
      ...(query.tag_id != null
        ? { tags: { some: { tag_id: query.tag_id } } }
        : {}),
      ...(search != null
        ? {
            title: { contains: search, mode: 'insensitive' },
          }
        : {}),
      ...(query.is_urgent === 'true'
        ? { is_urgent: true }
        : query.is_urgent === 'false'
          ? { is_urgent: false }
          : {}),
    };
  }

  private buildUpdateData(dto: UpdateJobPostDto): Prisma.JobPostUpdateInput {
    const data: Prisma.JobPostUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) {
      data.description = dto.description;
    }
    if (dto.postcode_area !== undefined) {
      data.postcode_area = dto.postcode_area;
    }
    if (dto.site_address !== undefined) {
      data.site_address = dto.site_address;
    }
    if (dto.pay_type !== undefined) data.pay_type = dto.pay_type;
    if (dto.day_rate_min !== undefined) {
      data.day_rate_min =
        dto.day_rate_min != null ? new Prisma.Decimal(dto.day_rate_min) : null;
    }
    if (dto.day_rate_max !== undefined) {
      data.day_rate_max =
        dto.day_rate_max != null ? new Prisma.Decimal(dto.day_rate_max) : null;
    }
    if (dto.fixed_price !== undefined) {
      data.fixed_price =
        dto.fixed_price != null ? new Prisma.Decimal(dto.fixed_price) : null;
    }
    if (dto.duration_days !== undefined) {
      data.duration_days = dto.duration_days;
    }
    if (dto.start_date !== undefined) {
      data.start_date =
        dto.start_date != null ? new Date(dto.start_date) : null;
    }
    if (dto.is_urgent !== undefined) data.is_urgent = dto.is_urgent;
    if (dto.expires_at !== undefined) {
      data.expires_at =
        dto.expires_at != null ? new Date(dto.expires_at) : null;
    }
    if (dto.status !== undefined) data.status = dto.status;

    return data;
  }
}

/**
 * Wire orphan attachments to a job post. The caller must own each row
 * (uploaded_by_id matches employerId). Rows already attached to a different
 * parent or owned by someone else cause a NOT_OWNER error, which is the
 * defence against id-stealing.
 */
export async function attachOrphansToJobPost(
  tx: Prisma.TransactionClient,
  attachmentIds: number[],
  jobPostId: bigint,
  employerId: bigint,
  opts: { allowAlreadyAttached?: boolean } = {},
): Promise<void> {
  if (attachmentIds.length === 0) return;
  const ids = attachmentIds.map(BigInt);

  const updateWhere: Prisma.JobAttachmentWhereInput = {
    id: { in: ids },
    uploaded_by_id: employerId,
    job_application_id: null,
    ...(opts.allowAlreadyAttached
      ? { OR: [{ job_post_id: null }, { job_post_id: jobPostId }] }
      : { job_post_id: null }),
  };

  const result = await tx.jobAttachment.updateMany({
    where: updateWhere,
    data: { job_post_id: jobPostId },
  });

  if (result.count !== ids.length) {
    throw new ForbiddenException({
      code: 'NOT_OWNER',
      message:
        'One or more attachments could not be wired (not owned by you, or already attached elsewhere).',
    });
  }
}
