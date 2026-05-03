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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ClientProfileService } from './client-profile.service';
import { ClientProfileQueryDto } from './dto/client-profile-query.dto';
import { UpdateClientProfileDto } from './dto/update-client-profile.dto';

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

  @Get(':slug')
  @ApiOperation({ summary: 'Public profile by slug' })
  getBySlug(@Param('slug') slug: string) {
    return this.clientProfileService.getBySlug(slug);
  }
}
