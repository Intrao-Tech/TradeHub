import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Express } from 'express';
import { promises as fs } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddPortfolioMediaDto,
  CreateCertificationDto,
  CreateExperienceDto,
  CreateProjectDto,
  UpdateCertificationDetailDto,
  UpdateExperienceDetailDto,
  UpdatePortfolioItemDto,
  UpdateProjectDetailDto,
  UploadPortfolioMediaDto,
} from './dto/portfolio.dto';

const UPLOAD_SUBDIR = 'uploads';

const portfolioItemInclude = {
  experience_detail: true,
  project_detail: true,
  certification_detail: true,
  portfolio_media: { orderBy: { sort_order: 'asc' as const } },
  portfolio_item_documents: { include: { document: true } },
} satisfies Prisma.PortfolioItemInclude;

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  getByWorker(workerId: bigint) {
    return this.prisma.portfolioItem.findMany({
      where: { worker_id: workerId },
      orderBy: { sort_order: 'asc' },
      include: portfolioItemInclude,
    });
  }

  async getById(id: bigint) {
    const item = await this.prisma.portfolioItem.findUnique({
      where: { id },
      include: portfolioItemInclude,
    });
    if (!item) throw new NotFoundException('Portfolio item not found');
    return item;
  }

  createExperience(workerId: bigint, dto: CreateExperienceDto) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.portfolioItem.create({
        data: {
          worker_id: workerId,
          item_type: 'EXPERIENCE',
          title: dto.title,
          description: dto.description ?? null,
        },
      });
      await tx.experienceDetail.create({
        data: {
          id: item.id,
          company_name: dto.company_name ?? null,
          role: dto.role ?? null,
          start_date: dto.start_date ? new Date(dto.start_date) : null,
          end_date: dto.end_date ? new Date(dto.end_date) : null,
        },
      });
      return this.getByIdWithClient(tx, item.id);
    });
  }

  createProject(workerId: bigint, dto: CreateProjectDto) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.portfolioItem.create({
        data: {
          worker_id: workerId,
          item_type: 'PROJECT',
          title: dto.title,
          description: dto.description ?? null,
        },
      });
      await tx.projectDetail.create({
        data: {
          id: item.id,
          project_type: dto.project_type ?? null,
          site_postcode: dto.site_postcode ?? null,
          completed_at: dto.completed_at ? new Date(dto.completed_at) : null,
          project_value:
            dto.project_value != null
              ? new Prisma.Decimal(dto.project_value)
              : null,
        },
      });
      return this.getByIdWithClient(tx, item.id);
    });
  }

  createCertification(workerId: bigint, dto: CreateCertificationDto) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.portfolioItem.create({
        data: {
          worker_id: workerId,
          item_type: 'CERTIFICATION',
          title: dto.title,
          description: dto.description ?? null,
        },
      });
      await tx.certificationDetail.create({
        data: {
          id: item.id,
          cert_type: dto.cert_type,
          cert_number: dto.cert_number ?? null,
          issuing_body: dto.issuing_body ?? null,
          issued_at: dto.issued_at ? new Date(dto.issued_at) : null,
          expires_at: dto.expires_at ? new Date(dto.expires_at) : null,
        },
      });
      return this.getByIdWithClient(tx, item.id);
    });
  }

  async update(id: bigint, workerId: bigint, dto: UpdatePortfolioItemDto) {
    await this.assertWorkerOwns(id, workerId);
    await this.prisma.portfolioItem.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        sort_order: dto.sort_order,
      },
    });
    return this.getById(id);
  }

  async updateExperienceDetail(
    id: bigint,
    workerId: bigint,
    dto: UpdateExperienceDetailDto,
  ) {
    const item = await this.assertWorkerOwns(id, workerId);
    if (item.item_type !== 'EXPERIENCE') {
      throw new ForbiddenException('Not an experience portfolio item');
    }
    await this.prisma.experienceDetail.update({
      where: { id },
      data: {
        company_name: dto.company_name,
        role: dto.role,
        start_date:
          dto.start_date === undefined
            ? undefined
            : dto.start_date
              ? new Date(dto.start_date)
              : null,
        end_date:
          dto.end_date === undefined
            ? undefined
            : dto.end_date
              ? new Date(dto.end_date)
              : null,
      },
    });
    return this.getById(id);
  }

  async updateProjectDetail(
    id: bigint,
    workerId: bigint,
    dto: UpdateProjectDetailDto,
  ) {
    const item = await this.assertWorkerOwns(id, workerId);
    if (item.item_type !== 'PROJECT') {
      throw new ForbiddenException('Not a project portfolio item');
    }
    await this.prisma.projectDetail.update({
      where: { id },
      data: {
        project_type: dto.project_type,
        site_postcode: dto.site_postcode,
        completed_at:
          dto.completed_at === undefined
            ? undefined
            : dto.completed_at
              ? new Date(dto.completed_at)
              : null,
        project_value:
          dto.project_value === undefined
            ? undefined
            : dto.project_value != null
              ? new Prisma.Decimal(dto.project_value)
              : null,
      },
    });
    return this.getById(id);
  }

  async updateCertificationDetail(
    id: bigint,
    workerId: bigint,
    dto: UpdateCertificationDetailDto,
  ) {
    const item = await this.assertWorkerOwns(id, workerId);
    if (item.item_type !== 'CERTIFICATION') {
      throw new ForbiddenException('Not a certification portfolio item');
    }
    await this.prisma.certificationDetail.update({
      where: { id },
      data: {
        cert_type: dto.cert_type,
        cert_number: dto.cert_number,
        issuing_body: dto.issuing_body,
        issued_at:
          dto.issued_at === undefined
            ? undefined
            : dto.issued_at
              ? new Date(dto.issued_at)
              : null,
        expires_at:
          dto.expires_at === undefined
            ? undefined
            : dto.expires_at
              ? new Date(dto.expires_at)
              : null,
      },
    });
    return this.getById(id);
  }

  async delete(id: bigint, workerId: bigint) {
    await this.assertWorkerOwns(id, workerId);
    await this.prisma.portfolioItem.delete({ where: { id } });
  }

  async addMedia(
    portfolioItemId: bigint,
    workerId: bigint,
    dto: AddPortfolioMediaDto,
  ) {
    await this.assertWorkerOwns(portfolioItemId, workerId);
    await this.prisma.portfolioMedia.create({
      data: {
        portfolio_item_id: portfolioItemId,
        media_url: dto.media_url,
        caption: dto.caption ?? null,
        sort_order: dto.sort_order ?? 0,
      },
    });
    return this.getById(portfolioItemId);
  }

  async uploadMedia(
    portfolioItemId: bigint,
    workerId: bigint,
    file: Express.Multer.File,
    dto: UploadPortfolioMediaDto,
  ) {
    try {
      await this.assertWorkerOwns(portfolioItemId, workerId);
    } catch (err) {
      await fs.unlink(file.path).catch(() => {});
      throw err;
    }
    const media_url = `/${UPLOAD_SUBDIR}/${file.filename}`;
    return this.prisma.portfolioMedia.create({
      data: {
        portfolio_item_id: portfolioItemId,
        media_url,
        caption: dto.caption ?? null,
        sort_order: dto.sort_order ?? 0,
      },
    });
  }

  async removeMedia(mediaId: bigint, workerId: bigint) {
    const media = await this.prisma.portfolioMedia.findUnique({
      where: { id: mediaId },
      include: { portfolio_item: true },
    });
    if (!media) throw new NotFoundException('Media not found');
    if (media.portfolio_item.worker_id !== workerId) {
      throw new ForbiddenException('Not your portfolio media');
    }
    await this.prisma.portfolioMedia.delete({ where: { id: mediaId } });
  }

  async linkDocument(
    portfolioItemId: bigint,
    documentId: bigint,
    workerId: bigint,
  ) {
    await this.assertWorkerOwns(portfolioItemId, workerId);
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.client_profile_id !== workerId) {
      throw new ForbiddenException('Document does not belong to this worker');
    }
    await this.prisma.portfolioItemDocument.upsert({
      where: {
        portfolio_item_id_document_id: {
          portfolio_item_id: portfolioItemId,
          document_id: documentId,
        },
      },
      create: {
        portfolio_item_id: portfolioItemId,
        document_id: documentId,
      },
      update: {},
    });
    return this.getById(portfolioItemId);
  }

  async unlinkDocument(
    portfolioItemId: bigint,
    documentId: bigint,
    workerId: bigint,
  ) {
    await this.assertWorkerOwns(portfolioItemId, workerId);
    const link = await this.prisma.portfolioItemDocument.findUnique({
      where: {
        portfolio_item_id_document_id: {
          portfolio_item_id: portfolioItemId,
          document_id: documentId,
        },
      },
    });
    if (!link) throw new NotFoundException('Link not found');
    await this.prisma.portfolioItemDocument.delete({
      where: {
        portfolio_item_id_document_id: {
          portfolio_item_id: portfolioItemId,
          document_id: documentId,
        },
      },
    });
    return this.getById(portfolioItemId);
  }

  private async assertWorkerOwns(id: bigint, workerId: bigint) {
    const item = await this.prisma.portfolioItem.findUnique({
      where: { id },
    });
    if (!item) throw new NotFoundException('Portfolio item not found');
    if (item.worker_id !== workerId) {
      throw new ForbiddenException('Not your portfolio item');
    }
    return item;
  }

  private getByIdWithClient(tx: Prisma.TransactionClient, id: bigint) {
    return tx.portfolioItem.findUniqueOrThrow({
      where: { id },
      include: portfolioItemInclude,
    });
  }
}
