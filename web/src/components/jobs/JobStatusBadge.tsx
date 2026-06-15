import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import { Badge } from '@/components/ui/badge';

type JobStatus = 'OPEN' | 'CLOSED' | 'FILLED' | 'CANCELLED' | string;

const VARIANT_BY_STATUS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'outline'> = {
  OPEN: 'success',
  FILLED: 'info',
  CLOSED: 'danger',
  CANCELLED: 'danger',
};

const LABEL_KEY_BY_STATUS: Record<string, ParseKeys<'common'>> = {
  OPEN: 'jobStatus.open',
  FILLED: 'jobStatus.filled',
  CLOSED: 'jobStatus.closed',
  CANCELLED: 'jobStatus.cancelled',
};

const HINT_KEY_BY_STATUS: Record<string, ParseKeys<'common'>> = {
  OPEN: 'jobStatus.hint.open',
  FILLED: 'jobStatus.hint.filled',
  CLOSED: 'jobStatus.hint.closed',
  CANCELLED: 'jobStatus.hint.cancelled',
};

export function JobStatusBadge({ status }: { status: JobStatus | undefined }) {
  const { t } = useTranslation('common');
  if (!status) return null;
  const upper = String(status).toUpperCase();
  const variant = VARIANT_BY_STATUS[upper] ?? 'outline';
  const labelKey = LABEL_KEY_BY_STATUS[upper];
  const label = labelKey ? t(labelKey) : upper;
  const hintKey = HINT_KEY_BY_STATUS[upper];
  const tooltip = `${t('jobStatus.tooltipPrefix')}${
    hintKey ? ` — ${t(hintKey)}` : ''
  }`;
  return (
    <Badge variant={variant} title={tooltip}>
      {label}
    </Badge>
  );
}
JobStatusBadge.displayName = 'JobStatusBadge';
