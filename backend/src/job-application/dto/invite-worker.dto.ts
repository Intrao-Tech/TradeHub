import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class InviteWorkerDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  worker_id: number;

  @ApiPropertyOptional({
    description: 'Optional cover message for the invitation',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;
}
