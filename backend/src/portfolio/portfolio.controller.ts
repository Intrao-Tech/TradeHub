import {
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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
} from './dto/portfolio.dto';
import { PortfolioService } from './portfolio.service';

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
  @ApiOperation({ summary: 'Add media to portfolio item' })
  addMedia(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AddPortfolioMediaDto,
  ) {
    return this.portfolioService.addMedia(id, workerIdOrThrow(user), dto);
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
