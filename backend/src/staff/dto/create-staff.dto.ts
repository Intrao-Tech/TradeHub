import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({ example: 'jane.staff@tradehub.co.uk' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Jane Staff' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  display_name: string;

  @ApiProperty({
    example: 'STAFF',
    description:
      'Any role name from staff_role. Built-in: ADMIN, STAFF. Custom roles can be created via /admin/roles.',
  })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/, {
    message: 'staff_role must be UPPER_SNAKE_CASE',
  })
  staff_role: string;
}
