import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ProposeResolutionDto {
  @ApiProperty({ example: 60, description: '0..100' })
  @IsInt()
  @Min(0)
  @Max(100)
  worker_pct: number;

  @ApiProperty({ example: 40, description: '0..100; must sum to 100 with worker_pct' })
  @IsInt()
  @Min(0)
  @Max(100)
  employer_refund_pct: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  keep_platform_fee: boolean;

  @ApiProperty({
    example: 'Worker delivered ~60% of scope per chat evidence; employer concerns partially valid.',
    description: '≥30 chars (audit-logged + shown to parties)',
  })
  @IsString()
  @MinLength(30)
  @MaxLength(2000)
  reasoning: string;
}

export class DecideProposalDto {
  @ApiProperty({ enum: ['ACCEPT', 'REJECT'] })
  @IsIn(['ACCEPT', 'REJECT'])
  decision: 'ACCEPT' | 'REJECT';

  @ApiPropertyOptional({ description: 'Optional note shown to other party + staff' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class EscalateDisputeDto {
  @ApiProperty({
    example:
      'Worker rejected proposal twice; positions still ~30 pp apart; cannot mediate further.',
    description: '≥10 chars',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;
}
