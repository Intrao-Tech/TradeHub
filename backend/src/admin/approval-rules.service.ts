import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ADMIN_ACTIONS,
  APPROVAL_CONDITION_TYPES,
  type AdminActionCode,
  type ApprovalConditionTypeName,
} from './admin-action.types';
import type {
  CreateApprovalRuleDto,
  UpdateApprovalRuleDto,
  RuleConditionInput,
} from './dto/create-approval-rule.dto';

/**
 * Which condition kinds can possibly match each action. Mirrors the
 * frontend filter — kept here so a hand-crafted API call can't sneak in a
 * silently-broken rule (e.g. AMOUNT_GT on USER_SUSPEND, which would never
 * fire because USER_SUSPEND never populates context.amount_pence).
 */
const ACTION_COMPATIBLE_CONDITIONS: Record<AdminActionCode, ApprovalConditionTypeName[]> = {
  [ADMIN_ACTIONS.ESCROW_FORCE_RELEASE]: ['AMOUNT_GT', 'REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.ESCROW_FORCE_REFUND]:  ['AMOUNT_GT', 'REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.ESCROW_FORCE_CANCEL]:  ['AMOUNT_GT', 'REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.PAYMENT_MARK_PAID]:    ['AMOUNT_GT', 'REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.PAYMENT_MARK_FAILED]:  ['AMOUNT_GT', 'REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.PAYMENT_RETRY_TRANSFER]: ['AMOUNT_GT', 'REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.VERIFICATION_DOC_APPROVE]: ['DOCUMENT_TYPE_EQUALS', 'REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.VERIFICATION_DOC_REJECT]:  ['DOCUMENT_TYPE_EQUALS', 'REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.VERIFICATION_LEVEL_OVERRIDE]: ['REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.USER_SUSPEND]:    ['REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.USER_UNSUSPEND]:  ['REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.USER_DELETE]:     ['REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.PLATFORM_SETTING_UPDATE]: ['REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.STAFF_INVITE]:      ['REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.STAFF_ROLE_GRANT]:  ['REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.STAFF_ROLE_REVOKE]: ['REQUESTING_STAFF_HAS_ROLE'],
  [ADMIN_ACTIONS.BROADCAST_MESSAGE]: ['REQUESTING_STAFF_HAS_ROLE'],
};

@Injectable()
export class ApprovalRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates an approval rule + its conditions (subtype rows) atomically.
   * The DEFERRED trigger `approval_condition_must_have_subtype` checks that
   * every condition has a matching subtype row at commit time.
   */
  async create(
    dto: CreateApprovalRuleDto,
    createdByStaffId: bigint,
    ip?: string,
  ) {
    if (!dto.conditions.length) {
      throw new BadRequestException({
        code: 'NO_CONDITIONS',
        message: 'At least one condition is required.',
      });
    }

    // Reject conditions that can't match the chosen action — these are
    // silently-broken rules (would never fire and create false security).
    const allowed = new Set(
      ACTION_COMPATIBLE_CONDITIONS[dto.target_action as AdminActionCode] ?? [],
    );
    if (allowed.size > 0) {
      const incompatible = dto.conditions
        .map((c) => c.type)
        .filter((t) => !allowed.has(t as ApprovalConditionTypeName));
      if (incompatible.length > 0) {
        throw new BadRequestException({
          code: 'INCOMPATIBLE_CONDITION',
          message: `Action ${dto.target_action} cannot use condition(s): ${[...new Set(incompatible)].join(', ')}. Allowed: ${[...allowed].join(', ') || '(none)'}.`,
        });
      }
    }

    // Resolve lookups upfront
    const actionType = await this.prisma.adminActionType.findUniqueOrThrow({
      where: { name: dto.target_action },
    });
    const approverRole = await this.prisma.staffRole.findUniqueOrThrow({
      where: { name: dto.required_approver_role },
    });

    const rule = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staffApprovalRule.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          target_action_type_id: actionType.id,
          required_approver_role_id: approverRole.id,
          is_active: dto.is_active ?? true,
          created_by_staff_id: createdByStaffId,
        },
      });

      for (const cond of dto.conditions) {
        await this.insertCondition(tx, created.id, cond);
      }

      return created;
    });

    await this.audit.log(
      createdByStaffId,
      'admin.approval_rule.created',
      'staff_approval_rule',
      rule.id,
      {
        name: dto.name,
        target_action: dto.target_action,
        approver_role: dto.required_approver_role,
        condition_count: dto.conditions.length,
      },
      ip,
    );

    return this.getById(rule.id);
  }

  private async insertCondition(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    ruleId: bigint,
    cond: RuleConditionInput,
  ) {
    const conditionTypeName = cond.type as ApprovalConditionTypeName;
    const conditionType = await tx.approvalConditionType.findUniqueOrThrow({
      where: { name: conditionTypeName },
    });

    const condRow = await tx.staffApprovalRuleCondition.create({
      data: {
        rule_id: ruleId,
        condition_type_id: conditionType.id,
      },
    });

    // Insert matching subtype row (shared PK with parent)
    if (cond.type === APPROVAL_CONDITION_TYPES.AMOUNT_GT) {
      if (typeof cond.threshold_pence !== 'number' || cond.threshold_pence < 1) {
        throw new BadRequestException({
          code: 'INVALID_CONDITION',
          message: 'AMOUNT_GT requires positive integer threshold_pence.',
        });
      }
      await tx.approvalConditionAmount.create({
        data: {
          id: condRow.id,
          threshold_pence: BigInt(Math.floor(cond.threshold_pence)),
        },
      });
    } else if (cond.type === APPROVAL_CONDITION_TYPES.REQUESTING_STAFF_HAS_ROLE) {
      if (
        cond.staff_role_name !== 'ADMIN' &&
        cond.staff_role_name !== 'STAFF'
      ) {
        throw new BadRequestException({
          code: 'INVALID_CONDITION',
          message:
            "REQUESTING_STAFF_HAS_ROLE requires staff_role_name 'ADMIN' or 'STAFF'.",
        });
      }
      const role = await tx.staffRole.findUniqueOrThrow({
        where: { name: cond.staff_role_name },
      });
      await tx.approvalConditionRole.create({
        data: { id: condRow.id, staff_role_id: role.id },
      });
    } else if (cond.type === APPROVAL_CONDITION_TYPES.DOCUMENT_TYPE_EQUALS) {
      if (typeof cond.document_type !== 'string' || !cond.document_type.trim()) {
        throw new BadRequestException({
          code: 'INVALID_CONDITION',
          message: 'DOCUMENT_TYPE_EQUALS requires a non-empty document_type.',
        });
      }
      await tx.approvalConditionDocType.create({
        data: { id: condRow.id, document_type: cond.document_type.trim() },
      });
    } else {
      throw new BadRequestException({
        code: 'UNKNOWN_CONDITION_TYPE',
        message: `Unknown condition type '${cond.type}'.`,
      });
    }
  }

  async list() {
    const rules = await this.prisma.staffApprovalRule.findMany({
      orderBy: { created_at: 'desc' },
      include: this.fullInclude,
    });
    return rules.map((r) => this.serialize(r));
  }

  async getById(id: bigint) {
    const rule = await this.prisma.staffApprovalRule.findUnique({
      where: { id },
      include: this.fullInclude,
    });
    if (!rule) {
      throw new NotFoundException({ code: 'RULE_NOT_FOUND' });
    }
    return this.serialize(rule);
  }

  async update(
    id: bigint,
    dto: UpdateApprovalRuleDto,
    byStaffId: bigint,
    ip?: string,
  ) {
    const before = await this.prisma.staffApprovalRule.findUnique({
      where: { id },
      include: {
        conditions: {
          include: { condition_type: { select: { name: true } } },
        },
      },
    });
    if (!before) throw new NotFoundException({ code: 'RULE_NOT_FOUND' });

    await this.prisma.$transaction(async (tx) => {
      await tx.staffApprovalRule.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          description: dto.description ?? undefined,
          is_active: dto.is_active ?? undefined,
        },
      });

      if (dto.conditions) {
        // Values-only update: provided types must be exactly the set the
        // rule already has. Adding / removing / retyping conditions still
        // requires creating a new rule.
        const existingByType = new Map(
          before.conditions.map((c) => [c.condition_type.name, c]),
        );
        const providedTypes = new Set(dto.conditions.map((c) => c.type));
        if (
          providedTypes.size !== existingByType.size ||
          [...providedTypes].some((t) => !existingByType.has(t))
        ) {
          throw new BadRequestException({
            code: 'CONDITION_TYPES_IMMUTABLE',
            message:
              'Condition types must match exactly. Deactivate the rule and create a new one to add or remove conditions.',
            existing: [...existingByType.keys()],
            provided: [...providedTypes],
          });
        }

        for (const cond of dto.conditions) {
          const existing = existingByType.get(cond.type)!;
          if (cond.type === APPROVAL_CONDITION_TYPES.AMOUNT_GT) {
            if (
              typeof cond.threshold_pence !== 'number' ||
              cond.threshold_pence < 1
            ) {
              throw new BadRequestException({
                code: 'INVALID_CONDITION',
                message: 'AMOUNT_GT requires positive integer threshold_pence.',
              });
            }
            await tx.approvalConditionAmount.update({
              where: { id: existing.id },
              data: {
                threshold_pence: BigInt(Math.floor(cond.threshold_pence)),
              },
            });
          } else if (
            cond.type === APPROVAL_CONDITION_TYPES.REQUESTING_STAFF_HAS_ROLE
          ) {
            if (
              cond.staff_role_name !== 'ADMIN' &&
              cond.staff_role_name !== 'STAFF'
            ) {
              throw new BadRequestException({
                code: 'INVALID_CONDITION',
                message:
                  "REQUESTING_STAFF_HAS_ROLE requires staff_role_name 'ADMIN' or 'STAFF'.",
              });
            }
            const role = await tx.staffRole.findUniqueOrThrow({
              where: { name: cond.staff_role_name },
            });
            await tx.approvalConditionRole.update({
              where: { id: existing.id },
              data: { staff_role_id: role.id },
            });
          } else if (
            cond.type === APPROVAL_CONDITION_TYPES.DOCUMENT_TYPE_EQUALS
          ) {
            if (
              typeof cond.document_type !== 'string' ||
              !cond.document_type.trim()
            ) {
              throw new BadRequestException({
                code: 'INVALID_CONDITION',
                message:
                  'DOCUMENT_TYPE_EQUALS requires a non-empty document_type.',
              });
            }
            await tx.approvalConditionDocType.update({
              where: { id: existing.id },
              data: { document_type: cond.document_type.trim() },
            });
          }
        }
      }
    });

    await this.audit.log(
      byStaffId,
      'admin.approval_rule.updated',
      'staff_approval_rule',
      id,
      {
        changed_fields: Object.keys(dto),
        conditions_updated: dto.conditions ? dto.conditions.length : 0,
      },
      ip,
    );

    return this.getById(id);
  }

  async deactivate(id: bigint, byStaffId: bigint, ip?: string) {
    const rule = await this.prisma.staffApprovalRule.findUnique({
      where: { id },
    });
    if (!rule) throw new NotFoundException({ code: 'RULE_NOT_FOUND' });

    await this.prisma.staffApprovalRule.update({
      where: { id },
      data: { is_active: false },
    });

    await this.audit.log(
      byStaffId,
      'admin.approval_rule.deactivated',
      'staff_approval_rule',
      id,
      { name: rule.name },
      ip,
    );

    return { ok: true };
  }

  private get fullInclude() {
    return {
      target_action_type: true,
      required_approver_role: true,
      created_by: { select: { id: true, display_name: true } },
      conditions: {
        include: {
          condition_type: true,
          amount: true,
          role: { include: { staff_role: { select: { name: true } } } },
          doc_type: true,
        },
      },
    } as const;
  }

  private serialize(
    r: Awaited<ReturnType<ApprovalRulesService['getByIdRaw']>>,
  ) {
    return {
      id: r.id.toString(),
      name: r.name,
      description: r.description,
      target_action: r.target_action_type.name,
      required_approver_role: r.required_approver_role.name,
      is_active: r.is_active,
      created_by: {
        id: r.created_by.id.toString(),
        display_name: r.created_by.display_name,
      },
      created_at: r.created_at,
      updated_at: r.updated_at,
      conditions: r.conditions.map((c) => {
        const base = {
          id: c.id.toString(),
          type: c.condition_type.name,
        };
        if (c.amount) {
          return {
            ...base,
            threshold_pence: c.amount.threshold_pence.toString(),
          };
        }
        if (c.role) {
          return {
            ...base,
            staff_role_name: c.role.staff_role.name,
          };
        }
        if (c.doc_type) {
          return { ...base, document_type: c.doc_type.document_type };
        }
        return base;
      }),
    };
  }

  // Internal: helper used only to derive the raw type for serialize().
  private async getByIdRaw(id: bigint) {
    return this.prisma.staffApprovalRule.findUniqueOrThrow({
      where: { id },
      include: this.fullInclude,
    });
  }
}
