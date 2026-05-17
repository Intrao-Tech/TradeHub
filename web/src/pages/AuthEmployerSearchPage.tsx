import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Search, SlidersHorizontal } from 'lucide-react';
import { api } from '../api';
import { EmployerCard, type EmployerCardData } from '@/components/EmployerCard';
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

export default function AuthEmployerSearchPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [results, setResults] = useState<EmployerSearchResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  async function doSearch(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set('page', String(page));
      sp.set('limit', String(limit));
      if (search.trim() !== '') {
        sp.set('search', search.trim());
      }
      const data = await api<EmployerSearchResponse>(`/employer-profiles?${sp.toString()}`);
      setResults(data);
      setMobileFiltersOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Auto-load a sample on mount so the page has content before any search.
  useEffect(() => {
    void doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filterForm = (
    <form onSubmit={doSearch} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="es-search">Search</Label>
        <Input
          id="es-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Company name contains…"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="es-page">Page</Label>
          <Input
            id="es-page"
            type="number"
            value={page}
            onChange={(e) => setPage(Number(e.target.value) || 1)}
            min={1}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="es-limit">Limit</Label>
          <Input
            id="es-limit"
            type="number"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 10)}
            min={1}
            max={100}
          />
        </div>
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        <Search />
        {loading ? 'Searching…' : 'Search employers'}
      </Button>
    </form>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Employer search</h1>
        <p className="text-sm text-fg-muted">Find employers that hire on TradeHub.</p>
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
          {results ? (
            results.data.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                title="No employers found"
                description="Try another search."
              />
            )
          ) : (
            <p className="text-sm text-fg-muted">Loading…</p>
          )}
        </section>
      </div>
    </div>
  );
}
