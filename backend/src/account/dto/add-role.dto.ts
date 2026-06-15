import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Add the second marketplace role to the current account (Upwork-style
 * dual-role). Registration creates exactly one profile; this lets a worker
 * add an employer cabinet (and vice versa) without a new account.
 */
export class AddRoleDto {
  @ApiProperty({
    enum: ['WORKER', 'EMPLOYER'],
    description: 'The role/cabinet to add to this account.',
  })
  @IsIn(['WORKER', 'EMPLOYER'])
  role!: 'WORKER' | 'EMPLOYER';

  @ApiPropertyOptional({
    description: 'Company name — optional, only meaningful when adding EMPLOYER.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company_name?: string;
}
