import { api } from '@/api';

export type HandoffStatus =
  | 'PENDING'
  | 'VIEWED'
  | 'CLAIMED'
  | 'APPLIED'
  | 'DECLINED'
  | 'REVOKED'
  | 'EXPIRED';

export type HandoffJobPost = {
  id: string;
  title: string;
  postcode_area: string | null;
  pay_type: string;
  day_rate_min: string | null;
  day_rate_max: string | null;
  fixed_price: string | null;
  status: string;
  employer_name: string | null;
};

export type Handoff = {
  id: string;
  token: string;
  link: string;
  status: HandoffStatus;
  message: string | null;
  earn_commission: boolean;
  expires_at: string;
  created_at: string;
  job_post: HandoffJobPost | null;
  from_worker: { id: string; display_name: string | null };
  to_worker: { id: string; display_name: string | null } | null;
  claimed_by_id: string | null;
};

export type HandoffWithViewer = Handoff & {
  viewer: {
    is_worker: boolean;
    is_hander: boolean;
    can_claim: boolean;
    target_mismatch: boolean;
  };
};

export function createHandoff(
  jobPostId: string | number,
  body: { to_worker_id?: string; message?: string; earn_commission?: boolean },
) {
  return api<Handoff>(`/job-posts/${jobPostId}/handoffs`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getHandoffByToken(token: string) {
  return api<HandoffWithViewer>(
    `/handoffs/by-token/${encodeURIComponent(token)}`,
  );
}

export function claimHandoff(token: string) {
  return api<Handoff>(`/handoffs/${encodeURIComponent(token)}/claim`, {
    method: 'POST',
  });
}

export function declineHandoff(token: string) {
  return api<Handoff>(`/handoffs/${encodeURIComponent(token)}/decline`, {
    method: 'POST',
  });
}

export function revokeHandoff(id: string | number) {
  return api<Handoff>(`/handoffs/${id}/revoke`, { method: 'POST' });
}

export function getMyHandoffs() {
  return api<{ outgoing: Handoff[]; incoming: Handoff[] }>('/handoffs/mine');
}
