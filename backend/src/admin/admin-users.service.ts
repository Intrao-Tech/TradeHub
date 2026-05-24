import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface UserSearchQuery {
  q?: string;
  status?: string;
  kind?: 'WORKER' | 'EMPLOYER' | 'STAFF' | 'ANY';
  verification_level?: string;
  page?: number;
  limit?: number;
}

/**
 * Admin-side user lookup. Searches across email / display_name / slug /
 * postcode_area, and returns enriched rows with role flags + verification.
 */
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: UserSearchQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AccountWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q && query.q.trim()) {
      const q = query.q.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        {
          client_profile: {
            OR: [
              { display_name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
              { postcode_area: { contains: q, mode: 'insensitive' } },
              { referral_code: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }
    if (query.kind === 'WORKER') {
      where.client_profile = {
        ...(where.client_profile as object),
        worker_profile: { isNot: null },
      };
    } else if (query.kind === 'EMPLOYER') {
      where.client_profile = {
        ...(where.client_profile as object),
        employer_profile: { isNot: null },
      };
    } else if (query.kind === 'STAFF') {
      where.staff_member = { isNot: null };
    }
    if (query.verification_level) {
      where.client_profile = {
        ...(where.client_profile as object),
        verification_level: query.verification_level,
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          client_profile: {
            select: {
              id: true,
              display_name: true,
              slug: true,
              avatar_url: true,
              verification_level: true,
              postcode_area: true,
              city: true,
              referral_code: true,
              worker_profile: { select: { id: true } },
              employer_profile: { select: { id: true, company_name: true } },
            },
          },
          staff_member: {
            include: {
              member_roles: {
                include: { staff_role: { select: { name: true } } },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.account.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id.toString(),
        email: r.email,
        status: r.status,
        created_at: r.created_at,
        last_login_at: r.last_login_at,
        is_worker: !!r.client_profile?.worker_profile,
        is_employer: !!r.client_profile?.employer_profile,
        is_staff: !!r.staff_member,
        staff_role:
          r.staff_member?.member_roles[0]?.staff_role.name ?? null,
        client: r.client_profile
          ? {
              id: r.client_profile.id.toString(),
              display_name: r.client_profile.display_name,
              slug: r.client_profile.slug,
              avatar_url: r.client_profile.avatar_url,
              verification_level: r.client_profile.verification_level,
              postcode_area: r.client_profile.postcode_area,
              city: r.client_profile.city,
              referral_code: r.client_profile.referral_code,
            }
          : null,
      })),
      total,
      page,
      limit,
    };
  }

  async getDetail(accountId: bigint) {
    const acc = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: {
        client_profile: {
          include: {
            worker_profile: true,
            employer_profile: true,
            referrer: {
              select: { id: true, display_name: true, slug: true },
            },
          },
        },
        staff_member: {
          include: {
            member_roles: {
              include: { staff_role: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!acc) throw new NotFoundException({ code: 'USER_NOT_FOUND' });

    const [
      reviewableItems,
      contractCount,
      paymentTotals,
      openDisputes,
      auditTail,
    ] = await Promise.all([
      acc.client_profile
        ? this.prisma.reviewableItem.findMany({
            where: { client_profile_id: acc.id },
            include: {
              document: { select: { doc_type: true } },
              review_items: {
                orderBy: { created_at: 'desc' },
                take: 1,
              },
            },
            orderBy: { created_at: 'desc' },
          })
        : Promise.resolve([]),
      acc.client_profile
        ? this.prisma.contract.count({
            where: {
              collaboration: {
                OR: [{ worker_id: acc.id }, { employer_id: acc.id }],
              },
            },
          })
        : Promise.resolve(0),
      acc.client_profile
        ? this.prisma.payment.groupBy({
            by: ['type', 'status'],
            where: { client_profile_id: acc.id },
            _sum: { amount: true },
            _count: true,
          })
        : Promise.resolve([]),
      acc.client_profile
        ? this.prisma.escrowDispute.count({
            where: {
              status: { in: ['OPEN', 'RESPONDED', 'MEDIATION'] },
              milestone: {
                contract: {
                  collaboration: {
                    OR: [{ worker_id: acc.id }, { employer_id: acc.id }],
                  },
                },
              },
            },
          })
        : Promise.resolve(0),
      this.prisma.auditLog.findMany({
        where: { account_id: acc.id },
        orderBy: { created_at: 'desc' },
        take: 20,
      }),
    ]);

    return {
      id: acc.id.toString(),
      email: acc.email,
      phone: acc.phone,
      phone_verified: acc.phone_verified,
      status: acc.status,
      created_at: acc.created_at,
      last_login_at: acc.last_login_at,
      email_verified_at: acc.email_verified_at,
      is_worker: !!acc.client_profile?.worker_profile,
      is_employer: !!acc.client_profile?.employer_profile,
      is_staff: !!acc.staff_member,
      client: acc.client_profile
        ? {
            id: acc.client_profile.id.toString(),
            display_name: acc.client_profile.display_name,
            slug: acc.client_profile.slug,
            avatar_url: acc.client_profile.avatar_url,
            bio: acc.client_profile.bio,
            city: acc.client_profile.city,
            postcode_area: acc.client_profile.postcode_area,
            verification_level: acc.client_profile.verification_level,
            referral_code: acc.client_profile.referral_code,
            referrer: acc.client_profile.referrer
              ? {
                  id: acc.client_profile.referrer.id.toString(),
                  display_name: acc.client_profile.referrer.display_name,
                  slug: acc.client_profile.referrer.slug,
                }
              : null,
            stripe_connect_account_id:
              acc.client_profile.stripe_connect_account_id,
            connect_payouts_enabled: acc.client_profile.connect_payouts_enabled,
            connect_charges_enabled: acc.client_profile.connect_charges_enabled,
          }
        : null,
      worker: acc.client_profile?.worker_profile
        ? {
            years_experience: acc.client_profile.worker_profile.years_experience,
            day_rate_min: acc.client_profile.worker_profile.day_rate_min,
            day_rate_max: acc.client_profile.worker_profile.day_rate_max,
            is_available: acc.client_profile.worker_profile.is_available,
            rating_avg: acc.client_profile.worker_profile.rating_avg,
            rating_count: acc.client_profile.worker_profile.rating_count,
          }
        : null,
      employer: acc.client_profile?.employer_profile
        ? {
            company_name: acc.client_profile.employer_profile.company_name,
            company_number: acc.client_profile.employer_profile.company_number,
            team_size: acc.client_profile.employer_profile.team_size,
            rating_avg: acc.client_profile.employer_profile.rating_avg,
            rating_count: acc.client_profile.employer_profile.rating_count,
          }
        : null,
      staff: acc.staff_member
        ? {
            display_name: acc.staff_member.display_name,
            is_on_duty: acc.staff_member.is_on_duty,
            roles: acc.staff_member.member_roles.map(
              (m) => m.staff_role.name,
            ),
          }
        : null,
      counters: {
        contracts: contractCount,
        open_disputes: openDisputes,
      },
      payment_totals: paymentTotals.map((g) => ({
        type: g.type,
        status: g.status,
        count: g._count,
        amount: g._sum.amount?.toString() ?? '0',
      })),
      reviewable_items: reviewableItems.map((ri) => ({
        id: ri.id.toString(),
        kind: ri.kind,
        created_at: ri.created_at,
        document: ri.document
          ? { doc_type: ri.document.doc_type }
          : null,
        latest_review: ri.review_items[0]
          ? {
              id: ri.review_items[0].id.toString(),
              status: ri.review_items[0].status,
              reviewed_at: ri.review_items[0].reviewed_at,
            }
          : null,
      })),
      recent_audit: auditTail.map((a) => ({
        id: a.id.toString(),
        action: a.action,
        entity_type: a.entity_type,
        entity_id: a.entity_id?.toString() ?? null,
        created_at: a.created_at,
        metadata: a.metadata,
      })),
    };
  }
}
