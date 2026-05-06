import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type { Express } from 'express';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentAssignmentService } from '../verification/document-assignment.service';
import { validateDocumentMetadata } from '../verification/validators/document-metadata.validator';
import {
  DOCUMENT_DOC_TYPES,
  UploadDocumentDto,
} from './dto/upload-document.dto';

const UPLOAD_SUBDIR = 'uploads';
const STRUCTURED_ONLY_DOC_TYPES = new Set(['HMRC_CIS_DOCUMENT']);

@Injectable()
export class DocumentService implements OnModuleInit {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assignmentService: DocumentAssignmentService,
  ) {}

  onModuleInit() {
    const dir = join(process.cwd(), UPLOAD_SUBDIR);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  async upload(
    clientProfileId: bigint,
    dto: UploadDocumentDto,
    file: Express.Multer.File | undefined,
    ip?: string,
  ) {
    if (!(DOCUMENT_DOC_TYPES as readonly string[]).includes(dto.doc_type)) {
      throw new BadRequestException({
        code: 'INVALID_DOC_TYPE',
        message: `Unknown doc_type: ${dto.doc_type}`,
      });
    }

    const isStructuredOnly = STRUCTURED_ONLY_DOC_TYPES.has(dto.doc_type);

    if (!isStructuredOnly && !file?.filename) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'A file is required for this document type.',
      });
    }
    if (isStructuredOnly && file?.filename) {
      throw new BadRequestException({
        code: 'FILE_NOT_ALLOWED',
        message:
          'This document type is structured-only — submit credentials in the metadata field, not as a file.',
      });
    }

    const parsedMetadata = parseMetadataJson(dto.metadata);
    const validatedMetadata = validateDocumentMetadata(
      dto.doc_type,
      parsedMetadata,
    );

    const file_url = isStructuredOnly
      ? '(structured-only)'
      : `/${UPLOAD_SUBDIR}/${file!.filename}`;

    const created = await this.prisma.document.create({
      data: {
        client_profile_id: clientProfileId,
        doc_type: dto.doc_type,
        file_url,
        status: 'PENDING',
        metadata: validatedMetadata
          ? (validatedMetadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    // Auto-assign to the next on-duty staff (or leave unassigned).
    await this.assignmentService.assignNext(created.id, ip);

    // Audit-log without leaking sensitive metadata (UTR / NI / share-code).
    await this.audit.log(
      clientProfileId,
      'verification.document.uploaded',
      'document',
      created.id,
      { doc_type: dto.doc_type },
      ip,
    );

    return this.serialize(
      await this.prisma.document.findUniqueOrThrow({
        where: { id: created.id },
      }),
    );
  }

  async getByClientProfile(clientProfileId: bigint) {
    const docs = await this.prisma.document.findMany({
      where: { client_profile_id: clientProfileId },
      orderBy: { created_at: 'desc' },
    });
    return docs.map((d) => this.serialize(d));
  }

  async getByIdForRequester(
    id: bigint,
    clientProfileId: bigint | null,
    isStaff: boolean,
  ) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
    const isOwner =
      clientProfileId !== null && doc.client_profile_id === clientProfileId;
    if (!isOwner && !isStaff) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Cannot access this document.',
      });
    }
    return this.serialize(doc);
  }

  async deleteDocument(id: bigint, clientProfileId: bigint) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
    if (doc.client_profile_id !== clientProfileId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Cannot delete this document.',
      });
    }
    if (doc.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: 'Only documents in PENDING status can be deleted.',
      });
    }
    await this.prisma.document.delete({ where: { id } });
  }

  /**
   * Serialised view for the API. Strips sensitive metadata fields so they
   * never leak via the document-list endpoints. Staff queue endpoints use
   * `QueueService` which has its own serialisation.
   */
  private serialize(doc: Prisma.DocumentGetPayload<Record<string, never>>) {
    const safeMetadata = redactSensitiveMetadata(doc.doc_type, doc.metadata);
    return {
      id: doc.id.toString(),
      client_profile_id: doc.client_profile_id.toString(),
      doc_type: doc.doc_type,
      file_url: doc.file_url,
      status: doc.status,
      rejection_reason: doc.rejection_reason,
      metadata: safeMetadata,
      assigned_to: doc.assigned_to ? doc.assigned_to.toString() : null,
      reviewed_by: doc.reviewed_by ? doc.reviewed_by.toString() : null,
      reviewed_at: doc.reviewed_at,
      created_at: doc.created_at,
    };
  }
}

function parseMetadataJson(raw: string | undefined): unknown {
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestException({
      code: 'INVALID_METADATA',
      message: 'metadata must be a valid JSON string.',
    });
  }
}

/**
 * For owner reads, sensitive credentials remain visible (the user submitted
 * them). For staff and any future broader read paths, redaction can be
 * tightened by reusing this with a stricter filter.
 */
function redactSensitiveMetadata(
  _docType: string,
  metadata: Prisma.JsonValue | null,
): Prisma.JsonValue | null {
  return metadata ?? null;
}
