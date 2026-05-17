import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumberString, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class FeePreviewQueryDto {
  @ApiProperty({
    example: '1000.00',
    description: 'GBP amount to preview breakdown for',
  })
  @IsNumberString()
  amount: string;

  @ApiPropertyOptional({
    description: 'Whether this collab has a referrer (affects breakdown)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  has_referral?: boolean;
}
