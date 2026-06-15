import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateMilestoneDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'GBP amount, ≥ 5.00' })
  @IsOptional()
  @IsNumberString()
  amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  position?: number;

  @ApiPropertyOptional({
    description: 'Pass empty string to clear; ≤ 2000 chars.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description:
      'CIS: labour portion of the amount. Pass empty string to clear (whole amount treated as labour).',
  })
  @IsOptional()
  @IsString()
  labour_amount?: string;

  @ApiPropertyOptional({
    description:
      'CIS: materials portion of the amount (never deducted). Pass empty string to clear (0).',
  })
  @IsOptional()
  @IsString()
  materials_amount?: string;
}
