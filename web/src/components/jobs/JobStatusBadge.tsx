import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

type JobStatus = 'OPEN' | 'CLOSED' | 'FILLED' | 'CANCELLED' | string;

const VARIANT_BY_STATUS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'outline'> = {
  OPEN: 'success',
  FILLED: 'info',
  CLOSED: 'danger',
  CANCELLED: 'danger',
};

const LABEL_KEY_BY_STATUS: Record<string, string> = {
  OPEN: 'jobStatus.open',
  FILLED: 'jobStatus.filled',
  CLOSED: 'jobStatus.closed',
  CANCELLED: 'jobStatus.cancelled',
};

export function JobStatusBadge({ status }: { status: JobStatus | undefined }) {
  const { t } = useTranslation('common');
  if (!status) return null;
  const upper = String(status).toUpperCase();
  const variant = VARIANT_BY_STATUS[upper] ?? 'outline';
  const labelKey = LABEL_KEY_BY_STATUS[upper];
  const label = labelKey ? t(labelKey) : upper;
  return <Badge variant={variant}>{label}</Badge>;
}
JobStatusBadge.displayName = 'JobStatusBadge';
