import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateReferralOfferDto {
  @ApiProperty({ description: 'Worker profile id (same as client_profile id)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  recipient_id!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
