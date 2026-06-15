import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CIS_STATUSES, type CisStatus } from '../cis.constants';

/** Staff confirmation of a worker's CIS standing (manual HMRC review). */
export class ConfirmCisDto {
  @ApiProperty({ enum: CIS_STATUSES })
  @IsIn([...CIS_STATUSES])
  status!: CisStatus;

  @ApiPropertyOptional({
    description: 'HMRC verification number (V + 10 digits) — optional in V1.',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  verification_number?: string;
}
