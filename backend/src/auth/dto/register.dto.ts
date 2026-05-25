import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsIn,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPass1!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'WORKER', enum: ['WORKER', 'EMPLOYER'] })
  @IsIn(['WORKER', 'EMPLOYER'])
  role: 'WORKER' | 'EMPLOYER';

  // ── WORKER fields ─────────────────────────────────────────
  @ApiProperty({
    example: 'John',
    required: false,
    description: 'Required when role=WORKER',
  })
  @ValidateIf((o: { role?: string }) => o.role === 'WORKER')
  @IsString()
  @MinLength(1)
  @MaxLength(75)
  first_name?: string;

  @ApiProperty({
    example: 'Smith',
    required: false,
    description: 'Required when role=WORKER',
  })
  @ValidateIf((o: { role?: string }) => o.role === 'WORKER')
  @IsString()
  @MinLength(1)
  @MaxLength(75)
  surname?: string;

  // ── EMPLOYER fields ───────────────────────────────────────
  @ApiProperty({
    example: 'Acme Build Ltd',
    required: false,
    description:
      'Required when role=EMPLOYER. Used for both client_profile.display_name and employer_profile.company_name.',
  })
  @ValidateIf((o: { role?: string }) => o.role === 'EMPLOYER')
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  company_name?: string;

  // ── Optional ──────────────────────────────────────────────
  @ApiProperty({ example: '+447911123456', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  /**
   * Account-referral attribution at signup. The frontend reads `?ref=CODE`
   * from the URL (after a redirect from `GET /r/:code`) and forwards it
   * here. Invalid or self-referencing codes are silently ignored. Locked
   * at signup — never reassigned.
   */
  @ApiProperty({ example: 'MIKE-A1B2', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  referred_by_code?: string;
}
