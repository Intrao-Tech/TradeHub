import {
  BadRequestException,
  ConflictException,
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
import type { JobAttachment } from '@prisma/client';
import type { Express } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  JOB_ATTACHMENT_ORPHAN_CEILING,
  JOB_ATTACHMENT_ORPHAN_TTL_HOURS,
  JOB_ATTACHMENT_SWEEP_BATCH,
  JOB_ATTACHMENT_UPLOAD_SUBDIR,
} from './job-attachment.constants';
import {
  serialiseJobAttachment,
  type SerialisedJobAttachment,
} from './serialise-attachment';

type DownloadAuthCtx = {
  clientProfileId: bigint | null;
};

@Injectable()
export class JobAttachmentService implements OnModuleInit {
  private readonly logger = new Logger(JobAttachmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const dir = join(process.cwd(), JOB_ATTACHMENT_UPLOAD_SUBDIR);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  async uploadOrphan(
    uploadedById: bigint,
    file: Express.Multer.File | undefined,
  ): Promise<SerialisedJobAttachment> {
    if (!file?.filename) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'A file is required.',
      });
    }

    const orphanCount = await this.prisma.jobAttachment.count({
      where: {
        uploaded_by_id: uploadedById,
        job_post_id: null,
        job_application_id: null,
      },
    });
    if (orphanCount >= JOB_ATTACHMENT_ORPHAN_CEILING) {
      this.tryUnlinkUpload(file.filename);
      throw new HttpException(
        {
          code: 'ORPHAN_LIMIT',
          message:
            'Submit or remove some of your existing uploads before adding more.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const fileUrl = `/${JOB_ATTACHMENT_UPLOAD_SUBDIR}/${file.filename}`;
    const created = await this.prisma.jobAttachment.create({
      data: {
        uploaded_by_id: uploadedById,
        file_url: fileUrl,
        original_name: sanitiseOriginalName(file.originalname),
        mime_type: file.mimetype,
        size_bytes: file.size,
      },
    });
    return serialiseJobAttachment(created);
  }

  async deleteOrphan(id: bigint, callerClientProfileId: bigint): Promise<void> {
    const row = await this.prisma.jobAttachment.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }
    if (row.uploaded_by_id !== callerClientProfileId) {
      throw new ForbiddenException({ code: 'NOT_OWNER' });
    }
    if (row.job_post_id != null || row.job_application_id != null) {
      throw new ConflictException({
        code: 'ATTACHED',
        message:
          'Submitted attachments are removed by editing the parent record.',
      });
    }

    this.tryUnlinkRow(row);
    await this.prisma.jobAttachment.delete({ where: { id } });
  }

  /**
   * Resolve an attachment for streaming and check authz. Returns the
   * absolute disk path and original filename.
   */
  async resolveForDownload(
    id: bigint,
    ctx: DownloadAuthCtx,
  ): Promise<{
    diskPath: string;
    originalName: string;
    mimeType: string;
  }> {
    const row = await this.prisma.jobAttachment.findUnique({
      where: { id },
      include: { job_application: { include: { job_post: true } } },
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND' });

    if (row.job_post_id != null) {
      // Public — no auth required.
    } else if (row.job_application_id != null) {
      if (ctx.clientProfileId == null) {
        throw new ForbiddenException({ code: 'FORBIDDEN' });
      }
      const application = row.job_application!;
      const isWorker = application.worker_id === ctx.clientProfileId;
      const isEmployer =
        application.job_post.employer_id === ctx.clientProfileId;
      if (!isWorker && !isEmployer) {
        throw new ForbiddenException({ code: 'FORBIDDEN' });
      }
    } else {
      // Orphan — only the uploader may download.
      if (
        ctx.clientProfileId == null ||
        row.uploaded_by_id !== ctx.clientProfileId
      ) {
        throw new NotFoundException({ code: 'NOT_FOUND' });
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

  /** Daily cron seam — also called directly by e2e tests. */
  async runSweep(): Promise<number> {
    const cutoff = new Date(
      Date.now() - JOB_ATTACHMENT_ORPHAN_TTL_HOURS * 60 * 60 * 1000,
    );
    const candidates = await this.prisma.jobAttachment.findMany({
      where: {
        job_post_id: null,
        job_application_id: null,
        created_at: { lt: cutoff },
      },
      take: JOB_ATTACHMENT_SWEEP_BATCH,
    });

    let removed = 0;
    for (const row of candidates) {
      try {
        this.tryUnlinkRow(row);
        await this.prisma.jobAttachment.delete({ where: { id: row.id } });
        removed += 1;
      } catch (err) {
        this.logger.warn(
          `Failed to sweep job attachment ${row.id.toString()}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return removed;
  }

  private tryUnlinkRow(row: JobAttachment) {
    try {
      const path = this.resolveDiskPath(row.file_url);
      if (existsSync(path)) unlinkSync(path);
    } catch (err) {
      this.logger.warn(
        `Disk unlink failed for ${row.file_url}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private tryUnlinkUpload(filename: string) {
    try {
      const path = join(process.cwd(), JOB_ATTACHMENT_UPLOAD_SUBDIR, filename);
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
    // file_url is stored as `/uploads/job-attachments/{uuid}{ext}` (leading slash).
    const trimmed = fileUrl.startsWith('/') ? fileUrl.slice(1) : fileUrl;
    return join(process.cwd(), trimmed);
  }
}

function sanitiseOriginalName(name: string): string {
  // Strip ASCII control chars (NUL through US, plus DEL) and replace path
  // separators with underscore. Cap at 255 to match VARCHAR(255).
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
