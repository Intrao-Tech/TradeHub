import { Badge } from '@/components/ui/badge';

type AppStatus =
  | 'PENDING'
  | 'REVIEWED'
  | 'SHORTLISTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | string;

const VARIANT_BY_STATUS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'outline'> = {
  PENDING: 'warning',
  REVIEWED: 'warning',
  SHORTLISTED: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'danger',
};

const LABEL_BY_STATUS: Record<string, string> = {
  PENDING: 'Pending',
  REVIEWED: 'Reviewed',
  SHORTLISTED: 'Shortlisted',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export function ApplicationStatusBadge({ status }: { status: AppStatus | undefined }) {
  if (!status) return null;
  const upper = String(status).toUpperCase();
  const variant = VARIANT_BY_STATUS[upper] ?? 'outline';
  const label = LABEL_BY_STATUS[upper] ?? upper;
  return <Badge variant={variant}>{label}</Badge>;
}
ApplicationStatusBadge.displayName = 'ApplicationStatusBadge';
