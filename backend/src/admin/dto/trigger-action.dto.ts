import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ADMIN_ACTIONS,
  ADMIN_TARGET_KINDS,
  type AdminActionCode,
  type AdminTargetKind,
} from '../admin-action.types';

/**
 * Body for POST /admin/actions — request execution of any admin action.
 * Approval engine decides whether it runs immediately or is queued.
 */
export class TriggerActionDto {
  @ApiProperty({ enum: Object.values(ADMIN_ACTIONS) })
  @IsIn(Object.values(ADMIN_ACTIONS))
  action: AdminActionCode;

  @ApiProperty({ enum: Object.values(ADMIN_TARGET_KINDS) })
  @IsIn(Object.values(ADMIN_TARGET_KINDS))
  target_kind: AdminTargetKind;

  @ApiProperty({ example: '123', description: 'Target row id (stringified bigint)' })
  @IsString()
  target_id: string;

  @ApiProperty({ example: 'Customer complaint #4827' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;

  // Optional convenience fields commonly required by specific actions —
  // they're merged into the action context when present. Validators here
  // keep the contract loose; the dispatcher re-validates per action.

  @ApiPropertyOptional({ example: 50000, description: 'Amount in pence' })
  @IsOptional()
  @IsInt()
  @Min(0)
  amount_pence?: number;

  @ApiPropertyOptional({ example: 'PASSPORT' })
  @IsOptional()
  @IsString()
  doc_type?: string;
}
