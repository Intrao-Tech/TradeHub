import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class LinkSpecialisationDto {
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}
