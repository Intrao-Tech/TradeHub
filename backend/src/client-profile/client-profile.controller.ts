import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import type { Express } from 'express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ClientProfileService } from './client-profile.service';
import { ClientProfileQueryDto } from './dto/client-profile-query.dto';
import { UpdateClientProfileDto } from './dto/update-client-profile.dto';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

@ApiTags('Client profiles')
@Controller('client-profiles')
export class ClientProfileController {
  constructor(private readonly clientProfileService: ClientProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Search / list client profiles' })
  search(@Query() query: ClientProfileQueryDto) {
    return this.clientProfileService.search(query);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own client profile' })
  updateMe(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateClientProfileDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.clientProfileService.update(user.clientProfileId, dto);
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload my avatar (PROF-017)' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: AVATAR_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!AVATAR_ALLOWED_MIMES.includes(file.mimetype)) {
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
  async uploadAvatar(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.clientProfileService.updateAvatar(user.clientProfileId, file);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Public profile by slug' })
  getBySlug(@Param('slug') slug: string) {
    return this.clientProfileService.getBySlug(slug);
  }
}
