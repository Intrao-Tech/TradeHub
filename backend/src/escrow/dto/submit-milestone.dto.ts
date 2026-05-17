import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
