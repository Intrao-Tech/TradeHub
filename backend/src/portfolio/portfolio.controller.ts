import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import {
  AddPortfolioMediaDto,
  CreateCertificationDto,
  CreateExperienceDto,
  CreateProjectDto,
  UpdateCertificationDetailDto,
  UpdateExperienceDetailDto,
  UpdatePortfolioItemDto,
  UpdateProjectDetailDto,
  UploadPortfolioMediaDto,
} from './dto/portfolio.dto';
import { PortfolioService } from './portfolio.service';

const PORTFOLIO_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const PORTFOLIO_MEDIA_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

function workerIdOrThrow(user: CurrentUserPayload): bigint {
  if (user.clientProfileId == null) {
    throw new ForbiddenException('Worker profile required');
  }
  return user.clientProfileId;
}

@ApiTags('Portfolio')
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('worker/:workerId')
  @ApiOperation({ summary: 'List portfolio items for a worker (public)' })
  getByWorker(@Param('workerId', ParseBigIntPipe) workerId: bigint) {
    return this.portfolioService.getByWorker(workerId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single portfolio item (public)' })
  getById(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.portfolioService.getById(id);
  }

  @Post('experience')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an experience portfolio item' })
  createExperience(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateExperienceDto,
  ) {
    return this.portfolioService.createExperience(workerIdOrThrow(user), dto);
  }

  @Post('project')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a project portfolio item' })
  createProject(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateProjectDto,
  ) {
    return this.portfolioService.createProject(workerIdOrThrow(user), dto);
  }

  @Post('certification')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a certification portfolio item' })
  createCertification(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCertificationDto,
  ) {
    return this.portfolioService.createCertification(
      workerIdOrThrow(user),
      dto,
    );
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update portfolio item base fields' })
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdatePortfolioItemDto,
  ) {
    return this.portfolioService.update(id, workerIdOrThrow(user), dto);
  }

  @Patch(':id/experience')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update experience detail' })
  updateExperience(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateExperienceDetailDto,
  ) {
    return this.portfolioService.updateExperienceDetail(
      id,
      workerIdOrThrow(user),
      dto,
    );
  }

  @Patch(':id/project')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update project detail' })
  updateProject(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateProjectDetailDto,
  ) {
    return this.portfolioService.updateProjectDetail(
      id,
      workerIdOrThrow(user),
      dto,
    );
  }

  @Patch(':id/certification')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update certification detail' })
  updateCertification(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateCertificationDetailDto,
  ) {
    return this.portfolioService.updateCertificationDetail(
      id,
      workerIdOrThrow(user),
      dto,
    );
  }

  @Delete('media/:mediaId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove portfolio media' })
  async removeMedia(
    @Param('mediaId', ParseBigIntPipe) mediaId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.portfolioService.removeMedia(mediaId, workerIdOrThrow(user));
  }

  @Post(':id/media')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add media to portfolio item (URL only)' })
  addMedia(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AddPortfolioMediaDto,
  ) {
    return this.portfolioService.addMedia(id, workerIdOrThrow(user), dto);
  }

  @Post(':id/media/upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        caption: { type: 'string' },
        sort_order: { type: 'integer' },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload a media file to a portfolio item (PROF-024)',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: PORTFOLIO_MEDIA_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!PORTFOLIO_MEDIA_ALLOWED_MIMES.includes(file.mimetype)) {
          cb(
            new BadRequestException({
              code: 'INVALID_MIME',
              message: 'Use a JPEG, PNG, or WebP image.',
            }),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadMedia(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadPortfolioMediaDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.portfolioService.uploadMedia(
      id,
      workerIdOrThrow(user),
      file,
      dto,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete portfolio item' })
  async remove(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.portfolioService.delete(id, workerIdOrThrow(user));
  }

  @Post(':id/documents/:documentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Link a document to portfolio item' })
  linkDocument(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('documentId', ParseBigIntPipe) documentId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.portfolioService.linkDocument(
      id,
      documentId,
      workerIdOrThrow(user),
    );
  }

  @Delete(':id/documents/:documentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WORKER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unlink document from portfolio item' })
  unlinkDocument(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('documentId', ParseBigIntPipe) documentId: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.portfolioService.unlinkDocument(
      id,
      documentId,
      workerIdOrThrow(user),
    );
  }
}
