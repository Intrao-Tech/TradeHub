import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const now = Date.now();
    const last24h = new Date(now - DAY);
    const last7d = new Date(now - 7 * DAY);
    const last30d = new Date(now - 30 * DAY);

    const [
      usersTotal,
      usersActive,
      usersDeactivated,
      newAccounts7d,
      newAccounts30d,
      workersTotal,
      employersTotal,
      staffTotal,
      staffActive,
      staffOnDuty,
      contractsTotal,
      contractsActive,
      milestonesByStatus,
      openDisputes,
      pendingReviewItems,
      pendingApprovals,
      paymentSums,
      activeSlaBreaches,
      supportThreadsOpen,
    ] = await Promise.all([
      this.prisma.account.count(),
      this.prisma.account.count({ where: { status: 'ACTIVE' } }),
      this.prisma.account.count({ where: { status: 'DEACTIVATED' } }),
      this.prisma.account.count({ where: { created_at: { gte: last7d } } }),
      this.prisma.account.count({ where: { created_at: { gte: last30d } } }),
      this.prisma.workerProfile.count(),
      this.prisma.employerProfile.count(),
      this.prisma.staffMember.count(),
      this.prisma.staffMember.count({
        where: { account: { status: 'ACTIVE' } },
      }),
      this.prisma.staffMember.count({
        where: { is_on_duty: true, account: { status: 'ACTIVE' } },
      }),
      this.prisma.contract.count(),
      this.prisma.contract.count({ where: { status: 'ACTIVE' } }),
      this.prisma.escrowMilestone.groupBy({
        by: ['status'],
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.escrowDispute.count({
        where: { status: { in: ['OPEN', 'RESPONDED', 'MEDIATION'] } },
      }),
      this.prisma.reviewItem.count({ where: { status: 'PENDING' } }),
      this.prisma.staffActionApproval.count({ where: { status: 'PENDING' } }),
      this.prisma.payment.groupBy({
        by: ['type', 'status'],
        _sum: { amount: true },
        _count: true,
        where: { created_at: { gte: last30d } },
      }),
      this.prisma.staffSlaBreach.count({ where: { resolved_at: null } }),
      this.prisma.supportCollaboration.count({
        where: {
          last_message_at: { gte: last7d },
        },
      }),
    ]);

    // Recent activity series — last 7 days, new account count per day
    const accountsByDay = await this.prisma.$queryRaw<
      Array<{ day: Date; n: bigint }>
    >`
      SELECT date_trunc('day', created_at) AS day, COUNT(*)::bigint AS n
      FROM account
      WHERE created_at >= ${last7d}
      GROUP BY day
      ORDER BY day ASC
    `;
    const milestonesFundedLast24h = await this.prisma.escrowMilestone.aggregate(
      {
        where: { status: 'FUNDED', updated_at: { gte: last24h } },
        _sum: { amount: true },
        _count: true,
      },
    );

    return {
      users: {
        total: usersTotal,
        active: usersActive,
        deactivated: usersDeactivated,
        new_7d: newAccounts7d,
        new_30d: newAccounts30d,
        workers: workersTotal,
        employers: employersTotal,
      },
      staff: {
        total: staffTotal,
        active: staffActive,
        on_duty: staffOnDuty,
      },
      contracts: {
        total: contractsTotal,
        active: contractsActive,
      },
      milestones: {
        by_status: milestonesByStatus.map((m) => ({
          status: m.status,
          count: m._count,
          total: m._sum.amount?.toString() ?? '0',
        })),
        funded_last_24h: {
          count: milestonesFundedLast24h._count,
          total: milestonesFundedLast24h._sum.amount?.toString() ?? '0',
        },
      },
      disputes: { open: openDisputes },
      queues: {
        pending_review_items: pendingReviewItems,
        pending_approvals: pendingApprovals,
        sla_breaches_active: activeSlaBreaches,
        support_threads_active_7d: supportThreadsOpen,
      },
      payments_30d: paymentSums.map((p) => ({
        type: p.type,
        status: p.status,
        count: p._count,
        amount: p._sum.amount?.toString() ?? '0',
      })),
      timeseries: {
        accounts_per_day_7d: accountsByDay.map((r) => ({
          day: r.day,
          count: Number(r.n),
        })),
      },
    };
  }
}
