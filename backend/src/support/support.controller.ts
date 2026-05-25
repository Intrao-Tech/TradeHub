import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { SupportService } from './support.service';
import { SendSupportMessageDto } from './dto/send-support-message.dto';

/**
 * Client-facing support chat. Each client has exactly one support thread,
 * created lazily on first read/post. All staff replies appear as
 * "TradeHub Support" — individual staff identity is intentionally hidden.
 */
@ApiTags('Support (client)')
@Controller('support')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('thread')
  @ApiOperation({ summary: 'List messages on my support thread' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.requireClient(user);
    return this.support.listMessagesForClient(
      user.clientProfileId!,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send a message to support' })
  send(
    @Body() dto: SendSupportMessageDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.requireClient(user);
    return this.support.sendAsClient(user.clientProfileId!, dto);
  }

  @Post('thread/read')
  @ApiOperation({ summary: 'Mark my support thread as read' })
  markRead(@CurrentUser() user: CurrentUserPayload) {
    this.requireClient(user);
    return this.support.markReadAsClient(user.clientProfileId!);
  }

  @Get('thread/unread-count')
  @ApiOperation({ summary: 'Count of staff messages I have not yet read' })
  async unread(@CurrentUser() user: CurrentUserPayload) {
    this.requireClient(user);
    const count = await this.support.unreadCountForClient(user.clientProfileId!);
    return { count };
  }

  private requireClient(user: CurrentUserPayload) {
    if (user.clientProfileId == null) {
      throw new ForbiddenException({
        code: 'NOT_CLIENT',
        message: 'Only marketplace clients have a support thread.',
      });
    }
  }
}
