import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password — required to confirm identity',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  current_password: string;

  @ApiProperty({
    description: 'New password (8+ chars with upper/lower/digit/special)',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  new_password: string;

  @ApiPropertyOptional({
    description:
      'Current device refresh token — when present, sessions on OTHER devices are revoked but this one is kept alive.',
  })
  @IsOptional()
  @IsString()
  refresh_token?: string;
}
