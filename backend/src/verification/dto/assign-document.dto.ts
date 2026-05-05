import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignDocumentDto {
  @ApiProperty({
    description:
      'Target staff_member id, or null to clear the assignment (back to unassigned bucket).',
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  staff_member_id?: number | null;
}
