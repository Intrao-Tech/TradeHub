import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type { Express } from 'express';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

const UPLOAD_SUBDIR = 'uploads';

@Injectable()
export class DocumentService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const dir = join(process.cwd(), UPLOAD_SUBDIR);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  async upload(
    clientProfileId: bigint,
    dto: UploadDocumentDto,
    file: Express.Multer.File | undefined,
  ) {
    if (!file?.filename) {
      throw new BadRequestException('File is required');
    }

    const file_url = `/${UPLOAD_SUBDIR}/${file.filename}`;

    return this.prisma.document.create({
      data: {
        client_profile_id: clientProfileId,
        doc_type: dto.doc_type,
        file_url,
        status: 'PENDING',
      },
    });
  }

  getByClientProfile(clientProfileId: bigint) {
    return this.prisma.document.findMany({
      where: { client_profile_id: clientProfileId },
      orderBy: { created_at: 'desc' },
    });
  }

  async getById(id: bigint) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async getByIdForRequester(
    id: bigint,
    clientProfileId: bigint | null,
    isStaff: boolean,
  ) {
    const doc = await this.getById(id);
    const isOwner = clientProfileId !== null && doc.client_profile_id === clientProfileId;
    if (!isOwner && !isStaff) {
      throw new ForbiddenException('Cannot access this document');
    }
    return doc;
  }

  private async ensureModerationItem(documentId: bigint) {
    const existing = await this.prisma.moderationItem.findFirst({
      where: { document_id: documentId },
    });
    if (existing) return existing;

    return this.prisma.moderationItem.create({
      data: {
        document_id: documentId,
        entity_type: 'DOCUMENT',
        entity_id: documentId,
        queue_type: 'DOCUMENT',
      },
    });
  }

  async updateStatus(
    id: bigint,
    status: string,
    _staffMemberId: bigint,
  ) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');

    if (status === 'IN_REVIEW' && doc.status !== 'PENDING') {
      throw new BadRequestException(
        'Can only move to IN_REVIEW from PENDING',
      );
    }
    if (
      (status === 'APPROVED' || status === 'REJECTED') &&
      doc.status !== 'IN_REVIEW'
    ) {
      throw new BadRequestException(
        'Can only approve or reject from IN_REVIEW',
      );
    }

    await this.ensureModerationItem(id);

    return this.prisma.document.update({
      where: { id },
      data: {
        status,
        reviewed_at: new Date(),
      },
    });
  }

  async deleteDocument(id: bigint, clientProfileId: bigint) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.client_profile_id !== clientProfileId) {
      throw new ForbiddenException('Cannot delete this document');
    }
    if (doc.status !== 'PENDING') {
      throw new BadRequestException(
        'Only documents in PENDING status can be deleted',
      );
    }
    await this.prisma.document.delete({ where: { id } });
  }
}
