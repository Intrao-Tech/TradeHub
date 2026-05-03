import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password — required to confirm identity' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  current_password: string;

  @ApiProperty({ description: 'New password (8+ chars with upper/lower/digit/special)' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  new_password: string;
}
