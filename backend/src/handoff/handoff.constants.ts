import { randomBytes } from 'crypto';

/**
 * JobHandoff lifecycle states.
 * - PENDING  : created, not yet opened by a recipient
 * - VIEWED   : recipient opened the landing page
 * - CLAIMED  : a worker took ownership of the handoff (resolves an open link)
 * - APPLIED  : the claimer applied to the job via the handoff (terminal-success)
 * - DECLINED : the recipient declined
 * - REVOKED  : the hander cancelled it
 * - EXPIRED  : past `expires_at` (set lazily / by reads)
 */
export const HANDOFF_STATUS = {
  PENDING: 'PENDING',
  VIEWED: 'VIEWED',
  CLAIMED: 'CLAIMED',
  APPLIED: 'APPLIED',
  DECLINED: 'DECLINED',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
} as const;
export type HandoffStatus =
  (typeof HANDOFF_STATUS)[keyof typeof HANDOFF_STATUS];

/** States from which a handoff can still be claimed / consumed at apply time. */
export const HANDOFF_OPEN_STATUSES: HandoffStatus[] = [
  HANDOFF_STATUS.PENDING,
  HANDOFF_STATUS.VIEWED,
  HANDOFF_STATUS.CLAIMED,
];

/** Days a handoff link stays valid (mirrors the referral-intent window). */
export const HANDOFF_EXPIRY_DAYS = 30;

export const HANDOFF_NOTIFICATION_TYPE = 'JOB_HANDOFF';

export const HANDOFF_AUDIT_EVENTS = {
  CREATED: 'handoff.created',
  CLAIMED: 'handoff.claimed',
  APPLIED: 'handoff.applied',
  DECLINED: 'handoff.declined',
  REVOKED: 'handoff.revoked',
} as const;

/**
 * URL-safe opaque token for the share link. 24 random bytes → 32 base64url
 * chars, comfortably inside the VarChar(40) column and unguessable.
 */
export function generateHandoffToken(): string {
  return randomBytes(24).toString('base64url');
}
