import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { StarRating } from '@/components/StarRating';
import { cn } from '@/lib/utils';
import { formatDate as formatDateLib } from '@/lib/format';
import type { Review } from './api';

/**
 * REVIEW-021 — shared review display used by profile-page lists,
 * the permalink page, and (preview-only) the staff queue.
 */

const SUB_RATINGS = [
  { key: 'quality_rating', labelKey: 'review.quality' },
  { key: 'reliability_rating', labelKey: 'review.reliability' },
  { key: 'communication_rating', labelKey: 'review.communication' },
  { key: 'payment_rating', labelKey: 'review.payment' },
  { key: 'safety_rating', labelKey: 'review.safety' },
] as const;

type SubKey = (typeof SUB_RATINGS)[number]['key'];

function formatDate(value?: string | null): string | null {
  return formatDateLib(value) || null;
}

type ReviewCardProps = {
  review: Review;
  onClick?: () => void;
  className?: string;
};

export function ReviewCard({
  review,
  onClick,
  className,
}: ReviewCardProps) {
  const { t } = useTranslation('common');
  const reviewerLabel =
    review.reviewer_role === 'EMPLOYER' ? t('review.fromEmployer') : t('review.fromWorker');
  const publishedAt = formatDate(review.published_at);
  const collab = review.collaboration;
  const projectType = collab?.project_type ?? null;
  const startDate = formatDate(collab?.started_at);
  const endDate = formatDate(collab?.ended_at);

  let datesLabel: string | null = null;
  if (startDate && endDate) datesLabel = `${startDate} – ${endDate}`;
  else if (startDate) datesLabel = t('review.started', { date: startDate });
  else if (endDate) datesLabel = t('review.ended', { date: endDate });

  const inner = (
    <Card
      className={cn(
        onClick && 'transition-colors hover:bg-subtle',
        className,
      )}
    >
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <span>{reviewerLabel}</span>
            {publishedAt ? (
              <>
                <span aria-hidden>·</span>
                <time>{publishedAt}</time>
              </>
            ) : null}
          </div>
          {!review.is_published ? (
            <Badge variant="warning">{t('review.draft')}</Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <StarRating
            value={review.overall_rating}
            size="md"
            label={t('review.overallRating')}
          />
          <span className="text-sm font-medium text-fg">
            {review.overall_rating} / 5
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-5">
          {SUB_RATINGS.map(({ key, labelKey }) => (
            <SubRatingRow
              key={key}
              label={t(labelKey)}
              value={review[key as SubKey] ?? null}
            />
          ))}
        </dl>

        <p className="text-sm text-fg">
          {review.comment ? (
            review.comment
          ) : (
            <em className="text-fg-subtle">{t('review.noComment')}</em>
          )}
        </p>

        {projectType || datesLabel ? (
          <footer className="flex flex-wrap items-center gap-2 border-t border-border-default pt-3 text-xs text-fg-muted">
            {projectType ? <span>{t('review.project', { type: projectType })}</span> : null}
            {projectType && datesLabel ? <span aria-hidden>·</span> : null}
            {datesLabel ? <span>{datesLabel}</span> : null}
          </footer>
        ) : null}
      </CardContent>
    </Card>
  );

  if (!onClick) return inner;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {inner}
    </button>
  );
}

ReviewCard.displayName = 'ReviewCard';

function SubRatingRow({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-fg-subtle">{label}</dt>
      <dd>
        {value != null ? (
          <StarRating value={value} size="sm" label={label} />
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </dd>
    </div>
  );
}
