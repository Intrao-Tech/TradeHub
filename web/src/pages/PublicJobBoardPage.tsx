import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, Lock, ShieldCheck, Star } from 'lucide-react';
import { api, parseApiError } from '../api';
import { JobCard, type JobCardData } from '@/components/JobCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';

type JobPostRow = JobCardData & {
  pay_type: string;
  description?: string | null;
};

type JobListResponse = {
  items: JobPostRow[];
  total: number;
  page: number;
  limit: number;
};

const SAMPLE_SIZE = 20;

export default function PublicJobBoardPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<JobListResponse | null>(null);
  const [listError, setListError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<JobListResponse>(
          `/job-posts?status=OPEN&page=1&limit=${SAMPLE_SIZE}`,
        );
        if (!cancelled) setList(data);
      } catch (e) {
        if (!cancelled) {
          setListError(parseApiError(e)?.message ?? 'Could not load jobs.');
          setList(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    if (!list || hasLoadedMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await api<JobListResponse>(
        `/job-posts?status=OPEN&page=2&limit=${SAMPLE_SIZE}`,
      );
      setList((prev) =>
        prev ? { ...next, items: [...prev.items, ...next.items] } : next,
      );
      setHasLoadedMore(true);
    } catch (e) {
      setListError(parseApiError(e)?.message ?? 'Could not load more jobs.');
    } finally {
      setLoadingMore(false);
    }
  }

  const canLoadMore =
    list != null && !hasLoadedMore && list.total > list.items.length;

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="job-board-hero-title"
        className="px-2 py-10 text-center sm:py-14"
      >
        <h1
          id="job-board-hero-title"
          className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl"
        >
          Find your next trade job in the UK
        </h1>
        <ul
          className="mx-auto mt-4 flex max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-fg-muted"
          aria-label="Why TradeHub"
        >
          <li className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Verified employers
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Star className="h-4 w-4 text-primary" aria-hidden="true" />
            Two-way reviews
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Lock className="h-4 w-4 text-primary" aria-hidden="true" />
            Escrow payments
          </li>
        </ul>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link to="/register?next=/jobs">Apply</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link to="/register?next=/my-jobs">Hiring? Post a job</Link>
          </Button>
        </div>
      </section>

      {listError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {listError}
        </div>
      ) : null}

      <section className="space-y-4">
        {list ? (
          <h2 className="text-lg font-semibold tracking-tight">
            Check out a sample of the {list.total} jobs posted on TradeHub
          </h2>
        ) : null}
        {list?.items?.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {list.items.map((j) => (
              <JobCard
                key={String(j.id)}
                job={j}
                onSelect={() => navigate(`/jobs/${j.id}`)}
              />
            ))}
          </div>
        ) : list ? (
          <EmptyState
            icon={Briefcase}
            title="No jobs yet"
            description="Check back soon."
          />
        ) : (
          <p className="text-sm text-fg-muted">Loading…</p>
        )}

        {canLoadMore ? (
          <div className="flex justify-center pt-4">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={loadMore}
              disabled={loadingMore}
              className="border-primary bg-transparent text-primary hover:bg-primary/5"
            >
              {loadingMore ? 'Loading…' : 'Load more jobs'}
            </Button>
          </div>
        ) : null}

        {hasLoadedMore ? (
          <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row sm:gap-6">
            <p className="text-base font-medium text-fg">
              Want to browse more jobs?
            </p>
            <Button asChild size="lg">
              <Link to="/register?next=/jobs">Sign up</Link>
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
