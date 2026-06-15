import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SubmitMilestoneDto {
  @ApiPropertyOptional({
    description:
      'Optional message to the employer (e.g. "Photos in chat, ready for review").',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiPropertyOptional({
    description:
      'CIS: cost of materials the worker supplied for this milestone (excluded from the CIS deduction). Declared at submission when actual costs are known. Optional — omitted/0 means the whole amount is labour. Must be ≤ the milestone amount.',
  })
  @IsOptional()
  @IsNumberString()
  materials_amount?: string;
}
