import { Badge } from '@/components/ui/badge';

type JobStatus = 'OPEN' | 'CLOSED' | 'FILLED' | 'CANCELLED' | string;

const VARIANT_BY_STATUS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'outline'> = {
  OPEN: 'success',
  FILLED: 'info',
  CLOSED: 'danger',
  CANCELLED: 'danger',
};

const LABEL_BY_STATUS: Record<string, string> = {
  OPEN: 'Open',
  FILLED: 'Filled',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export function JobStatusBadge({ status }: { status: JobStatus | undefined }) {
  if (!status) return null;
  const upper = String(status).toUpperCase();
  const variant = VARIANT_BY_STATUS[upper] ?? 'outline';
  const label = LABEL_BY_STATUS[upper] ?? upper;
  return <Badge variant={variant}>{label}</Badge>;
}
JobStatusBadge.displayName = 'JobStatusBadge';
