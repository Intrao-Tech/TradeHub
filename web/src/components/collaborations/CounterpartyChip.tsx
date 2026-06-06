import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerificationBadge, verificationFromLevel } from '@/components/VerificationBadge';
import { StarRating } from '@/components/StarRating';

export type ClientProfileLite = {
  id?: string | number | null;
  display_name?: string | null;
  avatar_url?: string | null;
  verification_level?: string | number | null;
  slug?: string | null;
};

export type CounterpartyParty = {
  id?: string | number;
  client_profile?: ClientProfileLite | null;
  rating_avg?: string | number | null;
  rating_count?: number | null;
};

type Props = {
  party: CounterpartyParty | null | undefined;
  role: 'WORKER' | 'EMPLOYER';
  showRating?: boolean;
  showBadge?: boolean;
  size?: 'sm' | 'md';
};

export function CounterpartyChip({
  party,
  role,
  showRating = true,
  showBadge = true,
  size = 'md',
}: Props) {
  const { t } = useTranslation('collaborations');
  const cp = party?.client_profile ?? null;
  const name =
    cp?.display_name ??
    (role === 'WORKER' ? t('chip.workerFallback') : t('chip.employerFallback'));
  const initial = name.charAt(0).toUpperCase() || '?';
  const level = cp?.verification_level ?? null;
  const ratingAvg = party?.rating_avg != null ? Number(party.rating_avg) : 0;
  const ratingCount = party?.rating_count ?? 0;

  const profileHref =
    role === 'WORKER' && party?.id != null
      ? `/workers/${String(party.id)}`
      : role === 'EMPLOYER' && party?.id != null
        ? `/employers/${String(party.id)}`
        : null;

  const avatarSize =
    size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className={avatarSize}>
        {cp?.avatar_url ? <AvatarImage src={cp.avatar_url} alt={name} /> : null}
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {profileHref ? (
            <Link
              to={profileHref}
              className="truncate text-sm font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {name}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium text-fg">{name}</span>
          )}
          {showBadge ? (
            <VerificationBadge state={verificationFromLevel(level)} />
          ) : null}
        </div>
        {showRating && ratingCount > 0 ? (
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <StarRating value={Math.round(ratingAvg)} size="sm" />
            <span>
              {ratingAvg.toFixed(1)} · {t('chip.reviews', { count: ratingCount })}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
CounterpartyChip.displayName = 'CounterpartyChip';
