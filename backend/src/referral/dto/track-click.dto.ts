import { IsIn, IsString, Length, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';
import { REFERRAL_CODE_REGEX } from '../referral.constants';

export class TrackClickDto {
  @IsString()
  @Length(9, 16)
  @Matches(REFERRAL_CODE_REGEX, { message: 'Invalid referral code format' })
  code!: string;

  @Type(() => Number)
  @IsInt()
  target_id!: number;

  @IsIn(['WORKER', 'EMPLOYER'])
  target_role!: 'WORKER' | 'EMPLOYER';
}
