import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { ConversationService } from './conversation.service';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { StartConversationDto } from './dto/start-conversation.dto';

@ApiTags('Conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start or continue a direct conversation' })
  start(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: StartConversationDto,
  ) {
    return this.conversationService.startConversation(user.accountId, dto);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inbox: conversations for the current user' })
  inbox(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ConversationQueryDto,
  ) {
    return this.conversationService.getInbox(user.accountId, query);
  }

  @Get('unread-count')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Total unread messages across all conversations' })
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.conversationService.getUnreadCount(user.accountId);
  }

  @Get(':id/messages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Messages in a conversation (newest first)' })
  getMessages(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: MessageQueryDto,
  ) {
    return this.conversationService.getMessages(id, user.accountId, query);
  }

  @Post(':id/messages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a message' })
  sendMessage(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationService.sendMessage(id, user.accountId, dto);
  }

  @Patch(':id/read')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark conversation as read' })
  markRead(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.conversationService.markRead(id, user.accountId);
  }
}
