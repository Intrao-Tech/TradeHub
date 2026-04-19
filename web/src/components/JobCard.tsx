import type { ReactNode } from 'react';
import { AlertTriangle, MapPin, Users } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type JobCardData = {
  id: string | number;
  title: string;
  pay_type?: string;
  day_rate_min?: string | number | null;
  day_rate_max?: string | number | null;
  fixed_price?: string | number | null;
  postcode_area?: string | null;
  is_urgent?: boolean;
  status?: string;
  description?: string | null;
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

function employerName(j: JobCardData): string {
  const d = j.employer?.client_profile?.display_name;
  const c = j.employer?.company_name;
  return (d && String(d)) || (c && String(c)) || 'Employer';
}

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

export function JobCard({ job, onSelect, actions, selected, className }: JobCardProps) {
  const specs = (job.specialisations ?? [])
    .map((s) => s.specialisation?.name)
    .filter(Boolean) as string[];
  const tags = (job.tags ?? []).map((t) => t.tag?.name).filter(Boolean) as string[];

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
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-fg">{job.title}</h3>
            <p className="truncate text-xs text-fg-muted">{employerName(job)}</p>
          </div>
          {job.is_urgent ? (
            <Badge variant="danger" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Urgent
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="text-sm font-medium text-fg">{payLine(job)}</div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
          {job.postcode_area ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {job.postcode_area}
            </span>
          ) : null}
          {job._count?.applications != null ? (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {job._count.applications} application{job._count.applications === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        {job.description ? (
          <p className="line-clamp-2 text-sm text-fg-muted">{job.description}</p>
        ) : null}
        {(specs.length > 0 || tags.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {specs.slice(0, 3).map((s) => (
              <Badge key={`s-${s}`} variant="secondary">{s}</Badge>
            ))}
            {tags.slice(0, 3).map((t) => (
              <Badge key={`t-${t}`} variant="outline">{t}</Badge>
            ))}
          </div>
        )}
      </CardContent>
      {actions ? (
        <CardFooter className="flex flex-wrap gap-2 border-t border-border-default pt-4">{actions}</CardFooter>
      ) : null}
    </Card>
  );
}
JobCard.displayName = 'JobCard';
