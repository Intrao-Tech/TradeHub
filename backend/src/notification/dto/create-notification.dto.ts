import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Internal payload for creating a notification (not exposed via HTTP). */
export class CreateNotificationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  type!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({ default: 'IN_APP' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  channel?: string;
}
