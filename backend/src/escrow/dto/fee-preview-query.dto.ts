import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';

export class FeePreviewQueryDto {
  @ApiProperty({
    example: '1000.00',
    description: 'GBP amount to preview breakdown for',
  })
  @IsNumberString()
  amount: string;
}
