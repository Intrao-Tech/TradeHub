import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export const DOCUMENT_DOC_TYPES = [
  'ID_PHOTO',
  'SELFIE',
  'INSURANCE',
  'CSCS_CARD',
  'GAS_SAFE_CERT',
  'NICEIC_CERT',
  'COMPANY_LETTERHEAD',
  'PROJECT_PHOTO',
  'OTHER',
] as const;

export class UploadDocumentDto {
  @ApiProperty({
    enum: DOCUMENT_DOC_TYPES,
    example: 'ID_PHOTO',
  })
  @IsString()
  @IsIn([...DOCUMENT_DOC_TYPES])
  doc_type: string;
}
