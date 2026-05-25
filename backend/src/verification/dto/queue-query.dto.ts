import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const ASSIGNMENT_FILTERS = ['mine', 'unassigned', 'all'] as const;

export class QueueQueryDto {
  @ApiPropertyOptional({
    description:
      'Comma-separated subset of PENDING / IN_REVIEW / APPROVED / REJECTED. Default: PENDING,IN_REVIEW.',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by document type (e.g. CSCS_CARD).',
  })
  @IsOptional()
  @IsString()
  doc_type?: string;

  @ApiPropertyOptional({ enum: ASSIGNMENT_FILTERS, default: 'mine' })
  @IsOptional()
  @IsIn([...ASSIGNMENT_FILTERS])
  assignment?: (typeof ASSIGNMENT_FILTERS)[number];

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
}

export type QueueAssignmentFilter = (typeof ASSIGNMENT_FILTERS)[number];
