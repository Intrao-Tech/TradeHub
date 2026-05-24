/**
 * Catalog of admin action codes (mirrors admin_action_type seeded in migration).
 * Used for compile-time safety when invoking AdminActionsService.execute.
 */

export const ADMIN_ACTIONS = {
  // Payments
  PAYMENT_MARK_PAID: 'PAYMENT_MARK_PAID',
  PAYMENT_MARK_FAILED: 'PAYMENT_MARK_FAILED',
  PAYMENT_RETRY_TRANSFER: 'PAYMENT_RETRY_TRANSFER',
  // Escrow
  ESCROW_FORCE_RELEASE: 'ESCROW_FORCE_RELEASE',
  ESCROW_FORCE_REFUND: 'ESCROW_FORCE_REFUND',
  ESCROW_FORCE_CANCEL: 'ESCROW_FORCE_CANCEL',
  // Verification
  VERIFICATION_DOC_APPROVE: 'VERIFICATION_DOC_APPROVE',
  VERIFICATION_DOC_REJECT: 'VERIFICATION_DOC_REJECT',
  VERIFICATION_LEVEL_OVERRIDE: 'VERIFICATION_LEVEL_OVERRIDE',
  // User
  USER_SUSPEND: 'USER_SUSPEND',
  USER_UNSUSPEND: 'USER_UNSUSPEND',
  USER_DELETE: 'USER_DELETE',
  // Platform
  PLATFORM_SETTING_UPDATE: 'PLATFORM_SETTING_UPDATE',
  // Staff
  STAFF_INVITE: 'STAFF_INVITE',
  STAFF_ROLE_GRANT: 'STAFF_ROLE_GRANT',
  STAFF_ROLE_REVOKE: 'STAFF_ROLE_REVOKE',
  // Comms
  BROADCAST_MESSAGE: 'BROADCAST_MESSAGE',
} as const;

export type AdminActionCode = typeof ADMIN_ACTIONS[keyof typeof ADMIN_ACTIONS];

/**
 * Catalog of target kinds (mirrors admin_target_kind seeded in migration).
 * Used as discriminator for staff_action_approval.target_id polymorphic FK.
 */
export const ADMIN_TARGET_KINDS = {
  PAYMENT: 'PAYMENT',
  CLIENT_PROFILE: 'CLIENT_PROFILE',
  ESCROW_MILESTONE: 'ESCROW_MILESTONE',
  DOCUMENT: 'DOCUMENT',
  ESCROW_DISPUTE: 'ESCROW_DISPUTE',
  CONTRACT: 'CONTRACT',
  PLATFORM_SETTING: 'PLATFORM_SETTING',
} as const;

export type AdminTargetKind = typeof ADMIN_TARGET_KINDS[keyof typeof ADMIN_TARGET_KINDS];

/**
 * Catalog of approval condition types (mirrors approval_condition_type seeded).
 */
export const APPROVAL_CONDITION_TYPES = {
  AMOUNT_GT: 'AMOUNT_GT',
  REQUESTING_STAFF_HAS_ROLE: 'REQUESTING_STAFF_HAS_ROLE',
  DOCUMENT_TYPE_EQUALS: 'DOCUMENT_TYPE_EQUALS',
} as const;

export type ApprovalConditionTypeName =
  typeof APPROVAL_CONDITION_TYPES[keyof typeof APPROVAL_CONDITION_TYPES];

/**
 * Action request context — opaque per action type, persisted as JSONB in
 * staff_action_approval.context so the deferred execution can run with the
 * exact same parameters as the original request.
 */
export type ActionContext = {
  // Common across all actions
  reason: string;
  // Optional money amount in pence (used by AMOUNT_GT condition)
  amount_pence?: number;
  // Optional document type (used by DOCUMENT_TYPE_EQUALS condition when target_kind=DOCUMENT)
  doc_type?: string;
  // Free-form action-specific params
  [key: string]: unknown;
};
