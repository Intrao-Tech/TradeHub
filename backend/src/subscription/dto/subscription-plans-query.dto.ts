import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class SubscriptionPlansQueryDto {
  @ApiPropertyOptional({
    description: 'If true, only plans with is_active = true',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active_only?: boolean;
}
