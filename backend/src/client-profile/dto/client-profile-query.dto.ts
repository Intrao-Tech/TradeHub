import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ClientProfileQueryDto {
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

  @ApiPropertyOptional({ example: 'SW1' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postcode_area?: string;

  @ApiPropertyOptional({ example: 'UNVERIFIED' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  verification_level?: string;

  @ApiPropertyOptional({ description: 'Case-insensitive contains on display_name' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;
}
