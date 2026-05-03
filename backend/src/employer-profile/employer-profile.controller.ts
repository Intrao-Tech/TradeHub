import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { EmployerProfileService } from './employer-profile.service';
import { EmployerSearchQueryDto } from './dto/employer-search-query.dto';
import { UpdateEmployerProfileDto } from './dto/update-employer-profile.dto';

@ApiTags('Employer profiles')
@Controller('employer-profiles')
export class EmployerProfileController {
  constructor(
    private readonly employerProfileService: EmployerProfileService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Search employer profiles' })
  search(@Query() query: EmployerSearchQueryDto) {
    return this.employerProfileService.search(query);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own employer profile' })
  updateMe(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateEmployerProfileDto,
  ) {
    if (user.clientProfileId == null) {
      throw new BadRequestException('No client profile for this account');
    }
    return this.employerProfileService.update(user.clientProfileId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Employer profile by id' })
  getById(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.employerProfileService.getById(id);
  }
}
