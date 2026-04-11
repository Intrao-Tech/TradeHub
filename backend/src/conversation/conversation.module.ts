import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [ConversationController],
  providers: [ConversationService, ChatGateway],
  exports: [ConversationService, ChatGateway],
})
export class ConversationModule {}
