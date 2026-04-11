import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const COLLAB_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'IN_PROGRESS',
  'COMPLETED',
  'DISPUTED',
] as const;

const UPDATE_STATUSES = [
  'CONFIRMED',
  'REJECTED',
  'IN_PROGRESS',
  'COMPLETED',
  'DISPUTED',
] as const;

export class CreateCollaborationDto {
  @ApiPropertyOptional({ description: 'Required when employer initiates' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  worker_id?: number;

  @ApiPropertyOptional({ description: 'Required when worker initiates' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employer_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  project_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  site_postcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  agreed_amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  referral_id?: number;
}

export class UpdateCollaborationStatusDto {
  @ApiProperty({ enum: UPDATE_STATUSES })
  @IsString()
  @IsIn([...UPDATE_STATUSES])
  status: string;
}

export class FlagCollaborationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;
}

export class CollaborationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: COLLAB_STATUSES })
  @IsOptional()
  @IsString()
  @IsIn([...COLLAB_STATUSES])
  status?: string;
}
