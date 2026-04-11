import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { Roles } from '../common/guards/roles.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateModerationActionDto } from './dto/create-moderation-action.dto';
import { ModerationQueueQueryDto } from './dto/moderation-queue-query.dto';
import { ModerationService } from './moderation.service';

@ApiTags('Moderation')
@Controller('moderation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF')
@ApiBearerAuth()
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('queue')
  @ApiOperation({ summary: 'Paginated moderation queue (staff)' })
  getQueue(@Query() query: ModerationQueueQueryDto) {
    return this.moderationService.getQueue(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Moderation item with actions (staff)' })
  getById(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.moderationService.getById(id);
  }

  @Post(':id/actions')
  @ApiOperation({ summary: 'Add moderation action (staff)' })
  addAction(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateModerationActionDto,
  ) {
    return this.moderationService.addAction(id, user.accountId, dto);
  }

  @Get(':id/actions')
  @ApiOperation({ summary: 'List actions for moderation item (staff)' })
  getActions(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.moderationService.getActionsByItem(id);
  }
}
