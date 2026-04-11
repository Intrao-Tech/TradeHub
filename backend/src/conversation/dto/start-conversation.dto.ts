import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StartConversationDto {
  @ApiProperty({ description: 'Other participant account id' })
  @Type(() => Number)
  @IsInt()
  recipient_id: number;

  @ApiProperty({ description: 'First message body' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  message: string;

  @ApiPropertyOptional({ default: 'TEXT' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  message_type?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { job_post_id: 123 },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
