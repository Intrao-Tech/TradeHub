import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSpecialisationDto {
  @ApiProperty({ example: 'Electrician' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
