import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { StarRating } from '@/components/StarRating';
import { cn } from '@/lib/utils';
import type { Review } from './api';

/**
 * REVIEW-021 — shared review display used by profile-page lists,
 * the permalink page, and (preview-only) the staff queue.
 */

const SUB_RATINGS = [
  { key: 'quality_rating', label: 'Quality' },
  { key: 'reliability_rating', label: 'Reliability' },
  { key: 'communication_rating', label: 'Communication' },
  { key: 'payment_rating', label: 'Payment' },
  { key: 'safety_rating', label: 'Safety' },
] as const;

type SubKey = (typeof SUB_RATINGS)[number]['key'];

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type ReviewCardProps = {
  review: Review;
  linkToPermalink?: boolean;
  className?: string;
};

export function ReviewCard({
  review,
  linkToPermalink = true,
  className,
}: ReviewCardProps) {
  const reviewerLabel =
    review.reviewer_role === 'EMPLOYER' ? 'From an employer' : 'From a worker';
  const publishedAt = formatDate(review.published_at);
  const collab = review.collaboration;
  const projectType = collab?.project_type ?? null;
  const startDate = formatDate(collab?.started_at);
  const endDate = formatDate(collab?.ended_at);

  let datesLabel: string | null = null;
  if (startDate && endDate) datesLabel = `${startDate} – ${endDate}`;
  else if (startDate) datesLabel = `Started ${startDate}`;
  else if (endDate) datesLabel = `Ended ${endDate}`;

  const inner = (
    <Card
      className={cn(
        linkToPermalink && 'transition-colors hover:bg-subtle',
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
          <Badge variant={review.is_published ? 'success' : 'warning'}>
            {review.is_published ? 'Published' : 'Draft'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <StarRating
            value={review.overall_rating}
            size="md"
            label="Overall rating"
          />
          <span className="text-sm font-medium text-fg">
            {review.overall_rating} / 5
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-5">
          {SUB_RATINGS.map(({ key, label }) => (
            <SubRatingRow
              key={key}
              label={label}
              value={review[key as SubKey] ?? null}
            />
          ))}
        </dl>

        <p className="text-sm text-fg">
          {review.comment ? (
            review.comment
          ) : (
            <em className="text-fg-subtle">No comment</em>
          )}
        </p>

        {projectType || datesLabel ? (
          <footer className="flex flex-wrap items-center gap-2 border-t border-border-default pt-3 text-xs text-fg-muted">
            {projectType ? <span>Project: {projectType}</span> : null}
            {projectType && datesLabel ? <span aria-hidden>·</span> : null}
            {datesLabel ? <span>{datesLabel}</span> : null}
          </footer>
        ) : null}
      </CardContent>
    </Card>
  );

  if (!linkToPermalink) return inner;

  return (
    <Link
      to={`/reviews/${review.id}`}
      className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {inner}
    </Link>
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
