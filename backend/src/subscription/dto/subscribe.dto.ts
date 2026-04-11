import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class SubscribeDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  plan_id!: number;
}
