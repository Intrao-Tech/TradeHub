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

// Doc types a worker may hold at most ONE of: they represent a single standing
// fact (e.g. CIS status), not an append-only log. Re-submitting SUPERSEDES the
// previous item so the queue + "My documents" never accumulate duplicates and
// the same fact can't be approved twice.
const SINGLETON_DOC_TYPES = new Set(['HMRC_CIS_DOCUMENT']);

// Shape we return on the API. Aggregated from reviewable_item (owner, created)
// + document (file/metadata) + latest review_item (workflow state).
type DocumentRow = Prisma.DocumentGetPayload<{
  include: {
    reviewable_item: {
      include: {
        review_items: { orderBy: { created_at: 'desc' }; take: 1 };
      };
    };
  };
}>;

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

    // Upload creates: reviewable_item (parent, owns client_profile_id) +
    // document (subtype, shared PK) + review_item (workflow, status=PENDING)
    // in a single transaction. review_item's existence puts the document
    // into the staff verification queue immediately.
    const created = await this.prisma.$transaction(async (tx) => {
      // Supersede any prior submission of a singleton type (e.g. CIS), so a
      // worker ends up with exactly one — re-submit replaces, never stacks.
      // Deleting the reviewable_item cascades to its document + review_items.
      if (SINGLETON_DOC_TYPES.has(dto.doc_type)) {
        await tx.reviewableItem.deleteMany({
          where: {
            client_profile_id: clientProfileId,
            kind: 'DOCUMENT',
            document: { doc_type: dto.doc_type },
          },
        });
      }
      const reviewable = await tx.reviewableItem.create({
        data: {
          client_profile_id: clientProfileId,
          kind: 'DOCUMENT',
          document: {
            create: {
              doc_type: dto.doc_type,
              file_url,
              metadata: validatedMetadata
                ? (validatedMetadata as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            },
          },
          review_items: {
            create: {
              status: 'PENDING',
            },
          },
        },
        include: {
          document: true,
          review_items: { orderBy: { created_at: 'desc' }, take: 1 },
        },
      });
      return reviewable;
    });

    // Auto-assign to the next on-duty staff (or leave unassigned). Operates
    // on review_item now (assigned_to_staff_id moved off document).
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

    const row = await this.findByIdWithReview(created.id);
    // We just created it in the transaction above — must exist.
    return this.serialize(row!);
  }

  async getByClientProfile(clientProfileId: bigint) {
    const docs = await this.prisma.document.findMany({
      where: { reviewable_item: { client_profile_id: clientProfileId } },
      include: {
        reviewable_item: {
          include: {
            review_items: { orderBy: { created_at: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { reviewable_item: { created_at: 'desc' } },
    });
    return docs.map((d) => this.serialize(d));
  }

  async getByIdForRequester(
    id: bigint,
    clientProfileId: bigint | null,
    isStaff: boolean,
  ) {
    const doc = await this.findByIdWithReview(id);
    if (!doc) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
    const isOwner =
      clientProfileId !== null &&
      doc.reviewable_item.client_profile_id === clientProfileId;
    if (!isOwner && !isStaff) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Cannot access this document.',
      });
    }
    return this.serialize(doc);
  }

  async deleteDocument(id: bigint, clientProfileId: bigint) {
    const doc = await this.findByIdWithReview(id);
    if (!doc) throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND' });
    if (doc.reviewable_item.client_profile_id !== clientProfileId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Cannot delete this document.',
      });
    }
    const latestReview = doc.reviewable_item.review_items[0];
    // Only allow delete while the doc is still PENDING (or has no review yet
    // — though current upload flow always creates a PENDING review_item).
    if (latestReview && latestReview.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: 'Only documents in PENDING status can be deleted.',
      });
    }
    // Deleting the parent reviewable_item cascades to document + review_items.
    await this.prisma.reviewableItem.delete({ where: { id } });
  }

  /**
   * Internal helper: load a document by id with the parent + latest review.
   */
  private async findByIdWithReview(id: bigint): Promise<DocumentRow | null> {
    return this.prisma.document.findUnique({
      where: { id },
      include: {
        reviewable_item: {
          include: {
            review_items: { orderBy: { created_at: 'desc' }, take: 1 },
          },
        },
      },
    });
  }

  /**
   * Serialised view for the API. Keeps the same shape as before the
   * reviewable_item refactor — aggregates fields from parent + subtype +
   * latest review_item. Strips sensitive metadata.
   */
  private serialize(doc: DocumentRow) {
    const ri = doc.reviewable_item;
    const review = ri.review_items[0]; // latest or undefined
    const safeMetadata = redactSensitiveMetadata(doc.doc_type, doc.metadata);
    return {
      id: doc.id.toString(),
      client_profile_id: ri.client_profile_id.toString(),
      doc_type: doc.doc_type,
      file_url: doc.file_url,
      status: review?.status ?? 'PENDING',
      rejection_reason: review?.rejection_reason ?? null,
      metadata: safeMetadata,
      assigned_to: review?.assigned_to_staff_id
        ? review.assigned_to_staff_id.toString()
        : null,
      reviewed_by: review?.reviewed_by_staff_id
        ? review.reviewed_by_staff_id.toString()
        : null,
      reviewed_at: review?.reviewed_at ?? null,
      created_at: ri.created_at,
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
