type PayInput = {
  pay_type?: string | null;
  day_rate_min?: string | number | null;
  day_rate_max?: string | number | null;
  fixed_price?: string | number | null;
};

export function formatPay(j: PayInput): string {
  if (j.pay_type === 'DAY_RATE') {
    if (j.day_rate_min != null && j.day_rate_max != null) {
      return `£${j.day_rate_min}–£${j.day_rate_max} / day`;
    }
    if (j.day_rate_min != null) return `From £${j.day_rate_min} / day`;
    if (j.day_rate_max != null) return `Up to £${j.day_rate_max} / day`;
    return 'Day rate';
  }
  if (j.pay_type === 'FIXED_PRICE') {
    return j.fixed_price != null ? `Fixed £${j.fixed_price}` : 'Fixed price';
  }
  return j.pay_type ?? '—';
}

export function PayLine({ job, className }: { job: PayInput; className?: string }) {
  return <span className={className}>{formatPay(job)}</span>;
}
PayLine.displayName = 'PayLine';
