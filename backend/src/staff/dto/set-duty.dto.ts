import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetDutyDto {
  @ApiProperty({
    description:
      'true = on duty (eligible for new doc assignments), false = off duty (open docs auto-reassigned to the next available staff).',
  })
  @IsBoolean()
  on_duty: boolean;
}
