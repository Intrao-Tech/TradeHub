import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CONTRACT_STATUS,
  type ContractStatus,
} from '../../contract/contract.constants';

const CONTRACT_FILTER_STATUSES: ContractStatus[] = [
  CONTRACT_STATUS.DRAFT,
  CONTRACT_STATUS.PROPOSED,
  CONTRACT_STATUS.ACTIVE,
  CONTRACT_STATUS.ENDED,
];

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

  @ApiPropertyOptional({
    description: 'Filter by latest contract status under the relationship',
    enum: CONTRACT_FILTER_STATUSES,
  })
  @IsOptional()
  @IsString()
  @IsIn(CONTRACT_FILTER_STATUSES)
  status?: ContractStatus;
}
