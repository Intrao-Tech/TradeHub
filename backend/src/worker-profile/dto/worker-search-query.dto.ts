import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class WorkerSearchQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by specialisation id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  specialisation_id?: number;

  @ApiPropertyOptional({ description: 'Minimum average rating' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  min_rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  is_available?: boolean;

  @ApiPropertyOptional({ example: 'SW1' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postcode_area?: string;

  @ApiPropertyOptional({
    description:
      'Budget range lower bound; workers whose day_rate_max is null or >= this value match',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  day_rate_min?: number;

  @ApiPropertyOptional({
    description:
      'Budget range upper bound; workers whose day_rate_min is null or <= this value match',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  day_rate_max?: number;
}
