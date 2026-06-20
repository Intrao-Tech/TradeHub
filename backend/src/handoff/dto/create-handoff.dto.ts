import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateHandoffDto {
  @ApiPropertyOptional({
    description:
      'Optional registered worker to target. They receive an in-app ' +
      'notification + email. Omit for an open link you send yourself.',
  })
  @IsOptional()
  @IsNumberString()
  to_worker_id?: string;

  @ApiPropertyOptional({
    description: 'Personal note shown to the recipient on the landing page.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @ApiPropertyOptional({
    description:
      'Keep the W2W referral commission if a hire results (default true).',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  earn_commission?: boolean;
}
