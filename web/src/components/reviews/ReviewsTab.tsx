import { useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { parseApiError } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { ReviewCard } from './ReviewCard';
import { ReviewDetailDialog } from './ReviewDetailDialog';
import {
  getReviewsByEmployer,
  getReviewsByWorker,
  type Review,
  type ReviewListResponse,
} from './api';

const PAGE_SIZE = 10;

type ReviewsTabProps = {
  subjectId: string | number;
  subjectKind: 'worker' | 'employer';
  subjectName?: string | null;
};

/**
 * REVIEW-020..024 — paginated public review list rendered in the
 * Reviews tab on `/workers/:id` and `/employers/:id`.
 */
export function ReviewsTab({
  subjectId,
  subjectKind,
  subjectName,
}: ReviewsTabProps) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReviewListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<Review | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetcher =
        subjectKind === 'worker' ? getReviewsByWorker : getReviewsByEmployer;
      const res = await fetcher(subjectId, page, PAGE_SIZE);
      setData(res);
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Could not load reviews.');
    } finally {
      setLoading(false);
    }
  }, [subjectId, subjectKind, page]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-6">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-16 w-full" />
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
          Retry
        </Button>
      </div>
    );
  }

  if (!data || data.total === 0) {
    const subject = subjectName ?? (subjectKind === 'worker' ? 'this worker' : 'this employer');
    return (
      <EmptyState
        icon={Star}
        title="No reviews yet"
        description={`${subject}'s first review will appear here once a collaboration completes.`}
      />
    );
  }

  const { items, total, totalPages } = data;
  const currentPage = data.page;

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {items.map((r) => (
          <li key={String(r.id)}>
            <ReviewCard review={r} onClick={() => setSelected(r)} />
          </li>
        ))}
      </ul>

      <ReviewDetailDialog
        review={selected}
        open={selected != null}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
      />

      <footer className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm text-fg-muted">
        <span>
          Page {currentPage} of {Math.max(1, totalPages)} · {total} review
          {total === 1 ? '' : 's'}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={currentPage >= Math.max(1, totalPages)}
          >
            Next
          </Button>
        </div>
      </footer>
    </div>
  );
}

ReviewsTab.displayName = 'ReviewsTab';
