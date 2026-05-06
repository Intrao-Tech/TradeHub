import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Mixin-style DTO field used by CreateJobPostDto, UpdateJobPostDto, and
 * ApplyJobDto. Validates that the caller passes at most 10 numeric ids.
 *
 * Re-exporting the decorator stack as a constant array keeps the same
 * validation in three places without copy-paste.
 */
export const ATTACHMENT_IDS_FIELD_DECORATORS = [
  ApiPropertyOptional({
    type: [Number],
    description: 'Ids of previously uploaded JobAttachment rows to attach.',
  }),
  IsOptional(),
  IsArray(),
  ArrayMaxSize(10),
  IsInt({ each: true }),
  Type(() => Number),
] as const;

export class AttachmentIdsField {
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Type(() => Number)
  attachment_ids?: number[];
}
