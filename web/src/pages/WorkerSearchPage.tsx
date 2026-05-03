import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { SlidersHorizontal, Search, Users } from 'lucide-react';
import { api } from '../api';
import { WorkerCard, type WorkerCardData } from '@/components/WorkerCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

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

type Specialisation = {
  id: string | number;
  name?: string;
  slug?: string;
};

function appendQuery(
  sp: URLSearchParams,
  key: string,
  value: string | number | boolean | undefined,
) {
  if (value === undefined || value === null) return;
  if (typeof value === 'string' && value.trim() === '') return;
  sp.set(key, String(value));
}

export default function WorkerSearchPage() {
  const navigate = useNavigate();
  const [postcodeArea, setPostcodeArea] = useState('');
  const [specialisationId, setSpecialisationId] = useState('');
  const [isAvailable, setIsAvailable] = useState(false);
  const [minRating, setMinRating] = useState('');
  const [dayRateMin, setDayRateMin] = useState('');
  const [dayRateMax, setDayRateMax] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [results, setResults] = useState<WorkerSearchResponse | null>(null);
  const [specialisations, setSpecialisations] = useState<Specialisation[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  async function loadSpecialisations() {
    setError('');
    try {
      const data = await api<Specialisation[]>('/specialisations');
      setSpecialisations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      appendQuery(sp, 'page', page);
      appendQuery(sp, 'limit', limit);
      appendQuery(sp, 'postcode_area', postcodeArea.trim());
      if (specialisationId.trim() !== '') {
        appendQuery(sp, 'specialisation_id', Number(specialisationId));
      }
      if (isAvailable) {
        sp.set('is_available', 'true');
      }
      if (minRating.trim() !== '') {
        appendQuery(sp, 'min_rating', Number(minRating));
      }
      if (dayRateMin.trim() !== '') {
        appendQuery(sp, 'day_rate_min', Number(dayRateMin));
      }
      if (dayRateMax.trim() !== '') {
        appendQuery(sp, 'day_rate_max', Number(dayRateMax));
      }
      const qs = sp.toString();
      const data = await api<WorkerSearchResponse>(`/worker-profiles?${qs}`);
      setResults(data);
      setMobileFiltersOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const filterForm = (
    <form onSubmit={search} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ws-postcode">Postcode area</Label>
        <Input
          id="ws-postcode"
          value={postcodeArea}
          onChange={(e) => setPostcodeArea(e.target.value)}
          placeholder="e.g. SW1"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ws-spec-id">Specialisation ID</Label>
        <Input
          id="ws-spec-id"
          type="number"
          value={specialisationId}
          onChange={(e) => setSpecialisationId(e.target.value)}
          min={1}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={isAvailable}
          onChange={(e) => setIsAvailable(e.target.checked)}
          className="h-4 w-4"
        />
        Is available
      </label>
      <div className="space-y-2">
        <Label htmlFor="ws-min-rating">Min rating</Label>
        <Input
          id="ws-min-rating"
          type="number"
          step="0.01"
          value={minRating}
          onChange={(e) => setMinRating(e.target.value)}
          min={0}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="ws-rate-min">Day rate min</Label>
          <Input
            id="ws-rate-min"
            type="number"
            step="0.01"
            value={dayRateMin}
            onChange={(e) => setDayRateMin(e.target.value)}
            min={0}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ws-rate-max">Day rate max</Label>
          <Input
            id="ws-rate-max"
            type="number"
            step="0.01"
            value={dayRateMax}
            onChange={(e) => setDayRateMax(e.target.value)}
            min={0}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="ws-page">Page</Label>
          <Input
            id="ws-page"
            type="number"
            value={page}
            onChange={(e) => setPage(Number(e.target.value) || 1)}
            min={1}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ws-limit">Limit</Label>
          <Input
            id="ws-limit"
            type="number"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 10)}
            min={1}
            max={100}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
        <Button type="submit" disabled={loading} className="sm:flex-1">
          <Search />
          {loading ? 'Searching…' : 'Search workers'}
        </Button>
        <Button type="button" variant="outline" onClick={loadSpecialisations}>
          Load specialisations
        </Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Worker search</h1>
        <p className="text-sm text-fg-muted">Find verified tradespeople for your projects.</p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <div className="lg:hidden">
        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full">
              <SlidersHorizontal />
              Filters
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-sm">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="mt-4">{filterForm}</div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="hidden lg:block">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>{filterForm}</CardContent>
          </Card>
        </aside>

        <section className="space-y-4">
          {specialisations ? (
            <Card>
              <CardHeader>
                <CardTitle>Specialisations (raw)</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
                  {JSON.stringify(specialisations, null, 2)}
                </pre>
              </CardContent>
            </Card>
          ) : null}

          {results ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">
                  {results.total} result{results.total === 1 ? '' : 's'}
                </h2>
              </div>
              {results.data.length > 0 ? (
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
                  title="No workers found"
                  description="Try broadening your filters."
                />
              )}
              <details className="rounded-md border border-border-default bg-raised">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-fg-muted">
                  Raw response
                </summary>
                <pre className="rounded-b-md bg-subtle text-fg p-3 text-xs overflow-auto">
                  {JSON.stringify(results, null, 2)}
                </pre>
              </details>
            </>
          ) : (
            <EmptyState
              icon={Search}
              title="Start searching"
              description="Use the filters to find workers."
            />
          )}
        </section>
      </div>
    </div>
  );
}
