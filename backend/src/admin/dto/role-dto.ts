import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'FINANCE_REVIEWER' })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string' },
    description: 'Permission keys to grant immediately (can be edited later).',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  permission_keys?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class SetRolePermissionsDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string' },
    description: 'Full replacement set of permission keys for the role.',
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  permission_keys: string[];
}
