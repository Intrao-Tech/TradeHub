/**
 * CIS (HMRC Construction Industry Scheme) constants + tax-period helpers.
 *
 * CIS is a tax-withholding scheme: when a construction "contractor" pays a
 * "subcontractor" for labour, a slice of the LABOUR portion is withheld and
 * remitted to HMRC as an advance on the sub's Income Tax + NI. Materials are
 * never deducted. Cash still moves by normal transfer / our escrow — CIS only
 * governs the withholding + reporting.
 */

// ── Subcontractor (worker) CIS standing ──────────────────────────────
export const CIS_STATUSES = [
  'NONE', // not yet confirmed — worker cannot apply to jobs until resolved
  'REGISTERED', // registered + verified → 20%
  'GROSS', // gross payment status → 0% (established, compliant business)
  'UNREGISTERED', // confirmed not registered → 30%
] as const;
export type CisStatus = (typeof CIS_STATUSES)[number];

/** Deduction rate (%) for each confirmed status. */
export const CIS_RATE_BY_STATUS: Record<Exclude<CisStatus, 'NONE'>, number> = {
  GROSS: 0,
  REGISTERED: 20,
  UNREGISTERED: 30,
};

/**
 * Rate applied when CIS applies but the worker has no confirmed registered
 * rate — HMRC's penalty/default rate for unverifiable subs.
 */
export const CIS_UNREGISTERED_RATE = 30;

// ── Handling mode — the V1 ↔ V2 switch ───────────────────────────────
export const CIS_MODES = ['ASSIST', 'MANAGED'] as const;
export type CisMode = (typeof CIS_MODES)[number];
// ASSIST  (V1): platform computes + shows breakdown + generates PDS; the
//   employer withholds & remits to HMRC themselves. No tax liability for us.
// MANAGED (V2): platform withholds at release, holds a CIS_WITHHELD payment,
//   aggregates a monthly cis_return, files CIS300 + remits (mocked until HMRC
//   recognition + legal sign-off).

// ── CIS300 monthly-return status ─────────────────────────────────────
export const CIS_RETURN_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'ACCEPTED',
  'REJECTED',
  'PAID',
] as const;
export type CisReturnStatus = (typeof CIS_RETURN_STATUSES)[number];

/**
 * UK CIS tax month. The tax year starts 6 April; each tax month runs from the
 * 6th of one calendar month to the 5th of the next. Month 1 = 6 Apr–5 May …
 * month 12 = 6 Mar–5 Apr. `taxYear` is the calendar year the tax year STARTED
 * (e.g. 2026 means the 2026/27 tax year).
 *
 * Examples:
 *   2026-04-10 → { taxYear: 2026, taxMonth: 1 }   (6 Apr–5 May 2026)
 *   2026-04-03 → { taxYear: 2025, taxMonth: 12 }  (6 Mar–5 Apr 2026)
 *   2027-01-20 → { taxYear: 2026, taxMonth: 10 }  (6 Jan–5 Feb 2027)
 */
export function cisTaxMonth(date: Date): { taxYear: number; taxMonth: number } {
  const day = date.getUTCDate();
  const cm = date.getUTCMonth() + 1; // 1..12
  const cy = date.getUTCFullYear();

  // The calendar month whose 6th opened the window this date sits in. Before
  // the 6th, the date belongs to the previous calendar month's window.
  let windowMonth = day >= 6 ? cm : cm - 1;
  let windowYear = cy;
  if (windowMonth === 0) {
    windowMonth = 12;
    windowYear = cy - 1;
  }

  // Map calendar month → tax-month index (April = 1).
  const taxMonth = ((windowMonth - 4 + 12) % 12) + 1;
  // Tax year started in the April of (or before) this window.
  const taxYear = windowMonth >= 4 ? windowYear : windowYear - 1;
  return { taxYear, taxMonth };
}
