import type { FeeBreakdown } from './api';

const fmt = (s: string) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Number(s));

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
  return (
    <div
      className={`rounded-md border border-border-default bg-raised p-3 text-sm ${
        className ?? ''
      }`}
    >
      <div className="space-y-1.5 text-fg">
        <Row label="Milestone amount" value={fmt(breakdown.job_amount)} />
        <Row
          label="Platform service fee"
          value={`+ ${fmt(breakdown.client_marketplace_fee)}`}
          muted
        />
        <Row
          label="Stripe processing"
          value={`+ ${fmt(breakdown.stripe_fee_estimate)}`}
          muted
        />
        <div className="my-1 border-t border-border-default" />
        <Row
          label="Total you pay"
          value={fmt(breakdown.employer_charge)}
          bold
        />
      </div>
      <div className="mt-3 space-y-1.5 text-xs text-fg-muted">
        <Row label="Worker receives" value={fmt(breakdown.worker_payout)} />
        {hasReferral ? (
          <Row label="Referrer receives" value={fmt(breakdown.referral_commission)} />
        ) : null}
        <Row label="Platform keeps" value={fmt(breakdown.platform_keep)} />
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
