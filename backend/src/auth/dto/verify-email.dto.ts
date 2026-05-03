import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class SendVerifyEmailDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;
}

export class ConfirmVerifyEmailDto {
  @ApiProperty({ description: 'Token from the verification link' })
  @IsString()
  @MaxLength(256)
  token: string;
}
