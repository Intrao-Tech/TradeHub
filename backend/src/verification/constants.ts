/**
 * Verification domain constants — single source of truth for the
 * vocabularies referenced across the spec. Importers MUST use these tokens
 * (not literal strings) so that grepping / refactors stay sound.
 */

/**
 * Trust ladder rungs (per product spec §3.2).
 * Replaces the legacy `UNVERIFIED | IDENTITY_VERIFIED` enum.
 */
export const VERIFICATION_LEVELS = [
  'UNVERIFIED',
  'BASIC',
  'CERTIFIED',
  'PREMIUM',
] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

/**
 * Milestone taxonomy. Each row of `verification_milestone` carries one of
 * these in `milestone_type`. `LEVEL_PROMOTED` is written by the promotion
 * engine itself; the rest are written by the per-evidence flows.
 */
export const MILESTONE_TYPES = [
  'IDENTITY_VERIFIED', // Stripe Identity webhook
  'CERTIFICATION_APPROVED', // CSCS / Gas Safe / NICEIC / FIRAS — staff manual
  'INSURANCE_APPROVED', // staff manual
  'COMPANY_LETTERHEAD_APPROVED', // staff manual
  'COMPANY_HOUSE_VERIFIED', // Companies House public API
  'RIGHT_TO_WORK_VERIFIED', // staff manual via gov.uk Right-to-Work check
  'HMRC_CIS_VERIFIED', // staff manual via gov.uk CIS gateway
  'LEVEL_PROMOTED', // promotion engine (pseudo-event for ladder transitions)
] as const;
export type MilestoneType = (typeof MILESTONE_TYPES)[number];

/**
 * Doc-type → milestone-type mapping for the manual review flow.
 * Returns `null` when approval of this doc type does not contribute to a
 * milestone (e.g. `OTHER` — free-form, user-titled, no ladder effect).
 */
export function milestoneForDocType(docType: string): MilestoneType | null {
  switch (docType) {
    case 'CSCS_CARD':
    case 'GAS_SAFE_CERT':
    case 'NICEIC_CERT':
    case 'FIRAS_CERT':
      return 'CERTIFICATION_APPROVED';
    case 'INSURANCE':
      return 'INSURANCE_APPROVED';
    case 'COMPANY_LETTERHEAD':
      return 'COMPANY_LETTERHEAD_APPROVED';
    case 'RIGHT_TO_WORK_SHARE_CODE':
    case 'RIGHT_TO_WORK_DOCUMENT':
      return 'RIGHT_TO_WORK_VERIFIED';
    case 'HMRC_CIS_DOCUMENT':
      return 'HMRC_CIS_VERIFIED';
    default:
      return null;
  }
}

/** Trade-certification doc types — any one approved promotes a worker to CERTIFIED. */
export const CERT_DOC_TYPES = [
  'CSCS_CARD',
  'GAS_SAFE_CERT',
  'NICEIC_CERT',
  'FIRAS_CERT',
] as const;

/** Document statuses — the four-state machine. */
export const DOCUMENT_STATUSES = [
  'PENDING',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const TERMINAL_DOCUMENT_STATUSES: DocumentStatus[] = [
  'APPROVED',
  'REJECTED',
];
