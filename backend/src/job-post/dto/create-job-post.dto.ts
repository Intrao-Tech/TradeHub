import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateJobPostDto {
  @ApiProperty()
  @IsString()
  title: string;

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

  @ApiProperty()
  @IsIn(['DAY_RATE', 'FIXED_PRICE'])
  pay_type: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  specialisation_ids?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  tag_ids?: number[];
}
