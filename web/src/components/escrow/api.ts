import { api } from '../../api';

export type FeeBreakdown = {
  job_amount: string;
  client_marketplace_fee: string;
  freelancer_service_fee: string;
  referral_commission: string;
  worker_payout: string;
  platform_keep: string;
  stripe_fee_estimate: string;
  employer_charge: string;
  employer_charge_pence: number;
  worker_payout_pence: number;
  referral_commission_pence: number;
};

export type MilestoneAttachment = {
  id: string;
  phase: 'CREATION' | 'SUBMISSION';
  file_url: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by_id: string;
  created_at: string;
};

export type Milestone = {
  id: string | number;
  escrow_id: string | number;
  position: number;
  title: string;
  description?: string | null;
  created_by_role?: 'WORKER' | 'EMPLOYER';
  amount: string;
  status:
    | 'REQUESTED'
    | 'PENDING'
    | 'FUNDED'
    | 'SUBMITTED'
    | 'RELEASED'
    | 'DISPUTED'
    | 'REFUNDED'
    | 'CANCELED'
    | 'DECLINED'
    | 'RELEASE_FAILED';
  submission_message?: string | null;
  worker_submitted_at?: string | null;
  employer_approved_at?: string | null;
  released_at?: string | null;
  refunded_at?: string | null;
  disputed_at?: string | null;
  release_attempts?: number;
  refund_reason?: string | null;
  created_at?: string;
  updated_at?: string;
  attachments?: MilestoneAttachment[];
  /** True when this RELEASED milestone has a PENDING/FAILED worker payout
   * because the worker hadn't connected Stripe at release time. Funds are
   * held on the platform until they finish onboarding. */
  worker_payout_on_hold?: boolean;
};

export type Escrow = {
  id: string | number;
  collaboration_id: string | number;
  status: 'CREATED' | 'ACTIVE' | 'DISPUTED' | 'ENDED' | 'CANCELED';
  job_amount: string;
  platform_fee: string;
  referral_commission: string;
  worker_payout: string;
  currency: string;
  deposit_confirmed_at?: string | null;
  released_at?: string | null;
  refunded_at?: string | null;
  disputed_at?: string | null;
  end_initiated_at?: string | null;
  end_initiated_by?: string | null;
  ended_at?: string | null;
  created_at?: string;
};

export function listMilestones(escrowId: string | number) {
  return api<Milestone[]>(`/escrow/${escrowId}/milestones`);
}

export function getEscrowByCollaboration(collaborationId: string | number) {
  return api<Escrow | null>(`/escrow/collaboration/${collaborationId}`);
}

export function getEscrowByContract(contractId: string | number) {
  return api<Escrow | null>(`/escrow/by-contract/${contractId}`);
}

export function createMilestone(
  escrowId: string | number,
  data: {
    title: string;
    amount: string;
    position?: number;
    description?: string | null;
  },
) {
  return api<Milestone>(`/escrow/${escrowId}/milestones`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateMilestone(
  milestoneId: string | number,
  data: {
    title?: string;
    amount?: string;
    position?: number;
    description?: string | null;
  },
) {
  return api<Milestone>(`/escrow/milestones/${milestoneId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteMilestone(milestoneId: string | number) {
  return api<void>(`/escrow/milestones/${milestoneId}`, { method: 'DELETE' });
}

export function approveMilestoneRequest(milestoneId: string | number) {
  return api<Milestone>(
    `/escrow/milestones/${milestoneId}/approve-request`,
    { method: 'POST' },
  );
}

export function declineMilestoneRequest(milestoneId: string | number) {
  return api<Milestone>(
    `/escrow/milestones/${milestoneId}/decline-request`,
    { method: 'POST' },
  );
}

/** Multipart upload — file under field name "file". phase=CREATION|SUBMISSION. */
export async function uploadMilestoneAttachment(
  milestoneId: string | number,
  file: File,
  phase: 'CREATION' | 'SUBMISSION' = 'CREATION',
): Promise<MilestoneAttachment> {
  const fd = new FormData();
  fd.append('file', file);
  const url = `/escrow/milestones/${milestoneId}/attachments?phase=${phase}`;
  return api<MilestoneAttachment>(url, {
    method: 'POST',
    body: fd,
    // The api() wrapper preserves headers; we deliberately omit Content-Type
    // so the browser sets the multipart boundary itself.
  });
}

export function deleteMilestoneAttachment(attachmentId: string | number) {
  return api<void>(`/escrow/milestones/attachments/${attachmentId}`, {
    method: 'DELETE',
  });
}

export function fundMilestone(milestoneId: string | number) {
  return api<{
    checkout_url: string;
    session_id: string;
    breakdown: FeeBreakdown;
    worker_onboarding_pending: boolean;
  }>(`/escrow/milestones/${milestoneId}/fund`, { method: 'POST' });
}

export function submitMilestone(
  milestoneId: string | number,
  message?: string,
) {
  return api<Milestone>(`/escrow/milestones/${milestoneId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function approveMilestone(milestoneId: string | number) {
  return api<Milestone>(`/escrow/milestones/${milestoneId}/approve`, {
    method: 'POST',
  });
}

export function retryRelease(milestoneId: string | number) {
  return api<Milestone>(`/escrow/milestones/${milestoneId}/retry-release`, {
    method: 'POST',
  });
}

export function previewFee(amount: string, hasReferral: boolean) {
  const params = new URLSearchParams({ amount, has_referral: String(hasReferral) });
  return api<FeeBreakdown>(`/escrow/fee-preview?${params.toString()}`);
}

export function refundMilestone(milestoneId: string | number, reason: string) {
  return api<Milestone>(`/escrow/milestones/${milestoneId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export type DisputeRow = {
  id: string | number;
  milestone_id: string | number;
  filed_by: string | number;
  reason: string;
  status: 'OPEN' | 'RESPONDED' | 'MEDIATION' | 'RESOLVED' | 'ARBITRATION_PENDING';
  response?: string | null;
  responded_at?: string | null;
  resolution?: { worker_pct: number; employer_refund_pct: number; platform_kept_fee: boolean } | null;
  resolved_at?: string | null;
  resolution_reasoning?: string | null;
  created_at?: string;
};

export function fileDispute(milestoneId: string | number, reason: string) {
  return api<DisputeRow>(`/escrow/milestones/${milestoneId}/dispute`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function respondDispute(
  disputeId: string | number,
  response: string,
  resolution: 'accept' | 'reject',
) {
  return api<DisputeRow>(`/escrow/disputes/${disputeId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ response, resolution }),
  });
}

export function listOpenDisputes() {
  return api<unknown[]>(`/escrow/admin/disputes`);
}

export function resolveDispute(
  disputeId: string | number,
  body: {
    worker_pct: number;
    employer_refund_pct: number;
    platform_kept_fee: boolean;
    reasoning: string;
  },
) {
  return api<DisputeRow>(`/escrow/admin/disputes/${disputeId}/resolve`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// Post-CR refactor these now accept a CONTRACT id (not a collaboration id).
// Routes still mounted under /escrow/collaboration/:id for URL back-compat;
// the controller resolves :id → contract before delegating.
export function cancelEscrow(contractId: string | number, reason: string) {
  return api<{ ok: true }>(`/escrow/collaboration/${contractId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function declineContract(contractId: string | number, reason: string) {
  return api<{ ok: true; refunded_count: number; refunded_amount: string }>(
    `/escrow/collaboration/${contractId}/decline`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
}

export function initiateEndContract(contractId: string | number) {
  return api<Escrow>(`/escrow/collaboration/${contractId}/end-contract`, {
    method: 'POST',
  });
}

export type WalletData = {
  onboarding: { has_account: boolean; payouts_enabled: boolean };
  active_escrow: Array<{
    milestone_id: string;
    title: string;
    amount: string;
    status: string;
    contract_id: string;
    expected_payout: string;
  }>;
  released_history: Array<{
    milestone_id: string;
    title: string;
    amount: string;
    released_at: string | null;
    contract_id: string;
  }>;
  pending_worker_payouts: Array<{
    id: string;
    amount: string;
    milestone_id: string;
    milestone_title: string;
    contract_id: string;
    status: string;
    failure_reason: string | null;
    created_at: string;
  }>;
  pending_referral_payouts: Array<{
    id: string;
    amount: string;
    milestone_title: string;
    created_at: string;
  }>;
  failed_transfers: Array<{
    milestone_id: string;
    amount: string;
    contract_id: string;
    title: string;
  }>;
};

export function getWallet() {
  return api<WalletData>('/escrow/wallet/me');
}

export type PlatformSettings = {
  id: number;
  client_marketplace_fee_percent: string;
  freelancer_service_fee_percent: string;
  account_referral_pct: string;
  account_referral_window_months: number | null;
  project_referral_w2w_pct: string;
  project_referral_e2e_pct: string;
  stripe_fee_passthrough: 'EMPLOYER_PAYS' | 'PLATFORM_ABSORBS' | 'WORKER_ABSORBS';
  updated_at?: string;
  updated_by?: string | null;
};

export function getPlatformSettings() {
  return api<PlatformSettings>('/escrow/admin/settings/platform');
}

export function updatePlatformSettings(
  patch: Partial<{
    client_marketplace_fee_percent: number;
    freelancer_service_fee_percent: number;
    account_referral_pct: number;
    account_referral_window_months: number | null;
    project_referral_w2w_pct: number;
    project_referral_e2e_pct: number;
    stripe_fee_passthrough: 'EMPLOYER_PAYS' | 'PLATFORM_ABSORBS' | 'WORKER_ABSORBS';
  }>,
) {
  return api<PlatformSettings>('/escrow/admin/settings/platform', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

// ── Contract domain ─────────────────────────────────────────────

export type ContractStatus = 'DRAFT' | 'PROPOSED' | 'ACTIVE' | 'ENDED';
export type ContractEndReason =
  | 'COMPLETED'
  | 'CANCELED'
  | 'ABANDONED'
  | 'DISPUTED_LOST';

export type ContractRow = {
  id: string;
  collaboration_id: string;
  position: number;
  status: ContractStatus;
  end_reason: ContractEndReason | null;
  agreed_amount: string | null;
  project_type: string | null;
  site_postcode: string | null;
  initiated_by: 'WORKER' | 'EMPLOYER';
  project_referrer_id: string | null;
  project_referrer_role: 'WORKER' | 'EMPLOYER' | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  escrow_transaction?: { id: string; status: string } | null;
};

export function listContracts(collabId: string | number) {
  return api<ContractRow[]>(`/collaborations/${collabId}/contracts`);
}

export function getContract(contractId: string | number) {
  return api<
    ContractRow & {
      collaboration: {
        id: string;
        worker: { client_profile: { display_name: string } };
        employer: { client_profile: { display_name: string } };
      };
    }
  >(`/contracts/${contractId}`);
}

export function createContract(
  collabId: string | number,
  data: {
    project_type: string;
    site_postcode?: string;
    agreed_amount?: number;
    initiated_by: 'WORKER' | 'EMPLOYER';
    job_post_id?: number;
  },
) {
  return api<ContractRow>(`/collaborations/${collabId}/contracts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function hireAgain(
  collabId: string | number,
  data: {
    project_type: string;
    site_postcode?: string;
    agreed_amount?: number;
    initiated_by: 'WORKER' | 'EMPLOYER';
  },
) {
  return api<ContractRow>(`/collaborations/${collabId}/hire-again`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function proposeContract(contractId: string | number) {
  return api<ContractRow>(`/contracts/${contractId}/propose`, {
    method: 'POST',
  });
}

export function respondToContract(
  contractId: string | number,
  accept: boolean,
) {
  return api<ContractRow>(`/contracts/${contractId}/respond`, {
    method: 'PATCH',
    body: JSON.stringify({ accept }),
  });
}

export function endContract(
  contractId: string | number,
  end_reason: 'COMPLETED' | 'CANCELED' | 'ABANDONED',
) {
  return api<ContractRow>(`/contracts/${contractId}/end`, {
    method: 'POST',
    body: JSON.stringify({ end_reason }),
  });
}

// ── Referral domain ────────────────────────────────────────────

export type AccountReferralStats = {
  window_months: number | null;
  lifetime_signups: number;
  total_earned_gbp: string;
  items: Array<{
    account_id: string;
    email: string;
    display_name: string | null;
    referred_at: string | null;
    window_ends_at: string | null;
  }>;
};

export type ProjectShare = {
  applications: Array<{
    id: string;
    job_post: { id: string; title: string } | null;
    status: string;
    created_at: string;
  }>;
  contracts: Array<{
    id: string;
    status: string;
    agreed_amount: string | null;
    project_type: string | null;
    collaboration: { worker: { client_profile: { display_name: string } } };
  }>;
};

export function getOwnReferralCode() {
  return api<{ code: string; link: string }>('/referrals/code');
}

export function getAccountReferralStats() {
  return api<AccountReferralStats>('/referrals/account-stats');
}

export function getProjectShareStats() {
  return api<ProjectShare>('/referrals/project-shares');
}

export function getIncomingAttribution() {
  return api<{
    referrer: { account_id: string; display_name: string | null } | null;
    total_paid_gbp: string;
  }>('/referrals/incoming');
}

export function getReferralPendingPayouts() {
  return api<
    Array<{
      id: string;
      milestone_id: string;
      contract_id: string | null;
      type: string;
      amount: string;
      status: string;
      created_at: string;
    }>
  >('/referrals/pending-payouts');
}

export function retryReferralPendingPayouts() {
  return api<{ paid: number; failed: number; skipped: number }>(
    '/referrals/pending-payouts/retry',
    { method: 'POST' },
  );
}

export function trackProjectClick(body: {
  code: string;
  target_id: number;
  target_role: 'WORKER' | 'EMPLOYER';
}) {
  return api<{
    referrer_display_name: string | null;
    target: { type: 'JOB' | 'WORKER'; id: string; title: string };
  }>('/referral/track-click', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function lookupReferrerByCode(code: string) {
  return api<{ display_name: string | null }>(
    `/referral/who-referred?code=${encodeURIComponent(code)}`,
  );
}
