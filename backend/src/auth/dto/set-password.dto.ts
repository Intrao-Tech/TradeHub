import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SetPasswordDto {
  @ApiProperty({
    description:
      'Initial password for an OAuth-only account (8+ chars with upper/lower/digit/special). No current password is required.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  new_password: string;
}
