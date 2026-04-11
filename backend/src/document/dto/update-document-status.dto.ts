import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export const DOCUMENT_STATUS_UPDATES = [
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
] as const;

export class UpdateDocumentStatusDto {
  @ApiProperty({
    enum: DOCUMENT_STATUS_UPDATES,
    example: 'IN_REVIEW',
  })
  @IsString()
  @IsIn([...DOCUMENT_STATUS_UPDATES])
  status: string;
}
