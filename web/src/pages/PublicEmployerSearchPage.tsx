import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Lock, ShieldCheck, Star } from 'lucide-react';
import { api } from '../api';
import { EmployerCard, type EmployerCardData } from '@/components/EmployerCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';

type EmployerRow = EmployerCardData & {
  rating_avg?: string | number;
  team_size?: number | null;
};

type EmployerSearchResponse = {
  data: EmployerRow[];
  total: number;
  page: number;
  limit: number;
};

const SAMPLE_LIMIT = 20;

export default function PublicEmployerSearchPage() {
  const navigate = useNavigate();
  const [results, setResults] = useState<EmployerSearchResponse | null>(null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<EmployerSearchResponse>(
          `/employer-profiles?page=1&limit=${SAMPLE_LIMIT}`,
        );
        if (!cancelled) setResults(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    if (!results || hasLoadedMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await api<EmployerSearchResponse>(
        `/employer-profiles?page=2&limit=${SAMPLE_LIMIT}`,
      );
      setResults((prev) =>
        prev ? { ...next, data: [...prev.data, ...next.data] } : next,
      );
      setHasLoadedMore(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }

  const canLoadMore =
    results != null && !hasLoadedMore && results.total > results.data.length;

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="employer-search-hero-title"
        className="px-2 py-10 text-center sm:py-14"
      >
        <h1
          id="employer-search-hero-title"
          className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl"
        >
          Find employers hiring across the UK
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

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        {results ? (
          results.data.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {results.data.map((emp) => (
                <EmployerCard
                  key={String(emp.id)}
                  employer={emp}
                  onSelect={(picked) =>
                    navigate(`/employers/${String(picked.id)}`)
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Building2}
              title="No employers yet"
              description="Check back soon."
            />
          )
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
              {loadingMore ? 'Loading…' : 'Load more employers'}
            </Button>
          </div>
        ) : null}

        {hasLoadedMore ? (
          <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row sm:gap-6">
            <p className="text-base font-medium text-fg">
              Want to browse more employers?
            </p>
            <Button asChild size="lg">
              <Link to="/register?next=/employers">Sign up</Link>
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
