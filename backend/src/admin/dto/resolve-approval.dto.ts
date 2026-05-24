import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApproveApprovalDto {
  @ApiProperty({ required: false, example: 'Verified with finance' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class RejectApprovalDto {
  @ApiProperty({ example: 'Requestor used wrong supplier' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason: string;
}
