import type { ReactNode } from 'react';
import { Briefcase, Star } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VerificationBadge, verificationFromLevel } from './VerificationBadge';
import { cn } from '@/lib/utils';

export type WorkerCardData = {
  id: string | number;
  headline?: string | null;
  hourly_rate?: string | number | null;
  day_rate?: string | number | null;
  postcode_area?: string | null;
  avatar_url?: string | null;
  rating_average?: string | number | null;
  rating_count?: number | null;
  client_profile?: {
    display_name?: string | null;
    verification_level?: string | number | null;
    avatar_url?: string | null;
    postcode_area?: string | null;
  } | null;
  specialisations?: Array<{ specialisation?: { name?: string; id?: number } }>;
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
  if (w.day_rate != null) return `£${w.day_rate}/day`;
  if (w.hourly_rate != null) return `£${w.hourly_rate}/hr`;
  return null;
}

export function WorkerCard({ worker, onSelect, actions, selected, className }: WorkerCardProps) {
  const name = worker.client_profile?.display_name ?? 'Worker';
  const avatar = worker.avatar_url ?? worker.client_profile?.avatar_url ?? undefined;
  const postcode = worker.postcode_area ?? worker.client_profile?.postcode_area ?? null;
  const verification = verificationFromLevel(worker.client_profile?.verification_level);
  const specs = (worker.specialisations ?? [])
    .map((s) => s.specialisation?.name)
    .filter(Boolean) as string[];
  const tagNames = (worker.tags ?? []).map((t) => t.tag?.name).filter(Boolean) as string[];
  const chips = [...specs, ...tagNames].slice(0, 3);
  const rating = worker.rating_average != null ? Number(worker.rating_average) : null;
  const reviewCount = worker.rating_count ?? null;
  const rate = rateLine(worker);

  return (
    <Card
      className={cn(
        'flex flex-col transition-colors',
        selected && 'ring-2 ring-ring',
        onSelect && 'cursor-pointer hover:border-border-strong',
        className,
      )}
      onClick={onSelect ? () => onSelect(worker) : undefined}
    >
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-fg">{name}</h3>
            {postcode ? (
              <p className="truncate text-sm text-fg-muted">{postcode}</p>
            ) : null}
            <div className="mt-1">
              <VerificationBadge state={verification} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-fg">
          {rate ? <span>{rate}</span> : null}
          {rating != null ? (
            <span className="inline-flex items-center gap-1">
              <Star className="h-4 w-4 fill-primary text-primary" aria-hidden />
              {rating.toFixed(1)}
            </span>
          ) : null}
          {reviewCount != null && reviewCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-fg-muted">
              <Briefcase className="h-4 w-4" aria-hidden />
              {reviewCount} review{reviewCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        {worker.headline ? (
          <p className="line-clamp-3 text-sm italic text-fg-muted">{worker.headline}</p>
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

        <Button type="button" className="mt-auto w-full" tabIndex={-1}>
          See profile
        </Button>
      </CardContent>

      {actions ? (
        <CardFooter className="flex flex-wrap gap-2 border-t border-border-default pt-4">{actions}</CardFooter>
      ) : null}
    </Card>
  );
}
WorkerCard.displayName = 'WorkerCard';
