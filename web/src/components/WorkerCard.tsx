import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StarRating } from '@/components/StarRating';
import { VerificationBadge, verificationFromLevel } from './VerificationBadge';
import { cn } from '@/lib/utils';

export type WorkerCardData = {
  id: string | number;
  headline?: string | null;
  hourly_rate?: string | number | null;
  day_rate?: string | number | null;
  day_rate_min?: string | number | null;
  day_rate_max?: string | number | null;
  years_experience?: number | null;
  is_available?: boolean;
  postcode_area?: string | null;
  avatar_url?: string | null;
  rating_avg?: string | number | null;
  rating_average?: string | number | null;
  rating_count?: number | null;
  client_profile?: {
    display_name?: string | null;
    verification_level?: string | number | null;
    avatar_url?: string | null;
    postcode_area?: string | null;
    city?: string | null;
    bio?: string | null;
  } | null;
  specialisations?: Array<{ specialisation?: { name?: string; id?: number } }>;
  worker_specialisations?: Array<{
    specialisation?: { name?: string; id?: number };
  }>;
  tags?: Array<{ tag?: { name?: string; id?: number } }>;
};

type WorkerCardProps = {
  worker: WorkerCardData;
  onSelect?: (worker: WorkerCardData) => void;
  actions?: ReactNode;
  selected?: boolean;
  className?: string;
};

function initials(name?: string | null): string {
  if (!name) return 'W';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
}

function rateLine(w: WorkerCardData): string | null {
  if (w.day_rate_min != null || w.day_rate_max != null) {
    const a = w.day_rate_min != null ? `£${w.day_rate_min}` : '—';
    const b = w.day_rate_max != null ? `£${w.day_rate_max}` : '—';
    if (a === b) return `${a}/day`;
    return `${a}–${b}/day`;
  }
  if (w.day_rate != null) return `£${w.day_rate}/day`;
  if (w.hourly_rate != null) return `£${w.hourly_rate}/hr`;
  return null;
}

export function WorkerCard({
  worker,
  onSelect,
  actions,
  selected,
  className,
}: WorkerCardProps) {
  const name = worker.client_profile?.display_name ?? 'Worker';
  const avatar =
    worker.avatar_url ?? worker.client_profile?.avatar_url ?? undefined;
  const postcode =
    worker.postcode_area ?? worker.client_profile?.postcode_area ?? null;
  const city = worker.client_profile?.city ?? null;
  const location = [city, postcode].filter(Boolean).join(' · ');
  const verification = verificationFromLevel(
    worker.client_profile?.verification_level,
  );
  const showVerification = verification !== 'unverified';

  const specs = (worker.specialisations ?? worker.worker_specialisations ?? [])
    .map((s) => s.specialisation?.name)
    .filter(Boolean) as string[];
  const tagNames = (worker.tags ?? [])
    .map((t) => t.tag?.name)
    .filter(Boolean) as string[];
  const allChips = [...specs, ...tagNames];
  const visibleChips = allChips.slice(0, 5);
  const overflowCount = allChips.length - visibleChips.length;

  const ratingRaw = worker.rating_avg ?? worker.rating_average;
  const rating = ratingRaw != null ? Number(ratingRaw) : null;
  const reviewCount = worker.rating_count ?? null;
  const showRating =
    rating != null &&
    Number.isFinite(rating) &&
    reviewCount != null &&
    reviewCount > 0;

  const rate = rateLine(worker);
  const headline =
    worker.headline?.trim() || worker.client_profile?.bio?.trim() || null;
  const years = worker.years_experience ?? null;

  return (
    <Card
      className={cn(
        'flex flex-col gap-4 p-5 transition-colors',
        selected && 'ring-2 ring-ring',
        onSelect && 'cursor-pointer hover:border-border-strong',
        className,
      )}
      onClick={onSelect ? () => onSelect(worker) : undefined}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex flex-1 items-start gap-3 min-w-0">
          <Avatar className="h-14 w-14 shrink-0">
            {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate text-base font-semibold text-fg">
                {name}
              </h3>
              {worker.is_available ? (
                <span className="inline-flex items-center gap-1 text-xs text-success">
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-success"
                    aria-hidden
                  />
                  Available now
                </span>
              ) : null}
            </div>
            {headline ? (
              <p className="line-clamp-1 text-sm font-medium text-fg-muted">
                {headline}
              </p>
            ) : null}
            {location ? (
              <p className="inline-flex items-center gap-1 text-xs text-fg-muted">
                <MapPin className="h-3.5 w-3.5" />
                {location}
              </p>
            ) : null}
            {showVerification ? (
              <div className="pt-1">
                <VerificationBadge state={verification} />
              </div>
            ) : null}
          </div>
        </div>
        {actions ?? null}
      </div>

      {rate || showRating || years != null ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {rate ? <span className="font-semibold text-fg">{rate}</span> : null}
          {showRating && rating != null ? (
            <span className="inline-flex items-center gap-1 text-fg-muted">
              <StarRating value={Math.round(rating)} size="sm" />
              <span className="font-medium text-fg">{rating.toFixed(1)}</span>
              <span>
                ({reviewCount} review{reviewCount === 1 ? '' : 's'})
              </span>
            </span>
          ) : null}
          {years != null ? (
            <span className="text-fg-muted">
              {years} year{years === 1 ? '' : 's'} exp
            </span>
          ) : null}
        </div>
      ) : null}

      {visibleChips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {visibleChips.map((c) => (
            <Badge
              key={c}
              variant="secondary"
              className="rounded-full px-3 py-1 text-xs font-medium"
            >
              {c}
            </Badge>
          ))}
          {overflowCount > 0 ? (
            <Badge
              variant="secondary"
              className="rounded-full px-3 py-1 text-xs font-medium"
            >
              +{overflowCount}
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div>
        <Button type="button" size="sm" variant="outline" tabIndex={-1}>
          See profile
        </Button>
      </div>
    </Card>
  );
}
WorkerCard.displayName = 'WorkerCard';
