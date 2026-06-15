import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

/** Identify the UK CIS tax month to aggregate a CIS300 return for (V2). */
export class BuildReturnDto {
  @ApiProperty({ description: 'Tax year the month started in (e.g. 2026 = 2026/27).' })
  @IsInt()
  @Min(2000)
  @Max(2100)
  tax_year!: number;

  @ApiProperty({ description: 'CIS tax month index 1..12 (April = 1).' })
  @IsInt()
  @Min(1)
  @Max(12)
  tax_month!: number;
}
