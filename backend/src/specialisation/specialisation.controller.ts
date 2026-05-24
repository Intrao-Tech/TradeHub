import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CreateSpecialisationDto } from './dto/create-specialisation.dto';
import { UpdateSpecialisationDto } from './dto/update-specialisation.dto';
import { WorkersBySpecialisationQueryDto } from './dto/workers-query.dto';
import { SpecialisationService } from './specialisation.service';

@ApiTags('Specialisations')
@Controller('specialisations')
export class SpecialisationController {
  constructor(private readonly specialisationService: SpecialisationService) {}

  @Get()
  @ApiOperation({ summary: 'List all specialisations' })
  findAll() {
    return this.specialisationService.findAll();
  }

  @Get(':id/workers')
  @ApiOperation({
    summary: 'Paginated workers for a specialisation',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getWorkersBySpecialisation(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: WorkersBySpecialisationQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return this.specialisationService.getWorkersBySpecialisation(
      id,
      page,
      limit,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('specialisations.manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create specialisation (staff)' })
  create(@Body() dto: CreateSpecialisationDto) {
    return this.specialisationService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('specialisations.manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update specialisation (staff)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSpecialisationDto,
  ) {
    return this.specialisationService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermissions('specialisations.manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete specialisation (staff)' })
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.specialisationService.delete(id);
  }
}
