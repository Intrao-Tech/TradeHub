import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({ example: 'jane.moderator@tradehub.co.uk' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Jane Moderator' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  display_name: string;

  @ApiProperty({ enum: ['ADMIN', 'MODERATOR'], example: 'MODERATOR' })
  @IsIn(['ADMIN', 'MODERATOR'])
  staff_role: 'ADMIN' | 'MODERATOR';
}
