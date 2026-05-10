import {
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateContractDto {
  @IsString()
  @Length(1, 100)
  project_type!: string;

  @IsOptional()
  @IsString()
  @Length(1, 10)
  site_postcode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  agreed_amount?: number;

  @IsIn(['WORKER', 'EMPLOYER'])
  initiated_by!: 'WORKER' | 'EMPLOYER';

  @IsOptional()
  @Type(() => Number)
  job_post_id?: number;
}
