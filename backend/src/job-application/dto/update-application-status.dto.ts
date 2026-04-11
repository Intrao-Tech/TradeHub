import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

const APPLICATION_UPDATE_STATUSES = [
  'REVIEWED',
  'SHORTLISTED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
] as const;

export class UpdateApplicationStatusDto {
  @ApiProperty({ enum: APPLICATION_UPDATE_STATUSES })
  @IsString()
  @IsIn([...APPLICATION_UPDATE_STATUSES])
  status: string;
}
