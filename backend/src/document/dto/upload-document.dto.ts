import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export const DOCUMENT_DOC_TYPES = [
  'INSURANCE',
  'CSCS_CARD',
  'GAS_SAFE_CERT',
  'NICEIC_CERT',
  'FIRAS_CERT',
  'COMPANY_LETTERHEAD',
  'RIGHT_TO_WORK_SHARE_CODE',
  'RIGHT_TO_WORK_DOCUMENT',
  'HMRC_CIS_DOCUMENT',
  'OTHER',
] as const;

export class UploadDocumentDto {
  @ApiProperty({
    enum: DOCUMENT_DOC_TYPES,
    example: 'CSCS_CARD',
  })
  @IsString()
  @IsIn([...DOCUMENT_DOC_TYPES])
  doc_type: string;

  @ApiPropertyOptional({
    description:
      'Per-doc-type structured metadata as a JSON string (multipart form field). Required for `RIGHT_TO_WORK_SHARE_CODE` (`{share_code}`) and `HMRC_CIS_DOCUMENT` (`{utr, ni_number}`). Optional for cert types.',
    example: '{"share_code":"W12 ABC 345"}',
  })
  @IsOptional()
  @IsString()
  metadata?: string;
}
