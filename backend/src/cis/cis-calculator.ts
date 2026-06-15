import { Prisma } from '@prisma/client';
import {
  CIS_RATE_BY_STATUS,
  CIS_UNREGISTERED_RATE,
  type CisStatus,
} from './cis.constants';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * Resolve the deduction rate (%) for a worker. Confirmed statuses map to their
 * rate; an explicit stored rate wins if present; an unconfirmed/odd state falls
 * back to the 30% unregistered default (CIS applies but the sub isn't verified).
 */
export function resolveCisRate(
  status: CisStatus,
  explicitRate: number | null | undefined,
): number {
  if (explicitRate === 0 || explicitRate === 20 || explicitRate === 30) {
    return explicitRate;
  }
  if (status !== 'NONE' && status in CIS_RATE_BY_STATUS) {
    return CIS_RATE_BY_STATUS[status as Exclude<CisStatus, 'NONE'>];
  }
  return CIS_UNREGISTERED_RATE;
}

export type CisBreakdown = {
  /** Whether a CIS deduction applies at all. */
  applies: boolean;
  rate: number; // 0 / 20 / 30
  labour: Prisma.Decimal;
  materials: Prisma.Decimal;
  /** labour + materials — equals the milestone amount when CIS applies. */
  gross: Prisma.Decimal;
  /** rate% of LABOUR only (materials never deducted). */
  deduction: Prisma.Decimal;
  /** gross − deduction: what the worker actually receives. */
  netToWorker: Prisma.Decimal;
};

/**
 * The single source of truth for the CIS money math — shared by V1 (ASSIST,
 * display + PDS only) and V2 (MANAGED, real withholding). Deducts rate% of the
 * LABOUR portion; materials pass through untouched.
 *
 * Pure: no DB, no side effects → trivially unit-testable.
 */
export function computeCisDeduction(input: {
  labour: Prisma.Decimal.Value;
  materials: Prisma.Decimal.Value;
  rate: number;
  applies: boolean;
}): CisBreakdown {
  const labour = D(input.labour);
  const materials = D(input.materials);
  const gross = labour.add(materials);

  if (!input.applies || input.rate <= 0) {
    return {
      applies: input.applies,
      rate: input.applies ? input.rate : 0,
      labour,
      materials,
      gross,
      deduction: D(0),
      netToWorker: gross,
    };
  }

  const deduction = labour
    .mul(input.rate)
    .div(100)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    applies: true,
    rate: input.rate,
    labour,
    materials,
    gross,
    deduction,
    netToWorker: gross.sub(deduction),
  };
}

/**
 * Whether CIS applies to a given job: only when the employer is a CIS
 * contractor (business) AND the worker has a confirmed CIS standing. Homeowner
 * employers or unconfirmed workers → no CIS.
 */
export function cisApplies(input: {
  employerIsContractor: boolean;
  workerCisStatus: CisStatus;
}): boolean {
  return (
    input.employerIsContractor === true && input.workerCisStatus !== 'NONE'
  );
}
