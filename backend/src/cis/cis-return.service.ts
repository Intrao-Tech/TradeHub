import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * V2 (MANAGED) — monthly CIS300 return service.
 *
 * Aggregates the month's CIS_WITHHELD payments into a `cis_return`, snapshots
 * per-subcontractor lines (`cis_return_line`), then "submits" to HMRC and
 * "remits" the cash — both MOCKED. No real HMRC API call and no real bank
 * transfer happen: we set fake IRmark / remittance refs and flag `is_mocked`.
 * This lets the full V2 flow be tested end-to-end; the real submit + remit are
 * dropped in once the platform is HMRC-recognised and lawyers have signed off.
 */
@Injectable()
export class CisReturnService {
  private readonly logger = new Logger(CisReturnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Build (or refresh the DRAFT of) the monthly return for a CIS tax month.
   * Collects unfiled CIS_WITHHELD payments for that month, snapshots one line
   * per subcontractor, stamps the payments with the return id, and updates
   * totals. Idempotent on an already-SUBMITTED return (won't touch filed data).
   */
  async buildMonthlyReturn(taxYear: number, taxMonth: number) {
    const existing = await this.prisma.cisReturn.findUnique({
      where: { tax_year_tax_month: { tax_year: taxYear, tax_month: taxMonth } },
    });
    if (existing && existing.status !== 'DRAFT') {
      // Already filed — never mutate a submitted return.
      return existing;
    }

    // Withheld deductions for this tax month, with the milestone they came from
    // (gross/materials) and the worker they were withheld from. We collect both
    // the unfiled rows AND any already stamped to THIS draft, so a re-build
    // re-aggregates everything (otherwise a refresh after new withholdings would
    // drop the earlier ones and under-report total_deducted). Refunded/cancelled
    // milestones are excluded — their money went back, so no CIS is owed.
    const withheld = await this.prisma.payment.findMany({
      where: {
        type: 'CIS_WITHHELD',
        cis_tax_year: taxYear,
        cis_tax_month: taxMonth,
        ...(existing
          ? { OR: [{ cis_return_id: null }, { cis_return_id: existing.id }] }
          : { cis_return_id: null }),
        milestone: { status: { notIn: ['REFUNDED', 'CANCELED'] } },
      },
      select: {
        id: true,
        amount: true,
        client_profile_id: true,
        milestone: { select: { amount: true, materials_amount: true } },
      },
    });

    // Group by subcontractor → snapshot line figures.
    type Agg = {
      gross: Prisma.Decimal;
      materials: Prisma.Decimal;
      deducted: Prisma.Decimal;
      paymentIds: bigint[];
    };
    const bySub = new Map<string, Agg>();
    for (const p of withheld) {
      const key = p.client_profile_id.toString();
      const agg =
        bySub.get(key) ??
        ({
          gross: new Prisma.Decimal(0),
          materials: new Prisma.Decimal(0),
          deducted: new Prisma.Decimal(0),
          paymentIds: [],
        } as Agg);
      agg.gross = agg.gross.add(p.milestone.amount);
      agg.materials = agg.materials.add(
        p.milestone.materials_amount ?? new Prisma.Decimal(0),
      );
      agg.deducted = agg.deducted.add(p.amount);
      agg.paymentIds.push(p.id);
      bySub.set(key, agg);
    }

    // Worker CIS metadata for the lines (rate + verification number snapshot).
    const subIds = Array.from(bySub.keys()).map((k) => BigInt(k));
    const workers = subIds.length
      ? await this.prisma.workerProfile.findMany({
          where: { id: { in: subIds } },
          select: { id: true, cis_rate: true, cis_verification_number: true },
        })
      : [];
    const workerById = new Map(workers.map((w) => [w.id.toString(), w]));

    const totalDeducted = Array.from(bySub.values()).reduce(
      (s, a) => s.add(a.deducted),
      new Prisma.Decimal(0),
    );
    const totalPaid = Array.from(bySub.values()).reduce(
      (s, a) => s.add(a.gross),
      new Prisma.Decimal(0),
    );
    const isNil = bySub.size === 0;

    const result = await this.prisma.$transaction(async (tx) => {
      // Upsert the DRAFT return.
      const ret = await tx.cisReturn.upsert({
        where: {
          tax_year_tax_month: { tax_year: taxYear, tax_month: taxMonth },
        },
        update: {
          total_deducted: totalDeducted,
          total_paid: totalPaid,
          is_nil_return: isNil,
        },
        create: {
          tax_year: taxYear,
          tax_month: taxMonth,
          status: 'DRAFT',
          is_nil_return: isNil,
          total_deducted: totalDeducted,
          total_paid: totalPaid,
        },
      });

      // Rebuild lines from scratch (DRAFT only) for a clean snapshot.
      await tx.cisReturnLine.deleteMany({ where: { cis_return_id: ret.id } });
      for (const [subKey, agg] of bySub) {
        const w = workerById.get(subKey);
        // Back-calculate the rate from the aggregate (deducted / labour). A
        // sub whose month spans more than one rate would yield a blended,
        // invalid figure (e.g. 25%) — only trust the back-calc when it lands on
        // a real CIS rate, otherwise fall back to the worker's snapshot rate.
        // amount_deducted is the authoritative figure either way.
        const labourBase = agg.gross.sub(agg.materials);
        const backCalc =
          labourBase.gt(0) && agg.deducted.gt(0)
            ? Math.round(agg.deducted.div(labourBase).mul(100).toNumber())
            : null;
        const rate =
          backCalc != null && [0, 20, 30].includes(backCalc)
            ? backCalc
            : // Never persist an invalid blended rate: prefer the worker's
              // snapshot rate, else the conservative default (30% if a deduction
              // was taken, 0% if nil).
              (w?.cis_rate ?? (agg.deducted.gt(0) ? 30 : 0));
        await tx.cisReturnLine.create({
          data: {
            cis_return_id: ret.id,
            subcontractor_client_profile_id: BigInt(subKey),
            verification_number: w?.cis_verification_number ?? null,
            gross_paid: agg.gross,
            cost_of_materials: agg.materials,
            amount_deducted: agg.deducted,
            cis_rate: rate,
          },
        });
        // Stamp the payments so they're not re-aggregated next build.
        await tx.payment.updateMany({
          where: { id: { in: agg.paymentIds } },
          data: { cis_return_id: ret.id },
        });
      }
      return ret;
    });

    this.logger.log(
      `CIS300 draft built :: ${taxYear}/${taxMonth} subs=${bySub.size} deducted=${totalDeducted.toFixed(2)}${isNil ? ' (nil)' : ''}`,
    );
    return result;
  }

  /**
   * MOCKED HMRC submission. In production this POSTs the CIS300 (XML/GovTalk)
   * and stores the real IRmark. Here we simulate acceptance.
   */
  async submitReturn(id: bigint, staffMemberId?: bigint | null, ip?: string) {
    const ret = await this.prisma.cisReturn.findUnique({ where: { id } });
    if (!ret) throw new NotFoundException('CIS return not found');
    // Only a DRAFT can be submitted — block re-submits and illegal transitions.
    if (ret.status !== 'DRAFT') {
      throw new BadRequestException({
        code: 'INVALID_RETURN_STATE',
        message: `Return is ${ret.status} — only a DRAFT return can be submitted.`,
      });
    }

    const now = new Date();
    const updated = await this.prisma.cisReturn.update({
      where: { id },
      data: {
        status: 'ACCEPTED',
        submitted_at: now,
        accepted_at: now,
        hmrc_irmark: `MOCK-IRMARK-${id.toString()}`,
        hmrc_submission_ref: `MOCK-SUB-${ret.tax_year}-${ret.tax_month}`,
        is_mocked: true,
      },
    });
    await this.audit.log(
      staffMemberId ?? null,
      'cis.return_submitted_mock',
      'cis_return',
      id,
      { tax_year: ret.tax_year, tax_month: ret.tax_month, mocked: true },
      ip,
    );
    this.logger.warn(
      `CIS300 MOCK-submitted :: return=${id} (no real HMRC call)`,
    );
    return updated;
  }

  /**
   * MOCKED bank remittance to HMRC. In production this triggers a BACS/Faster
   * Payments transfer of `total_deducted` from the platform account. Here we
   * only record a fake reference.
   */
  async remitReturn(id: bigint, staffMemberId?: bigint | null, ip?: string) {
    const ret = await this.prisma.cisReturn.findUnique({ where: { id } });
    if (!ret) throw new NotFoundException('CIS return not found');
    // Only remit a return HMRC has accepted — can't pay over an unfiled draft.
    if (ret.status !== 'ACCEPTED') {
      throw new BadRequestException({
        code: 'INVALID_RETURN_STATE',
        message: `Return is ${ret.status} — submit it to HMRC before remitting.`,
      });
    }

    const updated = await this.prisma.cisReturn.update({
      where: { id },
      data: {
        status: 'PAID',
        remitted_at: new Date(),
        remittance_ref: `MOCK-REMIT-${id.toString()}`,
        is_mocked: true,
      },
    });
    await this.audit.log(
      staffMemberId ?? null,
      'cis.return_remitted_mock',
      'cis_return',
      id,
      {
        amount: ret.total_deducted.toFixed(2),
        mocked: true,
      },
      ip,
    );
    this.logger.warn(
      `CIS300 MOCK-remitted :: return=${id} £${ret.total_deducted.toFixed(2)} (no real transfer)`,
    );
    return updated;
  }

  listReturns() {
    return this.prisma.cisReturn.findMany({
      orderBy: [{ tax_year: 'desc' }, { tax_month: 'desc' }],
      include: { lines: true },
    });
  }
}
