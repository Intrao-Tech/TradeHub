import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CIS_MODES, type CisMode } from '../cis.constants';

export class SetModeDto {
  @ApiProperty({ enum: CIS_MODES, example: 'ASSIST' })
  @IsIn([...CIS_MODES])
  mode: CisMode;
}
