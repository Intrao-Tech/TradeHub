import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, ShieldCheck, Star, Users } from 'lucide-react';
import { api } from '../api';
import { WorkerCard, type WorkerCardData } from '@/components/WorkerCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';

type WorkerSpec = {
  specialisation_id?: string | number;
  specialisation?: { id?: string | number; name?: string; slug?: string };
};

type WorkerRow = WorkerCardData & {
  rating_avg?: string | number;
  day_rate_min?: string | number | null;
  day_rate_max?: string | number | null;
  is_available?: boolean;
  worker_specialisations?: WorkerSpec[];
};

type WorkerSearchResponse = {
  data: WorkerRow[];
  total: number;
  page: number;
  limit: number;
};

const SAMPLE_LIMIT = 20;

export default function PublicWorkerSearchPage() {
  const navigate = useNavigate();
  const [results, setResults] = useState<WorkerSearchResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<WorkerSearchResponse>(
          `/worker-profiles?page=1&limit=${SAMPLE_LIMIT}`,
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

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="worker-search-hero-title"
        className="px-2 py-10 text-center sm:py-14"
      >
        <h1
          id="worker-search-hero-title"
          className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl"
        >
          Hire verified tradespeople in the UK
        </h1>
        <ul
          className="mx-auto mt-4 flex max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-fg-muted"
          aria-label="Why TradeHub"
        >
          <li className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Verified tradespeople
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
            <Link to="/register?next=/workers">Hire</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link to="/register?next=/jobs">Looking for work?</Link>
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {results.data.map((w) => (
                <WorkerCard
                  key={String(w.id)}
                  worker={w}
                  onSelect={(picked) =>
                    navigate(`/workers/${String(picked.id)}`)
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Users}
              title="No workers yet"
              description="Check back soon."
            />
          )
        ) : (
          <p className="text-sm text-fg-muted">Loading…</p>
        )}
      </section>
    </div>
  );
}
