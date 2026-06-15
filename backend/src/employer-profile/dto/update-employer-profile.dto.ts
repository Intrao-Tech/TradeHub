import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateEmployerProfileDto {
  @ApiPropertyOptional({ example: 'Acme Builders Ltd', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company_name?: string;

  @ApiPropertyOptional({ example: '12345678', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  company_number?: string;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(32767)
  team_size?: number;

  @ApiPropertyOptional({
    description:
      'CIS: declare this employer is a Construction Industry Scheme contractor (a construction business that operates CIS). Drives whether CIS applies to their jobs.',
  })
  @IsOptional()
  @IsBoolean()
  is_cis_contractor?: boolean;
}
