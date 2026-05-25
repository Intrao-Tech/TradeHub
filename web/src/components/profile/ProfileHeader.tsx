import { useEffect, useState } from 'react';
import { MapPin, CalendarCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  VerificationBadge,
  verificationFromLevel,
} from '../VerificationBadge';
import { MilestonesStrip } from '../MilestonesStrip';
import { StarRating } from '../StarRating';
import { publicFileUrl } from '../../lib/files';
import { api } from '../../api';

export type ProfileHeaderProps = {
  displayName: string;
  avatarUrl?: string | null;
  role: 'WORKER' | 'EMPLOYER' | 'CLIENT';
  city?: string | null;
  postcodeArea?: string | null;
  verificationLevel?: string | number | null;
  /** When provided, ProfileHeader fetches public milestone flags for this profile. */
  clientProfileId?: string | number | bigint | null;
  rating?: string | number | null;
  ratingCount?: number | null;
  /** Worker only: shows availability chip when present. */
  isAvailable?: boolean | null;
  /**
   * When true, suppresses the verified-milestones chip strip inside the
   * header. Use on pages that surface those signals separately (e.g. a
   * dedicated Verifications rail card).
   */
  hideMilestonesStrip?: boolean;
};

type PublicLevelResponse = {
  verification_level: string;
  flags?: {
    identity_verified?: boolean;
    insurance_approved?: boolean;
    company_house_verified?: boolean;
    company_letterhead_approved?: boolean;
    right_to_work_verified?: boolean;
    hmrc_cis_verified?: boolean;
    certification_doc_types?: string[];
  };
  reviews?: { count?: number; average?: number | null };
};

const ROLE_LABEL: Record<ProfileHeaderProps['role'], string> = {
  WORKER: 'Tradesperson',
  EMPLOYER: 'Employer',
  CLIENT: 'Client',
};

function initials(name: string): string {
  if (!name) return 'TH';
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || 'TH'
  );
}

export function ProfileHeader({
  displayName,
  avatarUrl,
  role,
  city,
  postcodeArea,
  verificationLevel,
  clientProfileId,
  rating,
  ratingCount,
  isAvailable,
  hideMilestonesStrip = false,
}: ProfileHeaderProps) {
  const ratingNum = rating != null ? Number(rating) : null;
  const hasReviews = ratingNum != null && (ratingCount ?? 0) > 0;
  const verification = verificationFromLevel(verificationLevel);
  const location = [city, postcodeArea].filter(Boolean).join(' · ');
  const renderedAvatar = publicFileUrl(avatarUrl);

  const [publicLevel, setPublicLevel] = useState<PublicLevelResponse | null>(
    null,
  );

  useEffect(() => {
    if (clientProfileId == null) return;
    let cancelled = false;
    api<PublicLevelResponse>(`/verification/levels/${clientProfileId}`)
      .then((d) => {
        if (!cancelled) setPublicLevel(d);
      })
      .catch(() => {
        // Public endpoint failures are non-fatal — header still renders.
      });
    return () => {
      cancelled = true;
    };
  }, [clientProfileId]);

  return (
    <header className="rounded-md border border-border-default bg-raised p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar className="h-20 w-20 sm:h-24 sm:w-24">
          {renderedAvatar ? (
            <AvatarImage src={renderedAvatar} alt={displayName} />
          ) : null}
          <AvatarFallback className="text-base">
            {initials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              {displayName}
            </h1>
            <Badge variant="secondary">{ROLE_LABEL[role]}</Badge>
            {role === 'WORKER' && isAvailable ? (
              <Badge variant="success" className="gap-1">
                <CalendarCheck className="h-3 w-3" />
                Available
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-fg-muted">
            {location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {location}
              </span>
            ) : null}
            <VerificationBadge state={verification} />
          </div>
          <div className="text-sm">
            {hasReviews ? (
              <div className="flex items-center gap-2">
                <StarRating value={Math.round(ratingNum!)} size="sm" />
                <span className="text-fg-muted">
                  {ratingNum!.toFixed(1)} · {ratingCount} review
                  {ratingCount === 1 ? '' : 's'}
                </span>
              </div>
            ) : (
              <span className="text-fg-muted">No reviews yet</span>
            )}
          </div>
          {publicLevel && !hideMilestonesStrip ? (
            <MilestonesStrip
              flags={publicLevel.flags}
              reviews={publicLevel.reviews}
            />
          ) : null}
        </div>
      </div>
    </header>
  );
}
