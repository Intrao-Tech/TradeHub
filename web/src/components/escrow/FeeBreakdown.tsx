import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/lib/format';
import type { FeeBreakdown } from './api';

const fmt = (s: string) => formatMoney(Number(s));

type FeeBreakdownProps = {
  breakdown: FeeBreakdown;
  hasReferral: boolean;
  className?: string;
};

/**
 * Transparent breakdown for the employer Fund flow:
 *   Job amount + service fee + Stripe = total (employer pays)
 *   → worker payout + platform keep + (referral)
 *
 * Mirrors Upwork's pre-checkout summary so the employer sees exactly where
 * each pound goes before clicking through to Stripe Checkout.
 */
export function FeeBreakdown({ breakdown, hasReferral, className }: FeeBreakdownProps) {
  const { t } = useTranslation('wallet');
  return (
    <div
      className={`rounded-md border border-border-default bg-raised p-3 text-sm ${
        className ?? ''
      }`}
    >
      <div className="space-y-1.5 text-fg">
        <Row label={t('fees.milestoneAmount')} value={fmt(breakdown.job_amount)} />
        <Row
          label={t('fees.serviceFee')}
          value={`+ ${fmt(breakdown.client_marketplace_fee)}`}
          muted
        />
        <Row
          label={t('fees.stripeProcessing')}
          value={`+ ${fmt(breakdown.stripe_fee_estimate)}`}
          muted
        />
        <div className="my-1 border-t border-border-default" />
        <Row
          label={t('fees.totalYouPay')}
          value={fmt(breakdown.employer_charge)}
          bold
        />
      </div>
      <div className="mt-3 space-y-1.5 text-xs text-fg-muted">
        <Row label={t('fees.workerReceives')} value={fmt(breakdown.worker_payout)} />
        {hasReferral ? (
          <Row label={t('fees.referrerReceives')} value={fmt(breakdown.referral_commission)} />
        ) : null}
        <Row label={t('fees.platformKeeps')} value={fmt(breakdown.platform_keep)} />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : ''}`}>
      <span className={muted ? 'text-fg-muted' : ''}>{label}</span>
      <span className={muted ? 'text-fg-muted' : ''}>{value}</span>
    </div>
  );
}
