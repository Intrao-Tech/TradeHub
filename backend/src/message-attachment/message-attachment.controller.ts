import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Controller,
  Get,
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
import {
  AccountStateGuard,
  RequiresVerifiedEmail,
} from '../common/guards/account-state.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import {
  MESSAGE_ATTACHMENT_ALLOWED_MIMES,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  MESSAGE_ATTACHMENT_UPLOAD_SUBDIR,
} from './message-attachment.constants';
import { MessageAttachmentService } from './message-attachment.service';

@ApiTags('Message attachments')
@Controller()
export class MessageAttachmentController {
  constructor(private readonly attachments: MessageAttachmentService) {}

  @Post('conversations/:id/attachments')
  @UseGuards(JwtAuthGuard, AccountStateGuard)
  @RequiresVerifiedEmail()
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
            'Single file. PNG / JPEG / WebP / GIF up to 10 MB or PDF up to 25 MB. Returns an attachment id used in `attachment_ids` on a send-message request.',
        },
      },
    },
  })
  @ApiOperation({
    summary:
      'Upload a chat attachment (orphan — wire to a message by sending it with `attachment_ids`).',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), MESSAGE_ATTACHMENT_UPLOAD_SUBDIR),
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: MESSAGE_ATTACHMENT_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!MESSAGE_ATTACHMENT_ALLOWED_MIMES.includes(file.mimetype)) {
          cb(
            new BadRequestException({
              code: 'INVALID_MIME_TYPE',
              message: 'Use a PNG, JPEG, WebP, GIF or PDF file.',
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
    @Param('id', ParseBigIntPipe) conversationId: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException({
        code: 'NO_CLIENT_PROFILE',
        message: 'Client profile required.',
      });
    }
    return this.attachments.uploadOrphan(
      conversationId,
      user.accountId,
      user.clientProfileId,
      file,
    );
  }

  @Get('message-attachments/:id/download')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Download a chat attachment. Auth-gated: only conversation participants (or the uploader of an unsent orphan) may download.',
  })
  async download(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ) {
    const { diskPath, originalName, mimeType } =
      await this.attachments.resolveForDownload(id, {
        accountId: user.accountId,
      });

    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeRfc6266(originalName)}`,
    );
    res.setHeader('Content-Type', mimeType);
    res.sendFile(diskPath);
  }
}

function encodeRfc6266(name: string): string {
  return encodeURIComponent(name)
    .replace(/['()]/g, escape)
    .replace(/\*/g, '%2A');
}
