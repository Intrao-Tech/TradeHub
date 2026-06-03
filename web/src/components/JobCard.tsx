import type { ReactNode } from 'react';
import { AlertTriangle, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StarRating } from '@/components/StarRating';
import {
  VerificationBadge,
  verificationFromLevel,
} from '@/components/VerificationBadge';
import { cn } from '@/lib/utils';
import { specLabel, tagLabel } from '@/lib/specialisations';

export type JobCardData = {
  id: string | number;
  title: string;
  pay_type?: string;
  day_rate_min?: string | number | null;
  day_rate_max?: string | number | null;
  fixed_price?: string | number | null;
  postcode_area?: string | null;
  duration_days?: number | null;
  is_urgent?: boolean;
  is_saved?: boolean;
  status?: string;
  description?: string | null;
  created_at?: string | null;
  employer?: {
    company_name?: string | null;
    rating_avg?: string | number | null;
    rating_count?: number | null;
    client_profile?: {
      display_name?: string | null;
      verification_level?: string | null;
    } | null;
  } | null;
  specialisations?: Array<{ specialisation?: { name?: string; id?: number } }>;
  tags?: Array<{ tag?: { name?: string; id?: number } }>;
  _count?: { applications?: number };
};

type JobCardProps = {
  job: JobCardData;
  onSelect?: (job: JobCardData) => void;
  actions?: ReactNode;
  // Rendered in the top-right of the header row (after the Urgent badge).
  // Used by `/jobs` to mount the SaveJobButton — kept as an opt-in slot so
  // unrelated screens (e.g. `MyJobsPage`) are not forced to add a save UI.
  headerSlot?: ReactNode;
  selected?: boolean;
  className?: string;
};

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function payLine(j: JobCardData, t: TFn): string | null {
  if (j.pay_type === 'DAY_RATE') {
    if (j.day_rate_min == null && j.day_rate_max == null) return t('card.payDayRate');
    const a = j.day_rate_min != null ? formatMoney(Number(j.day_rate_min), { decimals: 0 }) : '—';
    const b = j.day_rate_max != null ? formatMoney(Number(j.day_rate_max), { decimals: 0 }) : '—';
    return t('card.payDayRateRange', { range: `${a}–${b}` });
  }
  if (j.pay_type === 'FIXED_PRICE') {
    return j.fixed_price != null
      ? t('card.payFixedAmount', {
          amount: formatMoney(Number(j.fixed_price), { decimals: 0 }),
        })
      : t('card.payFixed');
  }
  return null;
}

function relativeTime(iso: string | null | undefined, t: TFn): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return null;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return t('card.justNow');
  if (min < 60) return t('card.minutesAgo', { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('card.hoursAgo', { count: hr });
  const days = Math.floor(hr / 24);
  if (days < 30) return t('card.daysAgo', { count: days });
  const months = Math.floor(days / 30);
  if (months < 12) return t('card.monthsAgo', { count: months });
  const years = Math.floor(months / 12);
  return t('card.yearsAgo', { count: years });
}

function proposalsLabel(n: number | undefined, t: TFn): string {
  if (n == null) return t('card.proposalsNone');
  if (n >= 50) return t('card.proposalsMany');
  if (n < 5) return t('card.proposalsFew');
  return t('card.proposalsCount', { count: n });
}

export function JobCard({
  job,
  onSelect,
  actions,
  headerSlot,
  selected,
  className,
}: JobCardProps) {
  const { t } = useTranslation('jobs');
  const specs = (job.specialisations ?? [])
    .map((s) => (s.specialisation?.name ? specLabel(s.specialisation.name, t) : null))
    .filter(Boolean) as string[];
  const tagNames = (job.tags ?? [])
    .map((tg) => (tg.tag?.name ? tagLabel(tg.tag.name, t) : null))
    .filter(Boolean) as string[];
  const chips = [...specs, ...tagNames].slice(0, 5);
  const posted = relativeTime(job.created_at, t);
  const pay = payLine(job, t);
  const proposals = proposalsLabel(job._count?.applications, t);

  const ratingCount = job.employer?.rating_count ?? 0;
  const ratingAvg =
    job.employer?.rating_avg != null ? Number(job.employer.rating_avg) : 0;
  const showRating = ratingCount > 0 && Number.isFinite(ratingAvg);

  const verificationState = verificationFromLevel(
    job.employer?.client_profile?.verification_level,
  );
  const showVerification = verificationState !== 'unverified';

  const durationLabel =
    job.duration_days != null
      ? t('card.durationDays', { count: job.duration_days })
      : null;

  return (
    <Card
      className={cn(
        'flex flex-col gap-3 p-5 transition-colors',
        selected && 'ring-2 ring-ring',
        onSelect && 'cursor-pointer hover:border-border-strong',
        className,
      )}
      onClick={onSelect ? () => onSelect(job) : undefined}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
        {posted ? <span>{t('card.posted', { time: posted })}</span> : null}
        {posted ? <span aria-hidden="true">·</span> : null}
        <span>{proposals}</span>
        <div className="ml-auto flex items-center gap-2">
          {job.is_urgent ? (
            <Badge variant="danger" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {t('card.urgent')}
            </Badge>
          ) : null}
          {headerSlot}
        </div>
      </div>

      <h3 className="text-lg font-semibold leading-tight text-fg break-words">
        {job.title}
      </h3>

      {pay || durationLabel ? (
        <p className="text-sm text-fg-muted">
          {[pay, durationLabel ? t('card.duration', { value: durationLabel }) : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}

      {job.description ? (
        <p className="line-clamp-2 text-sm text-fg-muted">{job.description}</p>
      ) : null}

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <Badge
              key={c}
              variant="secondary"
              className="rounded-full px-3 py-1 text-xs font-medium"
            >
              {c}
            </Badge>
          ))}
        </div>
      ) : null}

      {showVerification || showRating || job.postcode_area ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-fg-muted">
          {showVerification ? (
            <VerificationBadge state={verificationState} />
          ) : null}
          {showRating ? (
            <span className="inline-flex items-center gap-1">
              <StarRating value={Math.round(ratingAvg)} size="sm" />
              <span className="font-medium text-fg">
                {ratingAvg.toFixed(1)}
              </span>
              <span>{t('common:reviews', { count: ratingCount })}</span>
            </span>
          ) : null}
          {job.postcode_area ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {job.postcode_area}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" tabIndex={-1}>
          {t('card.seeMore')}
        </Button>
        {actions}
      </div>
    </Card>
  );
}
JobCard.displayName = 'JobCard';
