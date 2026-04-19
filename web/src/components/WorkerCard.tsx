import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { VerificationBadge, verificationFromLevel } from './VerificationBadge';
import { StarRating } from './StarRating';
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
  if (w.day_rate != null) return `£${w.day_rate} / day`;
  if (w.hourly_rate != null) return `£${w.hourly_rate} / hr`;
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
  const tags = (worker.tags ?? []).map((t) => t.tag?.name).filter(Boolean) as string[];
  const rating = worker.rating_average != null ? Number(worker.rating_average) : null;
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
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-11 w-11">
            {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-fg">{name}</h3>
            {worker.headline ? (
              <p className="truncate text-xs text-fg-muted">{worker.headline}</p>
            ) : null}
            <div className="mt-1">
              <VerificationBadge state={verification} />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
          {postcode ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {postcode}
            </span>
          ) : null}
          {rate ? <span className="font-medium text-fg">{rate}</span> : null}
        </div>
        {rating != null ? (
          <div className="flex items-center gap-2">
            <StarRating value={Math.round(rating)} size="sm" />
            <span className="text-xs text-fg-muted">
              {rating.toFixed(1)}
              {worker.rating_count != null ? ` · ${worker.rating_count} reviews` : ''}
            </span>
          </div>
        ) : null}
        {(specs.length > 0 || tags.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {specs.slice(0, 3).map((s) => (
              <Badge key={`s-${s}`} variant="secondary">{s}</Badge>
            ))}
            {tags.slice(0, 2).map((t) => (
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
WorkerCard.displayName = 'WorkerCard';
