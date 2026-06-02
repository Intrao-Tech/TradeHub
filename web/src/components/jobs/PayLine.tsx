import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/lib/format';

type TFn = (key: string, opts?: Record<string, unknown>) => string;

type PayInput = {
  pay_type?: string | null;
  day_rate_min?: string | number | null;
  day_rate_max?: string | number | null;
  fixed_price?: string | number | null;
};

export function formatPay(j: PayInput, t: TFn): string {
  if (j.pay_type === 'DAY_RATE') {
    if (j.day_rate_min != null && j.day_rate_max != null) {
      const range = `${formatMoney(Number(j.day_rate_min), { decimals: 0 })}–${formatMoney(Number(j.day_rate_max), { decimals: 0 })}`;
      return t('pay.perDayRange', { range });
    }
    if (j.day_rate_min != null)
      return t('pay.fromPerDay', { rate: formatMoney(Number(j.day_rate_min), { decimals: 0 }) });
    if (j.day_rate_max != null)
      return t('pay.upToPerDay', { rate: formatMoney(Number(j.day_rate_max), { decimals: 0 }) });
    return t('card.payDayRate');
  }
  if (j.pay_type === 'FIXED_PRICE') {
    return j.fixed_price != null
      ? t('pay.fixedAmount', { amount: formatMoney(Number(j.fixed_price), { decimals: 0 }) })
      : t('card.payFixed');
  }
  return j.pay_type ?? '—';
}

export function PayLine({ job, className }: { job: PayInput; className?: string }) {
  const { t } = useTranslation('jobs');
  return <span className={className}>{formatPay(job, t)}</span>;
}
PayLine.displayName = 'PayLine';
