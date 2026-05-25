import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SendSupportMessageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @ApiPropertyOptional()
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
  @IsInt()
  @Min(0)
  size_bytes?: number;

  @ApiPropertyOptional({ enum: ['TEXT', 'IMAGE', 'FILE'] })
  @IsOptional()
  @IsIn(['TEXT', 'IMAGE', 'FILE'])
  message_type?: 'TEXT' | 'IMAGE' | 'FILE';
}

export class AssignSupportThreadDto {
  @ApiPropertyOptional({
    description: 'Staff member id to assign, or null to unassign',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  assignee_staff_id?: string | null;
}
