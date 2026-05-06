import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { MessageAttachment, Prisma } from '@prisma/client';
import type { Express } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  MESSAGE_ATTACHMENT_IMAGE_MAX_BYTES,
  MESSAGE_ATTACHMENT_IMAGE_MIMES,
  MESSAGE_ATTACHMENT_ORPHAN_CEILING,
  MESSAGE_ATTACHMENT_PDF_MAX_BYTES,
  MESSAGE_ATTACHMENT_PDF_MIMES,
  MESSAGE_ATTACHMENT_UPLOAD_SUBDIR,
} from './message-attachment.constants';
import {
  serialiseMessageAttachment,
  type SerialisedMessageAttachment,
} from './serialise-attachment';

type DownloadAuthCtx = {
  accountId: bigint | null;
};

@Injectable()
export class MessageAttachmentService implements OnModuleInit {
  private readonly logger = new Logger(MessageAttachmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const dir = join(process.cwd(), MESSAGE_ATTACHMENT_UPLOAD_SUBDIR);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  /**
   * Upload an attachment for a future message. The caller must be a
   * participant of the conversation. The row is created with `message_id =
   * NULL` and is bound to the message at send-time by `wireOrphans`.
   */
  async uploadOrphan(
    conversationId: bigint,
    senderId: bigint,
    uploadedById: bigint,
    file: Express.Multer.File | undefined,
  ): Promise<SerialisedMessageAttachment> {
    if (!file?.filename) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'A file is required.',
      });
    }

    // Enforce per-MIME size caps now that we know the type.
    const isImage = MESSAGE_ATTACHMENT_IMAGE_MIMES.includes(file.mimetype);
    const isPdf = MESSAGE_ATTACHMENT_PDF_MIMES.includes(file.mimetype);
    if (!isImage && !isPdf) {
      this.tryUnlinkUpload(file.filename);
      throw new BadRequestException({
        code: 'INVALID_MIME_TYPE',
        message: 'Use a PNG, JPEG, WebP, GIF or PDF file.',
      });
    }
    const cap = isImage
      ? MESSAGE_ATTACHMENT_IMAGE_MAX_BYTES
      : MESSAGE_ATTACHMENT_PDF_MAX_BYTES;
    if (file.size > cap) {
      this.tryUnlinkUpload(file.filename);
      throw new HttpException(
        {
          code: 'FILE_TOO_LARGE',
          message: `File exceeds the ${cap / (1024 * 1024)} MB limit for this type.`,
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    // Caller must be a participant of the conversation.
    const participant =
      await this.prisma.conversationParticipant.findUnique({
        where: {
          conversation_id_account_id: {
            conversation_id: conversationId,
            account_id: senderId,
          },
        },
      });
    if (!participant) {
      this.tryUnlinkUpload(file.filename);
      throw new ForbiddenException({
        code: 'NOT_PARTICIPANT',
        message: 'Not a participant in this conversation.',
      });
    }

    const orphanCount = await this.prisma.messageAttachment.count({
      where: { uploaded_by_id: uploadedById, message_id: null },
    });
    if (orphanCount >= MESSAGE_ATTACHMENT_ORPHAN_CEILING) {
      this.tryUnlinkUpload(file.filename);
      throw new HttpException(
        {
          code: 'ORPHAN_LIMIT',
          message:
            'Send or remove some of your existing uploads before adding more.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const fileUrl = `/${MESSAGE_ATTACHMENT_UPLOAD_SUBDIR}/${file.filename}`;
    const created = await this.prisma.messageAttachment.create({
      data: {
        uploaded_by_id: uploadedById,
        file_url: fileUrl,
        original_name: sanitiseOriginalName(file.originalname),
        mime_type: file.mimetype,
        size_bytes: file.size,
      },
    });
    return serialiseMessageAttachment(created);
  }

  /**
   * Attach orphan rows to the freshly-created message in the same tx as the
   * message create. Throws NOT_OWNER if any id was not owned by the sender or
   * already attached to another message.
   */
  async wireOrphans(
    tx: Prisma.TransactionClient,
    attachmentIds: number[] | undefined,
    messageId: bigint,
    uploadedById: bigint,
  ): Promise<void> {
    if (!attachmentIds || attachmentIds.length === 0) return;
    const ids = attachmentIds.map((n) => BigInt(n));

    const result = await tx.messageAttachment.updateMany({
      where: {
        id: { in: ids },
        uploaded_by_id: uploadedById,
        message_id: null,
      },
      data: { message_id: messageId },
    });

    if (result.count !== ids.length) {
      throw new ForbiddenException({
        code: 'NOT_OWNER',
        message:
          'One or more attachments could not be wired (not owned by you, or already attached).',
      });
    }
  }

  async resolveForDownload(
    id: bigint,
    ctx: DownloadAuthCtx,
  ): Promise<{
    diskPath: string;
    originalName: string;
    mimeType: string;
  }> {
    const row = await this.prisma.messageAttachment.findUnique({
      where: { id },
      include: {
        message: {
          include: { conversation: { include: { participants: true } } },
        },
      },
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND' });

    if (row.message_id == null || row.message == null) {
      // Orphan — only the uploader may download.
      if (
        ctx.accountId == null ||
        row.uploaded_by_id !== ctx.accountId
      ) {
        throw new NotFoundException({ code: 'NOT_FOUND' });
      }
    } else {
      if (ctx.accountId == null) {
        throw new ForbiddenException({ code: 'FORBIDDEN' });
      }
      const isParticipant = row.message.conversation.participants.some(
        (p) => p.account_id === ctx.accountId,
      );
      if (!isParticipant) {
        throw new ForbiddenException({ code: 'FORBIDDEN' });
      }
    }

    const diskPath = this.resolveDiskPath(row.file_url);
    if (!existsSync(diskPath)) {
      throw new NotFoundException({ code: 'FILE_MISSING' });
    }
    return {
      diskPath,
      originalName: row.original_name,
      mimeType: row.mime_type,
    };
  }

  private tryUnlinkUpload(filename: string) {
    try {
      const path = join(
        process.cwd(),
        MESSAGE_ATTACHMENT_UPLOAD_SUBDIR,
        filename,
      );
      if (existsSync(path)) unlinkSync(path);
    } catch (err) {
      this.logger.warn(
        `Disk unlink failed for ${filename}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private resolveDiskPath(fileUrl: string): string {
    const trimmed = fileUrl.startsWith('/') ? fileUrl.slice(1) : fileUrl;
    return join(process.cwd(), trimmed);
  }
}

export type { MessageAttachment };

function sanitiseOriginalName(name: string): string {
  const out: string[] = [];
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) continue;
    if (ch === '/' || ch === '\\') {
      out.push('_');
      continue;
    }
    out.push(ch);
  }
  const cleaned = out.join('').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 255) : 'attachment';
}
