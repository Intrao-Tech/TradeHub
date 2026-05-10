/**
 * Escrow domain constants — single source of truth for status enums and
 * audit-event names referenced across the spec. Importers MUST use these
 * tokens (not literal strings) so grep / refactors stay sound.
 */

/**
 * Milestone-level state machine (per ESCROW-002).
 * Terminal: RELEASED, REFUNDED, CANCELED. RELEASE_FAILED is transient.
 */
export const MILESTONE_STATUSES = [
  'REQUESTED',
  'PENDING',
  'FUNDED',
  'SUBMITTED',
  'RELEASED',
  'DISPUTED',
  'REFUNDED',
  'CANCELED',
  'DECLINED',
  'RELEASE_FAILED',
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const TERMINAL_MILESTONE_STATUSES: MilestoneStatus[] = [
  'RELEASED',
  'REFUNDED',
  'CANCELED',
  'DECLINED',
];

/**
 * Contract-level state machine (per ESCROW-005).
 * Terminal: ENDED, CANCELED.
 */
export const ESCROW_STATUSES = [
  'CREATED',
  'ACTIVE',
  'DISPUTED',
  'ENDED',
  'CANCELED',
] as const;
export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

/**
 * Dispute state machine (per ESCROW-004).
 * ARBITRATION_PENDING is reserved for future CIArb integration (not used in MVP).
 */
export const DISPUTE_STATUSES = [
  'OPEN',
  'RESPONDED',
  'MEDIATION',
  'RESOLVED',
  'ARBITRATION_PENDING',
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/**
 * Pending referral payout statuses.
 */
export const PENDING_PAYOUT_STATUSES = [
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELED',
] as const;
export type PendingPayoutStatus = (typeof PENDING_PAYOUT_STATUSES)[number];

/**
 * Stripe fee passthrough modes (per ESCROW-005, configurable in /admin/settings).
 */
export const STRIPE_FEE_PASSTHROUGH_MODES = [
  'EMPLOYER_PAYS',
  'PLATFORM_ABSORBS',
  'WORKER_ABSORBS',
] as const;
export type StripeFeePassthroughMode =
  (typeof STRIPE_FEE_PASSTHROUGH_MODES)[number];

/**
 * Stripe UK card processing rate. Used for fee preview + charge calculation
 * when stripe_fee_passthrough = EMPLOYER_PAYS.
 *
 * Source: https://stripe.com/gb/pricing — UK card transactions.
 * Formula: total = (target + fixed_fee_pence) / (1 - rate)
 */
export const STRIPE_UK_RATE = 0.015; // 1.5%
export const STRIPE_UK_FIXED_FEE_PENCE = 20;

/**
 * Auto-release window after milestone SUBMITTED (per Q6, Q17).
 * Default 7 days; configurable via env ESCROW_AUTO_RELEASE_HOURS.
 */
export const DEFAULT_AUTO_RELEASE_HOURS = 168; // 7 days

/**
 * End-contract auto-close silent window (per Q14).
 * Default 7 days; configurable via env ESCROW_END_CONTRACT_HOURS.
 */
export const DEFAULT_END_CONTRACT_HOURS = 168; // 7 days

/**
 * Dispute counterparty response window (per ESCROW-082).
 * Default 7 days; configurable via env ESCROW_DISPUTE_RESPONSE_HOURS.
 */
export const DEFAULT_DISPUTE_RESPONSE_HOURS = 168; // 7 days

/**
 * Minimum milestone amount in pence. Stripe Checkout requires £0.30 minimum;
 * we set higher for product sanity (£5 minimum makes sense for B2B construction).
 */
export const MIN_MILESTONE_AMOUNT_PENCE = 500; // £5.00

/**
 * Audit event names. Keep aligned with spec ESCROW-153.
 */
export const ESCROW_AUDIT_EVENTS = {
  ONBOARDING_STARTED: 'connect.onboarding.started',
  ONBOARDING_COMPLETED: 'connect.onboarding.completed',
  ONBOARDING_DEAUTHORIZED: 'connect.onboarding.deauthorized',
  MILESTONE_CREATED: 'escrow.milestone.created',
  MILESTONE_UPDATED: 'escrow.milestone.updated',
  MILESTONE_DELETED: 'escrow.milestone.deleted',
  MILESTONE_REQUEST_DECLINED: 'escrow.milestone.request_declined',
  MILESTONE_FUNDED: 'escrow.milestone.funded',
  MILESTONE_FUND_FAILED: 'escrow.milestone.fund_failed',
  MILESTONE_SUBMITTED: 'escrow.milestone.submitted',
  MILESTONE_RELEASED: 'escrow.milestone.released',
  MILESTONE_REFUNDED: 'escrow.milestone.refunded',
  MILESTONE_DISPUTED: 'escrow.milestone.disputed',
  MILESTONE_TRANSFER_FAILED: 'escrow.transfer.failed',
  DISPUTE_RESPONDED: 'escrow.dispute.responded',
  DISPUTE_RESOLVED: 'escrow.dispute.resolved',
  CONTRACT_END_INITIATED: 'escrow.contract.end_initiated',
  CONTRACT_ENDED: 'escrow.contract.ended',
  CONTRACT_CANCELED: 'escrow.contract.canceled',
  PLATFORM_SETTINGS_CHANGED: 'platform.settings_changed',
  PENDING_REFERRAL_PAID: 'escrow.referral.paid_backfill',
} as const;

/**
 * Compute the gross charge needed so that net (after Stripe processing fee)
 * equals the target net amount. UK card pricing: 1.5% + 20p deducted from charge.
 *
 *   charge = (target_net + fixed_fee_pence) / (1 - rate)
 *
 * Returns pence.
 */
export function grossUpForStripeFee(targetNetPence: number): number {
  return Math.ceil(
    (targetNetPence + STRIPE_UK_FIXED_FEE_PENCE) / (1 - STRIPE_UK_RATE),
  );
}

/**
 * Convert Decimal-style "12.34" to pence (Int) at the Stripe API boundary.
 * Always uses Math.round to handle floating-point edge cases.
 */
export function poundsStringToPence(amount: string | number): number {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return Math.round(n * 100);
}
