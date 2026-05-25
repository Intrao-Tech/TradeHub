import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class FileDisputeDto {
  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;
}

export class RespondDisputeDto {
  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  response: string;

  @ApiProperty({ enum: ['accept', 'reject'] })
  @IsString()
  resolution: 'accept' | 'reject';
}

export class ResolveDisputeDto {
  @ApiProperty({ minimum: 0, maximum: 100, description: 'Worker share %' })
  @IsInt()
  @Min(0)
  @Max(100)
  worker_pct: number;

  @ApiProperty({
    minimum: 0,
    maximum: 100,
    description: 'Employer refund share %',
  })
  @IsInt()
  @Min(0)
  @Max(100)
  employer_refund_pct: number;

  @ApiProperty({ description: 'Whether platform keeps its fee on resolution' })
  @IsBoolean()
  platform_kept_fee: boolean;

  @ApiProperty({ minLength: 30, maxLength: 2000 })
  @IsString()
  @MinLength(30)
  @MaxLength(2000)
  reasoning: string;
}

export class CancelEscrowDto {
  @ApiProperty({ minLength: 5, maxLength: 500 })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
