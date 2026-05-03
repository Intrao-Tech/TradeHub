import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SendVerifyEmailDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;
}

export class ConfirmVerifyEmailDto {
  @ApiProperty({ description: 'Token from the verification link' })
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  token: string;
}
