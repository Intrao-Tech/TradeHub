import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
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
import type { Express } from 'express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { DocumentService } from './document.service';
import {
  DOCUMENT_DOC_TYPES,
  UploadDocumentDto,
} from './dto/upload-document.dto';

const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const DOCUMENT_ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

@ApiTags('Documents')
@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['doc_type'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'File payload. Required for most doc types; omit for structured-only types like HMRC_CIS_DOCUMENT.',
        },
        doc_type: {
          type: 'string',
          enum: [...DOCUMENT_DOC_TYPES],
        },
        metadata: {
          type: 'string',
          description:
            'Per-doc-type structured metadata as a JSON string (e.g. `{"share_code":"W12 ABC 345"}` for RIGHT_TO_WORK_SHARE_CODE).',
        },
      },
    },
  })
  @ApiOperation({
    summary:
      'Upload a verification document (file + metadata) or submit a structured-only credential (HMRC CIS).',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: DOCUMENT_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!DOCUMENT_ALLOWED_MIMES.includes(file.mimetype)) {
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
  async upload(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Ip() ip: string,
  ) {
    if (user.clientProfileId === null) {
      throw new BadRequestException({
        code: 'NO_CLIENT_PROFILE',
        message: 'Client profile required.',
      });
    }
    return this.documentService.upload(user.clientProfileId, dto, file, ip);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my documents' })
  async listMine(@CurrentUser() user: CurrentUserPayload) {
    if (user.clientProfileId === null) {
      throw new BadRequestException('Client profile required');
    }
    return this.documentService.getByClientProfile(user.clientProfileId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get document by id (owner or staff)' })
  async getOne(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.documentService.getByIdForRequester(
      id,
      user.clientProfileId,
      user.isStaff,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete own document (PENDING only)' })
  async remove(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    if (user.clientProfileId === null) {
      throw new BadRequestException('Client profile required');
    }
    await this.documentService.deleteDocument(id, user.clientProfileId);
  }
}
