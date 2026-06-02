import type { ReactNode } from 'react';
import { MapPin, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { StarRating } from '@/components/StarRating';
import { VerificationBadge, verificationFromLevel } from './VerificationBadge';
import { cn } from '@/lib/utils';

export type EmployerCardData = {
  id: string | number;
  company_name?: string | null;
  industry?: string | null;
  postcode_area?: string | null;
  active_jobs_count?: number | null;
  team_size?: number | null;
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
    created_at?: string | null;
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

function formatMemberSince(iso?: string | null): string | null {
  return formatDate(iso, 'monthYear') || null;
}

export function EmployerCard({
  employer,
  onSelect,
  actions,
  selected,
  className,
}: EmployerCardProps) {
  const { t } = useTranslation('workers');
  const name =
    employer.company_name ??
    employer.client_profile?.display_name ??
    t('employerCard.fallbackName');
  const avatar = employer.client_profile?.avatar_url ?? undefined;
  const postcode =
    employer.postcode_area ?? employer.client_profile?.postcode_area ?? null;
  const city = employer.client_profile?.city ?? null;
  const location = [city, postcode].filter(Boolean).join(' · ');
  const verification = verificationFromLevel(
    employer.client_profile?.verification_level,
  );
  const showVerification = verification !== 'unverified';

  const ratingRaw = employer.rating_avg ?? employer.rating_average;
  const rating = ratingRaw != null ? Number(ratingRaw) : null;
  const reviewCount = employer.rating_count ?? null;
  const showRating =
    rating != null &&
    Number.isFinite(rating) &&
    reviewCount != null &&
    reviewCount > 0;

  const memberSince = formatMemberSince(employer.client_profile?.created_at);
  const teamSize = employer.team_size ?? null;
  const bio = employer.client_profile?.bio?.trim() || null;

  return (
    <Card
      className={cn(
        'flex flex-col gap-4 p-5 transition-colors',
        selected && 'ring-2 ring-ring',
        onSelect && 'cursor-pointer hover:border-border-strong',
        className,
      )}
      onClick={onSelect ? () => onSelect(employer) : undefined}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex flex-1 items-start gap-3 min-w-0">
          <Avatar className="h-14 w-14 shrink-0 rounded-md">
            {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
            <AvatarFallback className="rounded-md">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="truncate text-base font-semibold text-fg">{name}</h3>
            {bio ? (
              <p className="line-clamp-1 text-sm font-medium text-fg-muted">
                {bio}
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

      {showRating || teamSize != null || memberSince ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {showRating && rating != null ? (
            <span className="inline-flex items-center gap-1 text-fg-muted">
              <StarRating value={Math.round(rating)} size="sm" />
              <span className="font-medium text-fg">{rating.toFixed(1)}</span>
              <span>{t('common:reviews', { count: reviewCount })}</span>
            </span>
          ) : null}
          {teamSize != null ? (
            <span className="inline-flex items-center gap-1 text-fg-muted">
              <Users className="h-3.5 w-3.5" />
              {t('employerCard.teamOf', { count: teamSize })}
            </span>
          ) : null}
          {memberSince ? (
            <span className="text-fg-muted">{t('employerCard.memberSince', { date: memberSince })}</span>
          ) : null}
        </div>
      ) : null}

      <div>
        <Button type="button" size="sm" variant="outline" tabIndex={-1}>
          {t('card.seeProfile')}
        </Button>
      </div>
    </Card>
  );
}
EmployerCard.displayName = 'EmployerCard';
