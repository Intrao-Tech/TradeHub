export const CONTRACT_STATUS = {
  DRAFT: 'DRAFT',
  PROPOSED: 'PROPOSED',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
} as const;
export type ContractStatus =
  (typeof CONTRACT_STATUS)[keyof typeof CONTRACT_STATUS];

export const CONTRACT_END_REASON = {
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELED',
  ABANDONED: 'ABANDONED',
  DISPUTED_LOST: 'DISPUTED_LOST',
} as const;
export type ContractEndReason =
  (typeof CONTRACT_END_REASON)[keyof typeof CONTRACT_END_REASON];

export const CONTRACT_INITIATED_BY = {
  WORKER: 'WORKER',
  EMPLOYER: 'EMPLOYER',
} as const;
export type ContractInitiatedBy =
  (typeof CONTRACT_INITIATED_BY)[keyof typeof CONTRACT_INITIATED_BY];

// Milestone states that block ending a contract — must be resolved first.
export const CONTRACT_BLOCKING_MILESTONE_STATES = [
  'FUNDED',
  'SUBMITTED',
  'DISPUTED',
  'RELEASE_FAILED',
] as const;

export const CONTRACT_AUDIT_EVENTS = {
  CREATED: 'contract.created',
  PROPOSED: 'contract.proposed',
  ACCEPTED: 'contract.accepted',
  DECLINED: 'contract.declined',
  ENDED: 'contract.ended',
} as const;
