import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Queue names (must match the `admin_queue_type.name` rows seeded by the
 * admin_panel migration).
 */
export const SLA_QUEUE_NAMES = [
  'DOCUMENT_PENDING',
  'DISPUTE_OPEN',
  'DISPUTE_RESPONDED',
  'PAYMENT_FAILED',
  'PAYMENT_TRANSFER_PENDING',
  'SUPPORT_THREAD_UNANSWERED',
  'APPROVAL_REQUIRED',
] as const;

export class CreateSlaRuleDto {
  @ApiProperty({ example: 'Auto-escalate docs older than 24h' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: SLA_QUEUE_NAMES })
  @IsIn(SLA_QUEUE_NAMES as unknown as string[])
  target_queue: string;

  @ApiProperty({ example: 1440, description: 'Threshold in minutes' })
  @IsInt()
  @Min(1)
  threshold_minutes: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notification_title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notification_body?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateSlaRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  threshold_minutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notification_title?: string;

  @IsOptional()
  @IsString()
  notification_body?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
