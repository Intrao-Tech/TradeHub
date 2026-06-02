import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  VerificationBadge,
  verificationFromLevel,
} from '@/components/VerificationBadge';
import { StarRating } from '@/components/StarRating';
import { ApplicationStatusBadge } from './ApplicationStatusBadge';
import { AttachmentList } from './AttachmentList';
import { publicFileUrl } from '@/lib/files';
import { formatRelative } from '@/lib/relative-time';

export type ApplicantApplication = {
  id: string | number;
  status: string;
  initiated_by?: string;
  cover_message?: string | null;
  proposed_rate?: string | number | null;
  created_at?: string;
  worker_profile?: {
    id?: string | number;
    rating_avg?: string | number | null;
    rating_count?: number | null;
    client_profile?: {
      display_name?: string | null;
      avatar_url?: string | null;
      verification_level?: string | null;
    } | null;
  } | null;
  attachments?: Array<{
    id: string | number;
    original_name: string;
    mime_type: string;
    size_bytes: number;
  }>;
};

type ApplicantCardProps = {
  application: ApplicantApplication;
  pending: boolean;
  onTransition: (next: 'REVIEWED' | 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED') => void;
  onConvert: () => void;
};

export function ApplicantCard({
  application,
  pending,
  onTransition,
  onConvert,
}: ApplicantCardProps) {
  const { t } = useTranslation('jobs');
  const [coverExpanded, setCoverExpanded] = useState(false);

  const worker = application.worker_profile ?? null;
  const display = worker?.client_profile?.display_name ?? t('applicant.workerFallback');
  const avatarUrl = publicFileUrl(worker?.client_profile?.avatar_url ?? null);
  const initials = display
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
  const rating =
    worker?.rating_avg != null ? Number(worker.rating_avg) : null;
  const ratingCount = worker?.rating_count ?? 0;
  const status = (application.status ?? '').toUpperCase();
  const cover = application.cover_message ?? '';
  const isLongCover = cover.length > 240;
  const visibleCover = !coverExpanded && isLongCover ? `${cover.slice(0, 240)}…` : cover;

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border-default bg-raised p-4 sm:flex-row">
      <Avatar className="h-12 w-12">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {worker?.id != null ? (
            <Link
              to={`/workers/${worker.id}`}
              className="font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {display}
            </Link>
          ) : (
            <span className="font-medium text-fg">{display}</span>
          )}
          <VerificationBadge
            state={verificationFromLevel(
              worker?.client_profile?.verification_level ?? null,
            )}
          />
          <ApplicationStatusBadge status={application.status} />
          {application.initiated_by === 'EMPLOYER' ? (
            <Badge variant="info">{t('applicant.invitation')}</Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
          {rating != null && ratingCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <StarRating value={Math.round(rating)} size="sm" />
              {rating.toFixed(1)} ({ratingCount})
            </span>
          ) : (
            <span>{t('applicant.noReviews')}</span>
          )}
          {application.proposed_rate != null ? (
            <span>
              {t('applicant.proposedRate', {
                rate: formatMoney(Number(application.proposed_rate), { decimals: 0 }),
              })}
            </span>
          ) : null}
          {application.created_at ? (
            <span>{t('applicant.applied', { time: formatRelative(application.created_at) })}</span>
          ) : null}
        </div>
        {cover ? (
          <div>
            <p className="whitespace-pre-wrap text-sm text-fg">{visibleCover}</p>
            {isLongCover ? (
              <button
                type="button"
                onClick={() => setCoverExpanded((v) => !v)}
                className="mt-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {coverExpanded ? t('applicant.showLess') : t('applicant.readMore')}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm italic text-fg-muted">{t('applicant.noCover')}</p>
        )}
        <AttachmentList
          heading={t('applicant.workSamples')}
          attachments={application.attachments}
          previewImages
        />
        <ActionRow
          status={status}
          pending={pending}
          onTransition={onTransition}
          onConvert={onConvert}
        />
      </div>
    </li>
  );
}
ApplicantCard.displayName = 'ApplicantCard';

function ActionRow({
  status,
  pending,
  onTransition,
  onConvert,
}: {
  status: string;
  pending: boolean;
  onTransition: (next: 'REVIEWED' | 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED') => void;
  onConvert: () => void;
}) {
  const { t } = useTranslation('jobs');
  if (status === 'REJECTED' || status === 'WITHDRAWN') return null;

  if (status === 'ACCEPTED') {
    return (
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" disabled={pending} onClick={onConvert}>
          {t('applicant.viewCollaboration')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {status === 'PENDING' ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onTransition('REVIEWED')}
        >
          {t('applicant.markReviewed')}
        </Button>
      ) : null}
      {(status === 'PENDING' || status === 'REVIEWED') ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onTransition('SHORTLISTED')}
        >
          {t('applicant.shortlist')}
        </Button>
      ) : null}
      <Button size="sm" disabled={pending} onClick={() => onTransition('ACCEPTED')}>
        {t('applicant.accept')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => onTransition('REJECTED')}
      >
        {t('applicant.reject')}
      </Button>
    </div>
  );
}
