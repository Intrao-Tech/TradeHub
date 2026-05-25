import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ADMIN_ACTIONS, APPROVAL_CONDITION_TYPES } from '../admin-action.types';

/**
 * Loose shape — the union of three condition shapes:
 *   { type: 'AMOUNT_GT', threshold_pence: number }
 *   { type: 'REQUESTING_STAFF_HAS_ROLE', staff_role_name: 'ADMIN' | 'STAFF' }
 *   { type: 'DOCUMENT_TYPE_EQUALS', document_type: string }
 *
 * class-validator's discriminator union runs every subtype validator against
 * every array item, which produces noisy "type must be one of …" errors when
 * the array mixes condition kinds. We accept it as `Record<string, unknown>`
 * here and dispatch per-shape inside ApprovalRulesService.insertCondition.
 */
export type RuleConditionInput = {
  type: string;
  threshold_pence?: number;
  staff_role_name?: 'ADMIN' | 'STAFF';
  document_type?: string;
};

export class CreateApprovalRuleDto {
  @ApiProperty({ example: 'Big refunds need second approval' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false, example: 'Anything > £500 must go through admin' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: Object.values(ADMIN_ACTIONS) })
  @IsIn(Object.values(ADMIN_ACTIONS))
  target_action: string;

  @ApiProperty({ enum: ['ADMIN', 'STAFF'], example: 'ADMIN' })
  @IsIn(['ADMIN', 'STAFF'])
  required_approver_role: 'ADMIN' | 'STAFF';

  @ApiProperty({
    type: 'array',
    description:
      'Conditions (ANDed). At least one required. Each entry is one of: ' +
      "{ type: 'AMOUNT_GT', threshold_pence }, " +
      "{ type: 'REQUESTING_STAFF_HAS_ROLE', staff_role_name }, " +
      "{ type: 'DOCUMENT_TYPE_EQUALS', document_type }.",
  })
  @IsArray()
  @ArrayMinSize(1)
  conditions: RuleConditionInput[];

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateApprovalRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  /**
   * Optional. When provided, must match the rule's existing condition types
   * 1:1 (same set, no additions or removals). Values are updated in place
   * (e.g. change AMOUNT_GT threshold from £500 to £1000). Changing types,
   * adding or removing conditions still requires deactivating and creating
   * a new rule.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  conditions?: RuleConditionInput[];
}

export const APPROVAL_CONDITION_NAMES = Object.values(APPROVAL_CONDITION_TYPES);
