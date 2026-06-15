import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMilestoneDto {
  @ApiProperty({ example: 'Foundation work', minLength: 3, maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: '500.00', description: 'GBP amount, ≥ 5.00' })
  @IsNumberString()
  amount: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Position in contract (auto-assigned if omitted)',
  })
  @IsOptional()
  @IsInt()
  position?: number;

  @ApiPropertyOptional({
    example: 'Strip out walls + lay slab.',
    description: 'Free-text scope detail visible to both parties (≤ 2000).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    example: '400.00',
    description:
      'CIS: labour portion of the amount (the part a CIS deduction applies to). Optional — when omitted the whole amount is treated as labour.',
  })
  @IsOptional()
  @IsNumberString()
  labour_amount?: string;

  @ApiPropertyOptional({
    example: '100.00',
    description:
      'CIS: materials portion of the amount (never subject to a CIS deduction). Optional, defaults to 0.',
  })
  @IsOptional()
  @IsNumberString()
  materials_amount?: string;
}
