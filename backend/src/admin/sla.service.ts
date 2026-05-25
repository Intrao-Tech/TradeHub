import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import {
  CreateSlaRuleDto,
  UpdateSlaRuleDto,
} from './dto/create-sla-rule.dto';
import { ADMIN_TARGET_KINDS, type AdminTargetKind } from './admin-action.types';

/**
 * Default escalation behaviour: every breach pings the assignee (if any) AND
 * all active ADMINs. SLA rules don't need a `notify_role` field — the admin
 * audience is implicit.
 */
const ADMIN_ROLE_NAME = 'ADMIN';

interface BreachCandidate {
  target_kind: AdminTargetKind;
  target_id: bigint;
  assigned_to_staff_id?: bigint | null;
  age_minutes: number;
}

/**
 * Cron-driven SLA engine. Each queue type maps to a SQL probe that selects
 * rows older than the rule's threshold; the sweep emits notifications + a
 * staff_sla_breach row (UNIQUE on rule+target prevents double-notify).
 */
@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // ─── CRUD ───────────────────────────────────────────────────

  async create(dto: CreateSlaRuleDto, byStaffId: bigint, ip?: string) {
    const queue = await this.prisma.adminQueueType.findUnique({
      where: { name: dto.target_queue },
    });
    if (!queue) {
      throw new BadRequestException({
        code: 'UNKNOWN_QUEUE',
        message: `Queue '${dto.target_queue}' is not in admin_queue_type.`,
      });
    }
    const rule = await this.prisma.staffSlaRule.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        target_queue_id: queue.id,
        threshold_minutes: dto.threshold_minutes,
        // notify_role_id stays null in the simplified UX; sweep notifies
        // assignee + all ADMINs unconditionally.
        notify_role_id: null,
        notify_assignee: true,
        notification_title: dto.notification_title ?? null,
        notification_body: dto.notification_body ?? null,
        is_active: dto.is_active ?? true,
        created_by_staff_id: byStaffId,
      },
    });
    await this.audit.log(
      byStaffId,
      'admin.sla_rule.created',
      'staff_sla_rule',
      rule.id,
      { name: dto.name, queue: dto.target_queue, threshold_minutes: dto.threshold_minutes },
      ip,
    );
    return this.getById(rule.id);
  }

  async list() {
    const rows = await this.prisma.staffSlaRule.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        target_queue: true,
        created_by: { select: { id: true, display_name: true } },
      },
    });
    return rows.map((r) => this.serialize(r));
  }

  async getById(id: bigint) {
    const r = await this.prisma.staffSlaRule.findUnique({
      where: { id },
      include: {
        target_queue: true,
        created_by: { select: { id: true, display_name: true } },
      },
    });
    if (!r) throw new NotFoundException({ code: 'SLA_RULE_NOT_FOUND' });
    return this.serialize(r);
  }

  async update(
    id: bigint,
    dto: UpdateSlaRuleDto,
    byStaffId: bigint,
    ip?: string,
  ) {
    const existing = await this.prisma.staffSlaRule.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException({ code: 'SLA_RULE_NOT_FOUND' });

    await this.prisma.staffSlaRule.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        threshold_minutes: dto.threshold_minutes ?? undefined,
        notification_title: dto.notification_title ?? undefined,
        notification_body: dto.notification_body ?? undefined,
        is_active: dto.is_active ?? undefined,
      },
    });
    await this.audit.log(
      byStaffId,
      'admin.sla_rule.updated',
      'staff_sla_rule',
      id,
      { changed_fields: Object.keys(dto) },
      ip,
    );
    return this.getById(id);
  }

  async deactivate(id: bigint, byStaffId: bigint, ip?: string) {
    const r = await this.prisma.staffSlaRule.findUnique({ where: { id } });
    if (!r) throw new NotFoundException({ code: 'SLA_RULE_NOT_FOUND' });
    await this.prisma.staffSlaRule.update({
      where: { id },
      data: { is_active: false },
    });
    await this.audit.log(
      byStaffId,
      'admin.sla_rule.deactivated',
      'staff_sla_rule',
      id,
      { name: r.name },
      ip,
    );
    return { ok: true };
  }

  async listBreaches(activeOnly = true) {
    const rows = await this.prisma.staffSlaBreach.findMany({
      where: activeOnly ? { resolved_at: null } : {},
      orderBy: { detected_at: 'desc' },
      include: {
        rule: { include: { target_queue: true } },
        target_kind: true,
      },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id.toString(),
      rule: {
        id: r.rule.id.toString(),
        name: r.rule.name,
        queue: r.rule.target_queue.name,
        threshold_minutes: r.rule.threshold_minutes,
      },
      target_kind: r.target_kind.name,
      target_id: r.target_id.toString(),
      detected_at: r.detected_at,
      resolved_at: r.resolved_at,
    }));
  }

  // ─── Cron driver ────────────────────────────────────────────

  async runSweep() {
    const start = Date.now();
    const activeRules = await this.prisma.staffSlaRule.findMany({
      where: { is_active: true },
      include: { target_queue: true },
    });

    let totalDetected = 0;
    let totalNotified = 0;

    for (const rule of activeRules) {
      try {
        const candidates = await this.findCandidates(
          rule.target_queue.name,
          rule.threshold_minutes,
        );
        for (const c of candidates) {
          const targetKindRow = await this.prisma.adminTargetKind.findUnique({
            where: { name: c.target_kind },
          });
          if (!targetKindRow) continue;
          try {
            await this.prisma.staffSlaBreach.create({
              data: {
                rule_id: rule.id,
                target_kind_id: targetKindRow.id,
                target_id: c.target_id,
              },
            });
            totalDetected += 1;
            const notified = await this.notifyBreach(rule, c);
            totalNotified += notified;
          } catch (err) {
            // Likely the unique index hit (already breached); ignore quietly.
            if (
              !(err as { code?: string }).code ||
              (err as { code?: string }).code !== 'P2002'
            ) {
              this.logger.warn(
                `Breach insert failed for rule ${rule.id}: ${(err as Error).message}`,
              );
            }
          }
        }
      } catch (err) {
        this.logger.error(
          `SLA rule ${rule.id} (${rule.name}) sweep failed: ${(err as Error).message}`,
        );
      }
    }

    const ms = Date.now() - start;
    this.logger.log(
      `SLA sweep done :: rules=${activeRules.length} detected=${totalDetected} notified=${totalNotified} duration=${ms}ms`,
    );
    return { rules: activeRules.length, detected: totalDetected, notified: totalNotified };
  }

  // ─── Internal: per-queue probes ─────────────────────────────

  private async findCandidates(
    queue: string,
    thresholdMinutes: number,
  ): Promise<BreachCandidate[]> {
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
    switch (queue) {
      case 'DOCUMENT_PENDING': {
        const rows = await this.prisma.reviewItem.findMany({
          where: { status: 'PENDING', created_at: { lt: cutoff } },
          select: {
            id: true,
            assigned_to_staff_id: true,
            created_at: true,
          },
          take: 500,
        });
        return rows.map((r) => ({
          target_kind: ADMIN_TARGET_KINDS.DOCUMENT,
          target_id: r.id,
          assigned_to_staff_id: r.assigned_to_staff_id,
          age_minutes: minutesSince(r.created_at),
        }));
      }
      case 'APPROVAL_REQUIRED': {
        const rows = await this.prisma.staffActionApproval.findMany({
          where: { status: 'PENDING', requested_at: { lt: cutoff } },
          select: {
            id: true,
            target_id: true,
            target_kind: { select: { name: true } },
            requested_at: true,
          },
          take: 500,
        });
        return rows.map((r) => ({
          target_kind: r.target_kind.name as AdminTargetKind,
          target_id: r.id,
          age_minutes: minutesSince(r.requested_at),
        }));
      }
      case 'SUPPORT_THREAD_UNANSWERED': {
        const rows = await this.prisma.supportCollaboration.findMany({
          where: {
            last_message_at: { lt: cutoff, not: null },
          },
          select: {
            id: true,
            assigned_to_staff_id: true,
            last_message_at: true,
            staff_last_read_at: true,
          },
          take: 500,
        });
        return rows
          .filter(
            (r) =>
              r.last_message_at != null &&
              (r.staff_last_read_at == null ||
                r.staff_last_read_at < r.last_message_at),
          )
          .map((r) => ({
            target_kind: ADMIN_TARGET_KINDS.CLIENT_PROFILE,
            target_id: r.id,
            assigned_to_staff_id: r.assigned_to_staff_id,
            age_minutes: minutesSince(r.last_message_at!),
          }));
      }
      case 'DISPUTE_OPEN': {
        const rows = await this.prisma.escrowDispute.findMany({
          where: { status: 'OPEN', created_at: { lt: cutoff } },
          select: {
            id: true,
            assigned_to_staff_id: true,
            created_at: true,
          },
          take: 500,
        });
        return rows.map((r) => ({
          target_kind: ADMIN_TARGET_KINDS.ESCROW_DISPUTE,
          target_id: r.id,
          assigned_to_staff_id: r.assigned_to_staff_id,
          age_minutes: minutesSince(r.created_at),
        }));
      }
      case 'DISPUTE_RESPONDED': {
        const rows = await this.prisma.escrowDispute.findMany({
          where: {
            status: { in: ['RESPONDED', 'MEDIATION'] },
            updated_at: { lt: cutoff },
          },
          select: {
            id: true,
            assigned_to_staff_id: true,
            updated_at: true,
          },
          take: 500,
        });
        return rows.map((r) => ({
          target_kind: ADMIN_TARGET_KINDS.ESCROW_DISPUTE,
          target_id: r.id,
          assigned_to_staff_id: r.assigned_to_staff_id,
          age_minutes: minutesSince(r.updated_at),
        }));
      }
      case 'PAYMENT_FAILED': {
        const rows = await this.prisma.payment.findMany({
          where: { status: 'FAILED', created_at: { lt: cutoff } },
          select: { id: true, created_at: true },
          take: 500,
        });
        return rows.map((r) => ({
          target_kind: ADMIN_TARGET_KINDS.PAYMENT,
          target_id: r.id,
          age_minutes: minutesSince(r.created_at),
        }));
      }
      case 'PAYMENT_TRANSFER_PENDING': {
        const rows = await this.prisma.payment.findMany({
          where: {
            status: 'PENDING',
            type: { in: ['WORKER_PAYOUT', 'REFERRAL_ACCOUNT', 'REFERRAL_W2W', 'REFERRAL_E2E'] },
            created_at: { lt: cutoff },
          },
          select: { id: true, created_at: true },
          take: 500,
        });
        return rows.map((r) => ({
          target_kind: ADMIN_TARGET_KINDS.PAYMENT,
          target_id: r.id,
          age_minutes: minutesSince(r.created_at),
        }));
      }
      default:
        throw new BadRequestException({
          code: 'UNKNOWN_QUEUE',
          message: `No probe for queue ${queue}`,
        });
    }
  }

  /**
   * On breach: notify the current assignee (if any) AND every active ADMIN.
   * Admins are the implicit escalation audience — no per-rule role picker.
   */
  private async notifyBreach(
    rule: {
      id: bigint;
      name: string;
      notification_title: string | null;
      notification_body: string | null;
    },
    candidate: BreachCandidate,
  ): Promise<number> {
    const recipients = new Set<bigint>();
    if (candidate.assigned_to_staff_id) {
      recipients.add(candidate.assigned_to_staff_id);
    }
    const adminRole = await this.prisma.staffRole.findUnique({
      where: { name: ADMIN_ROLE_NAME },
    });
    if (adminRole) {
      const admins = await this.prisma.staffMemberRole.findMany({
        where: {
          staff_role_id: adminRole.id,
          staff_member: { account: { status: 'ACTIVE' } },
        },
        select: { staff_member_id: true },
      });
      for (const a of admins) recipients.add(a.staff_member_id);
    }
    const title = rule.notification_title || `SLA breach: ${rule.name}`;
    const body =
      rule.notification_body ||
      `Item ${candidate.target_kind}#${candidate.target_id} is ${Math.round(candidate.age_minutes)}m old without resolution.`;

    let sent = 0;
    for (const accountId of recipients) {
      try {
        await this.notifications.create(accountId, {
          type: 'SLA_BREACH',
          title,
          body,
          data: {
            rule_id: rule.id.toString(),
            target_kind: candidate.target_kind,
            target_id: candidate.target_id.toString(),
          },
          channel: 'IN_APP',
        });
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Failed to notify staff ${accountId}: ${(err as Error).message}`,
        );
      }
    }
    return sent;
  }

  private serialize(r: {
    id: bigint;
    name: string;
    description: string | null;
    threshold_minutes: number;
    notification_title: string | null;
    notification_body: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    target_queue: { name: string };
    created_by: { id: bigint; display_name: string };
  }) {
    return {
      id: r.id.toString(),
      name: r.name,
      description: r.description,
      target_queue: r.target_queue.name,
      threshold_minutes: r.threshold_minutes,
      notification_title: r.notification_title,
      notification_body: r.notification_body,
      is_active: r.is_active,
      created_by: {
        id: r.created_by.id.toString(),
        display_name: r.created_by.display_name,
      },
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }
}

function minutesSince(t: Date): number {
  return Math.max(0, Math.round((Date.now() - t.getTime()) / 60000));
}
