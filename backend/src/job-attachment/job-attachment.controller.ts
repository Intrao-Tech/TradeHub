import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Express, Response } from 'express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import {
  JOB_ATTACHMENT_ALLOWED_MIMES,
  JOB_ATTACHMENT_MAX_BYTES,
  JOB_ATTACHMENT_UPLOAD_SUBDIR,
} from './job-attachment.constants';
import { JobAttachmentService } from './job-attachment.service';

// Shared multer config for both parent-scoped upload routes.
const fileUploadInterceptor = FileInterceptor('file', {
  storage: diskStorage({
    destination: join(process.cwd(), JOB_ATTACHMENT_UPLOAD_SUBDIR),
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: JOB_ATTACHMENT_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!JOB_ATTACHMENT_ALLOWED_MIMES.includes(file.mimetype)) {
      cb(
        new BadRequestException({
          code: 'INVALID_MIME',
          message: 'Use a PDF, JPEG, PNG, or WebP file.',
        }),
        false,
      );
      return;
    }
    cb(null, true);
  },
});

const fileUploadBody = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: {
      file: {
        type: 'string',
        format: 'binary',
        description: 'Single file. PDF / JPEG / PNG / WebP up to 25 MB.',
      },
    },
  },
};

/**
 * Job attachments are uploaded straight onto an existing job post or job
 * application — there is no orphan / pre-upload stage. The `job_attachment`
 * row is therefore always parented (exactly one of job_post_id /
 * job_application_id), and who uploaded it is the owner of that parent.
 */
@ApiTags('Job attachments')
@Controller()
export class JobAttachmentController {
  constructor(private readonly attachments: JobAttachmentService) {}

  @Post('job-posts/:jobPostId/attachments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileUploadBody)
  @ApiOperation({
    summary:
      'Upload an attachment onto a job post. The caller must be the post owner (employer).',
  })
  @UseInterceptors(fileUploadInterceptor)
  uploadToJobPost(
    @Param('jobPostId', ParseBigIntPipe) jobPostId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({
        code: 'NO_CLIENT_PROFILE',
        message: 'Client profile required.',
      });
    }
    return this.attachments.uploadForJobPost(
      jobPostId,
      user.clientProfileId,
      file,
    );
  }

  @Post('job-applications/:applicationId/attachments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileUploadBody)
  @ApiOperation({
    summary:
      'Upload an attachment onto a job application. The caller must be the applicant (worker).',
  })
  @UseInterceptors(fileUploadInterceptor)
  uploadToJobApplication(
    @Param('applicationId', ParseBigIntPipe) applicationId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({
        code: 'NO_CLIENT_PROFILE',
        message: 'Client profile required.',
      });
    }
    return this.attachments.uploadForJobApplication(
      applicationId,
      user.clientProfileId,
      file,
    );
  }

  @Get('job-attachments/:id/download')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Download an attachment. Public for job-post attachments; auth-gated to applicant-or-employer for application attachments.',
  })
  async download(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload | null,
    @Res() res: Response,
  ) {
    const { diskPath, originalName, mimeType } =
      await this.attachments.resolveForDownload(id, {
        clientProfileId: user?.clientProfileId ?? null,
      });

    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeRfc6266(originalName)}`,
    );
    res.setHeader('Content-Type', mimeType);
    res.sendFile(diskPath);
  }

  @Delete('job-attachments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a job attachment (the owner removing their own file).',
  })
  async remove(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null) {
      throw new ForbiddenException({ code: 'NOT_OWNER' });
    }
    await this.attachments.deleteAttachment(id, user.clientProfileId);
  }
}

function encodeRfc6266(name: string): string {
  return encodeURIComponent(name)
    .replace(/['()]/g, escape)
    .replace(/\*/g, '%2A');
}
