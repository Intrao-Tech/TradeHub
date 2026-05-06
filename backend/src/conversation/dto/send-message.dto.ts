import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  content: string;

  @ApiPropertyOptional({ default: 'TEXT' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  message_type?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Client-generated UUID echoed back via the WS new_message event so the optimistic bubble can reconcile.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  client_id?: string;

  @ApiPropertyOptional({
    description:
      'Ids of previously uploaded MessageAttachment rows (still orphan) to wire to this message.',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Type(() => Number)
  @IsInt({ each: true })
  attachment_ids?: number[];
}
