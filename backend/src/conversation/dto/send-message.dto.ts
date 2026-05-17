import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SendMessageDto {
  @ApiPropertyOptional({
    description: 'Text body / caption. Required unless a file is attached.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  content?: string;

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

  // Inline file columns. The message_attachment table was dropped — an
  // IMAGE/FILE message carries its file directly on the message row.
  @ApiPropertyOptional({
    description: 'Uploaded file URL for an IMAGE/FILE message.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  file_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  original_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mime_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  size_bytes?: number;
}
