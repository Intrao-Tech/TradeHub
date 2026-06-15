import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
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

const LABEL_KEY_BY_STATUS: Record<string, ParseKeys<'common'>> = {
  PENDING: 'appStatus.pending',
  REVIEWED: 'appStatus.reviewed',
  SHORTLISTED: 'appStatus.shortlisted',
  ACCEPTED: 'appStatus.accepted',
  REJECTED: 'appStatus.rejected',
  WITHDRAWN: 'appStatus.withdrawn',
};

const HINT_KEY_BY_STATUS: Record<string, ParseKeys<'common'>> = {
  PENDING: 'appStatus.hint.pending',
  REVIEWED: 'appStatus.hint.reviewed',
  SHORTLISTED: 'appStatus.hint.shortlisted',
  ACCEPTED: 'appStatus.hint.accepted',
  REJECTED: 'appStatus.hint.rejected',
  WITHDRAWN: 'appStatus.hint.withdrawn',
};

export function ApplicationStatusBadge({ status }: { status: AppStatus | undefined }) {
  const { t } = useTranslation('common');
  if (!status) return null;
  const upper = String(status).toUpperCase();
  const variant = VARIANT_BY_STATUS[upper] ?? 'outline';
  const labelKey = LABEL_KEY_BY_STATUS[upper];
  const label = labelKey ? t(labelKey) : upper;
  const hintKey = HINT_KEY_BY_STATUS[upper];
  const tooltip = `${t('appStatus.tooltipPrefix')}${
    hintKey ? ` — ${t(hintKey)}` : ''
  }`;
  return (
    <Badge variant={variant} title={tooltip}>
      {label}
    </Badge>
  );
}
ApplicationStatusBadge.displayName = 'ApplicationStatusBadge';
