import type { ReactNode } from 'react';
import { AlertTriangle, Clock, MapPin, Tag } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  status?: string;
  description?: string | null;
  created_at?: string | null;
  employer?: {
    company_name?: string | null;
    client_profile?: { display_name?: string | null } | null;
  } | null;
  specialisations?: Array<{ specialisation?: { name?: string; id?: number } }>;
  tags?: Array<{ tag?: { name?: string; id?: number } }>;
  _count?: { applications?: number };
};

type JobCardProps = {
  job: JobCardData;
  onSelect?: (job: JobCardData) => void;
  actions?: ReactNode;
  selected?: boolean;
  className?: string;
};

function payLine(j: JobCardData): string {
  if (j.pay_type === 'DAY_RATE') {
    const a = j.day_rate_min != null ? `£${j.day_rate_min}` : '—';
    const b = j.day_rate_max != null ? `£${j.day_rate_max}` : '—';
    return `${a} – ${b} / day`;
  }
  if (j.pay_type === 'FIXED_PRICE') {
    return j.fixed_price != null ? `£${j.fixed_price} fixed` : 'Fixed price';
  }
  return j.pay_type ?? '—';
}

function payTypeLabel(payType?: string): string {
  if (payType === 'DAY_RATE') return 'Day rate';
  if (payType === 'FIXED_PRICE') return 'Fixed price';
  return 'Job';
}

function relativeTime(iso?: string | null): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return null;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function JobCard({ job, onSelect, actions, selected, className }: JobCardProps) {
  const specs = (job.specialisations ?? [])
    .map((s) => s.specialisation?.name)
    .filter(Boolean) as string[];
  const tagNames = (job.tags ?? []).map((t) => t.tag?.name).filter(Boolean) as string[];
  const chips = [...specs, ...tagNames].slice(0, 3);
  const posted = relativeTime(job.created_at);
  const meta = posted
    ? `${payTypeLabel(job.pay_type)} · Posted ${posted}`
    : payTypeLabel(job.pay_type);

  return (
    <Card
      className={cn(
        'flex flex-col transition-colors',
        selected && 'ring-2 ring-ring',
        onSelect && 'cursor-pointer hover:border-border-strong',
        className,
      )}
      onClick={onSelect ? () => onSelect(job) : undefined}
    >
      <CardHeader className="space-y-2 pb-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold leading-tight text-fg">{job.title}</h3>
          {job.is_urgent ? (
            <Badge variant="danger" className="shrink-0 gap-1">
              <AlertTriangle className="h-3 w-3" />
              Urgent
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-fg-muted">{meta}</p>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-start gap-2">
            <Tag className="mt-0.5 h-5 w-5 shrink-0 text-fg" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-fg">{payLine(job)}</div>
              <div className="text-xs text-fg-muted">Pay</div>
            </div>
          </div>
          {job.duration_days != null ? (
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-fg" />
              <div>
                <div className="text-sm font-medium text-fg">
                  {job.duration_days} day{job.duration_days === 1 ? '' : 's'}
                </div>
                <div className="text-xs text-fg-muted">Duration</div>
              </div>
            </div>
          ) : job.postcode_area ? (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-fg" />
              <div>
                <div className="text-sm font-medium text-fg">{job.postcode_area}</div>
                <div className="text-xs text-fg-muted">Location</div>
              </div>
            </div>
          ) : null}
        </div>

        {job.description ? (
          <p className="line-clamp-2 text-sm text-fg-muted">{job.description}</p>
        ) : null}

        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <Badge key={c} variant="secondary" className="rounded-full px-3 py-1 text-xs font-medium">
                {c}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="mt-auto pt-1">
          <Button type="button" size="sm" tabIndex={-1}>
            See more
          </Button>
        </div>
      </CardContent>

      {actions ? (
        <CardFooter className="flex flex-wrap gap-2 border-t border-border-default pt-4">{actions}</CardFooter>
      ) : null}
    </Card>
  );
}
JobCard.displayName = 'JobCard';
