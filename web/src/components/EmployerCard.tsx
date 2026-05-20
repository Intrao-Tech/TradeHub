import type { ReactNode } from 'react';
import { Briefcase, Star } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VerificationBadge, verificationFromLevel } from './VerificationBadge';
import { cn } from '@/lib/utils';

export type EmployerCardData = {
  id: string | number;
  company_name?: string | null;
  industry?: string | null;
  postcode_area?: string | null;
  active_jobs_count?: number | null;
  rating_average?: string | number | null;
  rating_count?: number | null;
  client_profile?: {
    display_name?: string | null;
    verification_level?: string | number | null;
    avatar_url?: string | null;
    postcode_area?: string | null;
  } | null;
  _count?: { job_posts?: number };
};

type EmployerCardProps = {
  employer: EmployerCardData;
  onSelect?: (employer: EmployerCardData) => void;
  actions?: ReactNode;
  selected?: boolean;
  className?: string;
};

function initials(name?: string | null): string {
  if (!name) return 'E';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
}

export function EmployerCard({ employer, onSelect, actions, selected, className }: EmployerCardProps) {
  const name = employer.company_name ?? employer.client_profile?.display_name ?? 'Employer';
  const avatar = employer.client_profile?.avatar_url ?? undefined;
  const postcode = employer.postcode_area ?? employer.client_profile?.postcode_area ?? null;
  const verification = verificationFromLevel(employer.client_profile?.verification_level);
  const rating = employer.rating_average != null ? Number(employer.rating_average) : null;
  const jobCount = employer.active_jobs_count ?? employer._count?.job_posts ?? null;

  return (
    <Card
      className={cn(
        'flex flex-col transition-colors',
        selected && 'ring-2 ring-ring',
        onSelect && 'cursor-pointer hover:border-border-strong',
        className,
      )}
      onClick={onSelect ? () => onSelect(employer) : undefined}
    >
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12 shrink-0 rounded-md">
            {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
            <AvatarFallback className="rounded-md">{initials(name)}</AvatarFallback>
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
          {rating != null ? (
            <span className="inline-flex items-center gap-1">
              <Star className="h-4 w-4 fill-primary text-primary" aria-hidden />
              {rating.toFixed(1)}
            </span>
          ) : null}
          {jobCount != null ? (
            <span className="inline-flex items-center gap-1 text-fg-muted">
              <Briefcase className="h-4 w-4" aria-hidden />
              {jobCount} active job{jobCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        {employer.industry ? (
          <p className="line-clamp-3 text-sm italic text-fg-muted">{employer.industry}</p>
        ) : null}

        {jobCount != null && jobCount > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="secondary"
              className="rounded-full px-3 py-1 text-xs font-medium"
            >
              Hiring
            </Badge>
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
EmployerCard.displayName = 'EmployerCard';
