import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, MessageSquareQuote } from 'lucide-react';
import { parseApiError } from '@/api';
import { formatRelative } from '@/lib/relative-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { StarRating } from '@/components/StarRating';
import { toast } from '@/components/ui/toast';
import {
  getUnpublishedReviews,
  publishReview,
  type Review,
  type ReviewListResponse,
} from '@/components/reviews/api';

const PAGE_SIZE = 20;
const COMMENT_PREVIEW_LIMIT = 200;

/**
 * REVIEW-040..044 — staff publish queue.
 */
export function ReviewsPublishQueueTab() {
  const { t } = useTranslation('admin');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReviewListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getUnpublishedReviews(page, PAGE_SIZE);
      setData(res);
    } catch (err) {
      setError(parseApiError(err)?.message ?? t('publishQueue.loadError'));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handlePublish(review: Review) {
    if (!data) return;
    const id = String(review.id);
    setPendingId(id);
    setActionError(null);
    const previousItems = data.items;
    setData({
      ...data,
      items: data.items.filter((r) => String(r.id) !== id),
      total: Math.max(0, data.total - 1),
    });
    try {
      await publishReview(id);
      toast.success(t('publishQueue.publishedToast'));
    } catch (err) {
      setData((cur) =>
        cur ? { ...cur, items: previousItems, total: cur.total + 1 } : cur,
      );
      setActionError(parseApiError(err)?.message ?? t('publishQueue.publishError'));
    } finally {
      setPendingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-6">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          {t('publishQueue.retry')}
        </Button>
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareQuote className="h-4 w-4" />
            {t('publishQueue.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={CheckCircle2}
            title={t('publishQueue.emptyTitle')}
            description={t('publishQueue.emptyDesc')}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg">{t('publishQueue.title')}</h2>
        <span className="text-sm text-fg-muted">
          {t('publishQueue.pending', { count: data.total })}
        </span>
      </div>

      {actionError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {actionError}
        </div>
      ) : null}

      <ul className="space-y-3">
        {data.items.map((review) => (
          <li key={String(review.id)}>
            <QueueRow
              review={review}
              onPublish={() => void handlePublish(review)}
              publishing={pendingId === String(review.id)}
            />
          </li>
        ))}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm text-fg-muted">
        <span>
          {t('publishQueue.pageOf', {
            page: data.page,
            pages: Math.max(1, data.totalPages),
          })}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={data.page <= 1}
          >
            {t('publishQueue.previous')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={data.page >= Math.max(1, data.totalPages)}
          >
            {t('publishQueue.next')}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function QueueRow({
  review,
  onPublish,
  publishing,
}: {
  review: Review;
  onPublish: () => void;
  publishing: boolean;
}) {
  const { t } = useTranslation('admin');
  const collab = review.collaboration;
  const comment = review.comment ?? '';
  const truncated = comment.length > COMMENT_PREVIEW_LIMIT;
  const [expanded, setExpanded] = useState(false);
  const visibleComment = !truncated || expanded
    ? comment
    : `${comment.slice(0, COMMENT_PREVIEW_LIMIT)}…`;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{review.reviewer_role}</Badge>
            {collab?.id != null ? (
              <span className="text-sm text-fg-muted">
                {t('publishQueue.reviewingCollab')}{' '}
                <Button asChild variant="link" size="sm" className="px-0">
                  <Link to={`/collaborations/${collab.id}`}>
                    #{String(collab.id)}
                  </Link>
                </Button>
              </span>
            ) : null}
          </div>
          <span className="text-xs text-fg-muted">
            {t('publishQueue.submitted', {
              time: formatRelative(review.created_at, t) || '—',
            })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <StarRating
            value={review.overall_rating}
            size="sm"
            label={t('publishQueue.overallAria')}
          />
          <span className="text-sm text-fg">{review.overall_rating}/5</span>
        </div>

        <div className="text-sm text-fg">
          {comment ? (
            <>
              <p>{visibleComment}</p>
              {truncated ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="px-0"
                  onClick={() => setExpanded((e) => !e)}
                >
                  {expanded ? t('publishQueue.showLess') : t('publishQueue.readMore')}
                </Button>
              ) : null}
            </>
          ) : (
            <em className="text-fg-subtle">{t('publishQueue.noComment')}</em>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onPublish} disabled={publishing}>
            {publishing ? t('publishQueue.publishing') : t('publishQueue.publish')}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/reviews/${review.id}`}>
              {t('publishQueue.view')}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

ReviewsPublishQueueTab.displayName = 'ReviewsPublishQueueTab';
