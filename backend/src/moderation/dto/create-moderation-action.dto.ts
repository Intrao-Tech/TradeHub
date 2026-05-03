import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const ACTION_TYPES = [
  'ASSIGNED',
  'STARTED',
  'RESOLVED',
  'DISMISSED',
  'ESCALATED',
  'COMMENTED',
] as const;

export class CreateModerationActionDto {
  @ApiProperty({ enum: ACTION_TYPES })
  @IsString()
  @IsIn([...ACTION_TYPES])
  action_type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
