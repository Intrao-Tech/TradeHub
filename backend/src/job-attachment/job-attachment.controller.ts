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

@ApiTags('Job attachments')
@Controller('job-attachments')
export class JobAttachmentController {
  constructor(private readonly attachments: JobAttachmentService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Single file. PDF / JPEG / PNG / WEBP up to 25 MB. Returns an attachment id used in `attachment_ids` on a job post or application.',
        },
      },
    },
  })
  @ApiOperation({
    summary:
      'Upload a job attachment (orphan — wire to a parent by submitting `attachment_ids` on a job post or application).',
  })
  @UseInterceptors(
    FileInterceptor('file', {
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
    }),
  )
  upload(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({
        code: 'NO_CLIENT_PROFILE',
        message: 'Client profile required.',
      });
    }
    return this.attachments.uploadOrphan(user.clientProfileId, file);
  }

  @Get(':id/download')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Download an attachment. Public for job-post attachments; auth-gated to owner-or-employer for application attachments.',
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Delete an unattached job attachment (the uploader removing their own orphan).',
  })
  async remove(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId == null) {
      throw new ForbiddenException({ code: 'NOT_OWNER' });
    }
    await this.attachments.deleteOrphan(id, user.clientProfileId);
  }
}

function encodeRfc6266(name: string): string {
  return encodeURIComponent(name)
    .replace(/['()]/g, escape)
    .replace(/\*/g, '%2A');
}
