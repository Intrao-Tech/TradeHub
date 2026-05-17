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
import { Prisma, type JobAttachment } from '@prisma/client';
import type { Express } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  JOB_ATTACHMENT_MAX_PER_PARENT,
  JOB_ATTACHMENT_UPLOAD_SUBDIR,
} from './job-attachment.constants';
import {
  serialiseJobAttachment,
  type SerialisedJobAttachment,
} from './serialise-attachment';

type DownloadAuthCtx = {
  clientProfileId: bigint | null;
};

/**
 * Which parent a new attachment belongs to. A discriminated union — it is
 * structurally impossible to pass both parents or neither, which is the
 * compile-time half of the `job_attachment_one_owner` mirror.
 */
type AttachmentOwner =
  | { kind: 'JOB_POST'; jobPostId: bigint }
  | { kind: 'JOB_APPLICATION'; jobApplicationId: bigint };

@Injectable()
export class JobAttachmentService implements OnModuleInit {
  private readonly logger = new Logger(JobAttachmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const dir = join(process.cwd(), JOB_ATTACHMENT_UPLOAD_SUBDIR);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  /**
   * Upload a file onto an existing job post. The caller must be the post's
   * employer. The row is created with `job_post_id` set and
   * `job_application_id` NULL — exactly one owner.
   */
  async uploadForJobPost(
    jobPostId: bigint,
    callerClientProfileId: bigint,
    file: Express.Multer.File | undefined,
  ): Promise<SerialisedJobAttachment> {
    return this.upload(file, async () => {
      const post = await this.prisma.jobPost.findUnique({
        where: { id: jobPostId },
        select: { id: true, employer_id: true },
      });
      if (!post) throw new NotFoundException({ code: 'NOT_FOUND' });
      if (post.employer_id !== callerClientProfileId) {
        throw new ForbiddenException({ code: 'NOT_OWNER' });
      }
      return { kind: 'JOB_POST', jobPostId };
    });
  }

  /**
   * Upload a file onto an existing job application. The caller must be the
   * application's worker.
   */
  async uploadForJobApplication(
    jobApplicationId: bigint,
    callerClientProfileId: bigint,
    file: Express.Multer.File | undefined,
  ): Promise<SerialisedJobAttachment> {
    return this.upload(file, async () => {
      const application = await this.prisma.jobApplication.findUnique({
        where: { id: jobApplicationId },
        select: { id: true, worker_id: true },
      });
      if (!application) throw new NotFoundException({ code: 'NOT_FOUND' });
      if (application.worker_id !== callerClientProfileId) {
        throw new ForbiddenException({ code: 'NOT_OWNER' });
      }
      return { kind: 'JOB_APPLICATION', jobApplicationId };
    });
  }

  /**
   * Shared upload pipeline. `resolveOwner` validates the parent + authz and
   * returns which parent the row belongs to. Multer has already written the
   * file to disk by the time we get here, so any rejection unlinks it — a
   * failed upload must never leak a file.
   */
  private async upload(
    file: Express.Multer.File | undefined,
    resolveOwner: () => Promise<AttachmentOwner>,
  ): Promise<SerialisedJobAttachment> {
    if (!file?.filename) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'A file is required.',
      });
    }
    try {
      const owner = await resolveOwner();
      await this.assertParentCapacity(owner);
      const created = await this.prisma.jobAttachment.create({
        data: buildAttachmentData(owner, file),
      });
      return serialiseJobAttachment(created);
    } catch (err) {
      this.tryUnlinkUpload(file.filename);
      throw err;
    }
  }

  /**
   * Delete an attachment. Only the owner of its parent may delete it — the
   * post's employer for a post attachment, the applicant for an application
   * attachment.
   */
  async deleteAttachment(
    id: bigint,
    callerClientProfileId: bigint,
  ): Promise<void> {
    const row = await this.prisma.jobAttachment.findUnique({
      where: { id },
      include: {
        job_post: { select: { employer_id: true } },
        job_application: { select: { worker_id: true } },
      },
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND' });

    const ownerId =
      row.job_post?.employer_id ?? row.job_application?.worker_id ?? null;
    if (ownerId == null || ownerId !== callerClientProfileId) {
      throw new ForbiddenException({ code: 'NOT_OWNER' });
    }

    this.tryUnlinkRow(row);
    await this.prisma.jobAttachment.delete({ where: { id } });
  }

  /**
   * Resolve an attachment for streaming and check authz. Job-post
   * attachments are public; job-application attachments are visible only to
   * the applicant and the post's employer.
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
      // Job-post attachment — public, job posts are public.
    } else {
      // Job-application attachment — the CHECK guarantees this is the other
      // arm of the arc, so `job_application` is present.
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

  /** Reject the upload once a parent already holds the per-parent ceiling. */
  private async assertParentCapacity(owner: AttachmentOwner): Promise<void> {
    const where: Prisma.JobAttachmentWhereInput =
      owner.kind === 'JOB_POST'
        ? { job_post_id: owner.jobPostId }
        : { job_application_id: owner.jobApplicationId };
    const count = await this.prisma.jobAttachment.count({ where });
    if (count >= JOB_ATTACHMENT_MAX_PER_PARENT) {
      throw new HttpException(
        {
          code: 'ATTACHMENT_LIMIT',
          message: `A job post or application can have at most ${JOB_ATTACHMENT_MAX_PER_PARENT} attachments.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
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

/**
 * Build the create payload with EXACTLY ONE parent set — the code-level
 * mirror of the DB CHECK `job_attachment_one_owner`. The discriminated-union
 * `owner` makes "both" / "neither" structurally impossible at compile time;
 * `assertSingleOwner` is the belt-and-braces runtime guard.
 */
function buildAttachmentData(
  owner: AttachmentOwner,
  file: Express.Multer.File,
): Prisma.JobAttachmentUncheckedCreateInput {
  const data: Prisma.JobAttachmentUncheckedCreateInput = {
    job_post_id: owner.kind === 'JOB_POST' ? owner.jobPostId : null,
    job_application_id:
      owner.kind === 'JOB_APPLICATION' ? owner.jobApplicationId : null,
    file_url: `/${JOB_ATTACHMENT_UPLOAD_SUBDIR}/${file.filename}`,
    original_name: sanitiseOriginalName(file.originalname),
    mime_type: file.mimetype,
    size_bytes: file.size,
  };
  assertSingleOwner(data);
  return data;
}

/**
 * Code mirror of the DB CHECK `job_attachment_one_owner`: a job attachment
 * must reference EXACTLY ONE parent — a job post XOR a job application.
 */
function assertSingleOwner(data: {
  job_post_id?: number | bigint | null;
  job_application_id?: number | bigint | null;
}): void {
  const owners = [data.job_post_id, data.job_application_id].filter(
    (v) => v != null,
  );
  if (owners.length !== 1) {
    throw new BadRequestException({
      code: 'INVALID_ATTACHMENT_OWNER',
      message:
        'A job attachment must belong to exactly one parent — a job post or a job application.',
    });
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
