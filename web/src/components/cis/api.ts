import { api } from '../../api';

/**
 * CIS (HMRC Construction Industry Scheme) API client.
 *
 * V1 (ASSIST): worker declares CIS standing, staff/HMRC confirm, the platform
 * shows the deduction breakdown + PDS but the employer remits the tax.
 * V2 (MANAGED): the platform withholds at release and files/remits a monthly
 * CIS300 return — currently MOCKED (no real HMRC call / bank transfer).
 */

export type CisStatus = 'NONE' | 'REGISTERED' | 'GROSS' | 'UNREGISTERED';

/** The statuses a worker can self-declare (NONE is the unset default). */
export const DECLARABLE_CIS_STATUSES: Exclude<CisStatus, 'NONE'>[] = [
  'REGISTERED',
  'GROSS',
  'UNREGISTERED',
];

export const CIS_RATE_BY_STATUS: Record<Exclude<CisStatus, 'NONE'>, number> = {
  GROSS: 0,
  REGISTERED: 20,
  UNREGISTERED: 30,
};

export type WorkerCis = {
  status: CisStatus;
  rate: number | null;
  verification_number: string | null;
  verified: boolean;
  verified_at: string | null;
  /** Review state of the latest HMRC CIS evidence document. */
  document_status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
};

export type MilestoneCisBreakdown = {
  applies: boolean;
  mode: 'ASSIST' | 'MANAGED';
  worker_cis_status: CisStatus;
  verification_number: string | null;
  /** Whether the worker's CIS standing is HMRC/staff-verified (vs self-declared). */
  verified: boolean;
  rate: number;
  labour: string;
  materials: string;
  gross: string;
  deduction: string;
  /** HMRC/PDS figure: gross − CIS. NOT what hits the worker's account. */
  net_to_worker: string;
  /**
   * What the worker actually receives on-platform (after our service fee + any
   * MANAGED withholding). Null before the milestone is funded.
   */
  worker_receives: string | null;
};

export type CisPds = {
  milestone_id: string;
  gross_paid: string;
  cost_of_materials: string;
  amount_deducted: string;
  net_paid: string;
  cis_rate: number;
  verification_number: string | null;
  applies: boolean;
};

export type CisReturnStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PAID';

export type CisReturnLine = {
  id: string;
  subcontractor_client_profile_id: string;
  verification_number: string | null;
  gross_paid: string;
  cost_of_materials: string;
  amount_deducted: string;
  cis_rate: number;
};

export type CisReturn = {
  id: string;
  tax_year: number;
  tax_month: number;
  status: CisReturnStatus;
  is_nil_return: boolean;
  total_deducted: string;
  total_paid: string;
  hmrc_irmark: string | null;
  hmrc_submission_ref: string | null;
  submitted_at: string | null;
  accepted_at: string | null;
  remitted_at: string | null;
  remittance_ref: string | null;
  is_mocked: boolean;
  created_at: string;
  updated_at: string;
  lines: CisReturnLine[];
};

// ── Worker: own CIS standing ────────────────────────────────────────────

export function getMyCis() {
  return api<WorkerCis>('/cis/me');
}

export function declareMyCis(body: {
  status: Exclude<CisStatus, 'NONE'>;
  verification_number?: string;
}) {
  return api<WorkerCis>('/cis/me/declare', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Submit the HMRC CIS evidence document (structured: UTR required, NI number
 * optional). It lands in the staff verification queue; approving it marks the
 * worker CIS-verified.
 */
export function submitCisDocument(utr: string, niNumber?: string) {
  const fd = new FormData();
  fd.append('doc_type', 'HMRC_CIS_DOCUMENT');
  const ni = niNumber?.trim();
  fd.append(
    'metadata',
    JSON.stringify(ni ? { utr, ni_number: ni } : { utr }),
  );
  return api('/documents/upload', { method: 'POST', body: fd });
}

// ── Contract parties: milestone breakdown + PDS ─────────────────────────

export function getMilestoneCisBreakdown(milestoneId: string | number) {
  return api<MilestoneCisBreakdown>(`/cis/milestones/${milestoneId}/breakdown`);
}

export function getMilestonePds(milestoneId: string | number) {
  return api<CisPds>(`/cis/milestones/${milestoneId}/pds`);
}

// ── Staff: confirm a worker + V2 monthly returns ────────────────────────

export function adminConfirmWorkerCis(
  workerClientProfileId: string | number,
  body: { status: CisStatus; verification_number?: string },
) {
  return api<{ ok: true }>(
    `/cis/admin/workers/${workerClientProfileId}/confirm`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function getCisGlobalMode() {
  return api<{ mode: 'ASSIST' | 'MANAGED' }>('/cis/admin/mode');
}

export function setCisGlobalMode(mode: 'ASSIST' | 'MANAGED') {
  return api<{ mode: 'ASSIST' | 'MANAGED' }>('/cis/admin/mode', {
    method: 'PATCH',
    body: JSON.stringify({ mode }),
  });
}

export function listCisReturns() {
  return api<CisReturn[]>('/cis/admin/returns');
}

export function buildCisReturn(taxYear: number, taxMonth: number) {
  return api<CisReturn>('/cis/admin/returns/build', {
    method: 'POST',
    body: JSON.stringify({ tax_year: taxYear, tax_month: taxMonth }),
  });
}

export function submitCisReturn(id: string | number) {
  return api<CisReturn>(`/cis/admin/returns/${id}/submit`, { method: 'POST' });
}

export function remitCisReturn(id: string | number) {
  return api<CisReturn>(`/cis/admin/returns/${id}/remit`, { method: 'POST' });
}

/**
 * UK CIS tax month label. The tax year runs 6 Apr → 5 Apr; month 1 = Apr.
 * `taxMonth` is 1-12 where 1 = the 6 Apr–5 May period.
 */
export function cisTaxMonthLabel(taxYear: number, taxMonth: number): string {
  // Month 1 = April. Index into month names starting from April.
  const monthNames = [
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
    'Jan',
    'Feb',
    'Mar',
  ];
  const name = monthNames[(taxMonth - 1) % 12] ?? `M${taxMonth}`;
  // Jan-Mar fall into the next calendar year of the tax year span.
  const calendarYear = taxMonth >= 10 ? taxYear + 1 : taxYear;
  return `${name} ${calendarYear} (${taxYear}/${(taxYear + 1) % 100}, m${taxMonth})`;
}
