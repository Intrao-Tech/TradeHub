import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateJobPostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postcode_area?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  site_address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['DAY_RATE', 'FIXED_PRICE'])
  pay_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  day_rate_min?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  day_rate_max?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  fixed_price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  duration_days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  start_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_urgent?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expires_at?: string;

  @ApiPropertyOptional({ enum: ['DRAFT', 'OPEN', 'CLOSED', 'FILLED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'OPEN', 'CLOSED', 'FILLED'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  specialisation_ids?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  tag_ids?: number[];

  @ApiPropertyOptional({
    type: [Number],
    description:
      'Replaces the post’s attachment list. Rows currently attached but not in this list are detached (cron-swept after 48 h).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  attachment_ids?: number[];
}
