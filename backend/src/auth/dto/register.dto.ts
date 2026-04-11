import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsIn,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecureP@ss123' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @ApiProperty({ example: 'John Smith' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  display_name: string;

  @ApiProperty({ example: 'WORKER', enum: ['WORKER', 'EMPLOYER'] })
  @IsIn(['WORKER', 'EMPLOYER'])
  role: 'WORKER' | 'EMPLOYER';

  @ApiProperty({ example: '+447911123456', required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}
