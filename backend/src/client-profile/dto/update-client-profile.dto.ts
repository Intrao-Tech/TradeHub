import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateClientProfileDto {
  @ApiPropertyOptional({ example: 'John Smith', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  display_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: 'London', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'SW1', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postcode_area?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar_url?: string;
}
