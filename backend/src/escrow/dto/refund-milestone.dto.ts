import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefundMilestoneDto {
  @ApiProperty({
    minLength: 10,
    maxLength: 500,
    example: 'Project scope changed; mutual agreement to refund.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
