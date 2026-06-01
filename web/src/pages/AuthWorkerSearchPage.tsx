import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { useSpecialisations } from '@/hooks/useSpecialisations';
import { WorkerCard, type WorkerCardData } from '@/components/WorkerCard';
import { EmptyState } from '@/components/EmptyState';
import { InviteToJobButton } from '@/components/workers/InviteToJobButton';
import { SaveWorkerButton } from '@/components/workers/SaveWorkerButton';
import { StarRating } from '@/components/StarRating';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type WorkerRow = WorkerCardData & {
  worker_specialisations?: WorkerCardData['worker_specialisations'];
};

type WorkerSearchResponse = {
  data: WorkerRow[];
  total: number;
  page: number;
  limit: number;
};

// /api/saved-workers returns rows shaped as `{ worker_profile, created_at }`.
// We unwrap to WorkerRow before rendering so the rest of the page works
// against a single item shape.
type SavedWorkerRow = {
  worker_profile: WorkerRow;
  created_at?: string;
};
type SavedWorkersResponse = {
  items: SavedWorkerRow[];
  total: number;
  page: number;
  limit: number;
};

const PAGE_SIZE = 10;

type Tab = 'all' | 'saved';

function isTab(v: string | null): v is Tab {
  return v === 'all' || v === 'saved';
}

export default function AuthWorkerSearchPage() {
  const navigate = useNavigate();
  const { isEmployer } = useAccountMe();
  const { items: specialisationOptions, loading: specsLoading } =
    useSpecialisations();

  const [params, setParams] = useSearchParams();
  const postcodeArea = params.get('postcode_area') ?? '';
  const specialisationParam = params.get('specialisation_id');
  const specialisationId = specialisationParam
    ? Number(specialisationParam)
    : null;
  const isAvailable = params.get('is_available') === 'true';
  const minRatingParam = params.get('min_rating');
  const minRating = minRatingParam != null ? Number(minRatingParam) : null;
  const dayRateMinParam = params.get('day_rate_min');
  const dayRateMaxParam = params.get('day_rate_max');
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const tabParam = params.get('tab');
  const activeTab: Tab = isTab(tabParam) ? tabParam : 'all';

  const [postcodeInput, setPostcodeInput] = useState(postcodeArea);
  const [rateMinInput, setRateMinInput] = useState(dayRateMinParam ?? '');
  const [rateMaxInput, setRateMaxInput] = useState(dayRateMaxParam ?? '');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    setPostcodeInput(postcodeArea);
  }, [postcodeArea]);
  useEffect(() => {
    setRateMinInput(dayRateMinParam ?? '');
  }, [dayRateMinParam]);
  useEffect(() => {
    setRateMaxInput(dayRateMaxParam ?? '');
  }, [dayRateMaxParam]);

  const [results, setResults] = useState<WorkerSearchResponse | null>(null);
  const [error, setError] = useState('');

  // Saved tab uses a simpler query (no filters); the endpoint only paginates
  // the employer's bookmarks.
  const querySuffix = useMemo(() => {
    if (activeTab === 'saved') {
      const sp = new URLSearchParams();
      sp.set('page', String(page));
      sp.set('limit', String(PAGE_SIZE));
      return `?${sp.toString()}`;
    }
    const sp = new URLSearchParams();
    sp.set('page', String(page));
    sp.set('limit', String(PAGE_SIZE));
    if (postcodeArea.trim()) sp.set('postcode_area', postcodeArea.trim());
    if (specialisationId != null && Number.isFinite(specialisationId)) {
      sp.set('specialisation_id', String(specialisationId));
    }
    if (isAvailable) sp.set('is_available', 'true');
    if (minRating != null && Number.isFinite(minRating) && minRating > 0) {
      sp.set('min_rating', String(minRating));
    }
    if (dayRateMinParam != null && dayRateMinParam.trim() !== '') {
      sp.set('day_rate_min', dayRateMinParam.trim());
    }
    if (dayRateMaxParam != null && dayRateMaxParam.trim() !== '') {
      sp.set('day_rate_max', dayRateMaxParam.trim());
    }
    return `?${sp.toString()}`;
  }, [
    activeTab,
    page,
    postcodeArea,
    specialisationId,
    isAvailable,
    minRating,
    dayRateMinParam,
    dayRateMaxParam,
  ]);

  const loadWorkers = useCallback(async () => {
    setError('');
    try {
      if (activeTab === 'saved') {
        const data = await api<SavedWorkersResponse>(
          `/saved-workers${querySuffix}`,
        );
        // Unwrap { worker_profile, created_at } → WorkerRow and force is_saved
        // true (by definition every row here is saved).
        setResults({
          data: data.items.map((row) => ({
            ...row.worker_profile,
            is_saved: true,
          })),
          total: data.total,
          page: data.page,
          limit: data.limit,
        });
      } else {
        const data = await api<WorkerSearchResponse>(
          `/worker-profiles${querySuffix}`,
        );
        setResults(data);
      }
    } catch (e) {
      setError(parseApiError(e)?.message ?? 'Could not load workers.');
      setResults(null);
    }
  }, [activeTab, querySuffix]);

  useEffect(() => {
    void loadWorkers();
  }, [loadWorkers]);

  // When the employer unsaves a worker from the Saved tab, remove them from
  // the local list immediately so they disappear without a refetch. On the
  // other tab toggling the icon flips the in-memory is_saved flag so the icon
  // state matches what the user just clicked.
  function handleSaveToggle(workerId: string | number, nowSaved: boolean) {
    setResults((prev) => {
      if (!prev) return prev;
      if (activeTab === 'saved' && !nowSaved) {
        return {
          ...prev,
          data: prev.data.filter((it) => String(it.id) !== String(workerId)),
          total: Math.max(0, prev.total - 1),
        };
      }
      return {
        ...prev,
        data: prev.data.map((it) =>
          String(it.id) === String(workerId)
            ? { ...it, is_saved: nowSaved }
            : it,
        ),
      };
    });
  }

  function commitFilters(next: {
    postcodeArea?: string | null;
    specialisationId?: number | null;
    isAvailable?: boolean | null;
    minRating?: number | null;
    dayRateMin?: string | null;
    dayRateMax?: string | null;
    tab?: Tab | null;
    page?: number | null;
  }) {
    const merged = new URLSearchParams(params);
    if (next.tab !== undefined) {
      if (next.tab) merged.set('tab', next.tab);
      else merged.delete('tab');
    }
    if (next.postcodeArea !== undefined) {
      if (next.postcodeArea) merged.set('postcode_area', next.postcodeArea);
      else merged.delete('postcode_area');
    }
    if (next.specialisationId !== undefined) {
      if (next.specialisationId != null) {
        merged.set('specialisation_id', String(next.specialisationId));
      } else {
        merged.delete('specialisation_id');
      }
    }
    if (next.isAvailable !== undefined) {
      if (next.isAvailable) merged.set('is_available', 'true');
      else merged.delete('is_available');
    }
    if (next.minRating !== undefined) {
      if (next.minRating != null && next.minRating > 0) {
        merged.set('min_rating', String(next.minRating));
      } else {
        merged.delete('min_rating');
      }
    }
    if (next.dayRateMin !== undefined) {
      if (next.dayRateMin) merged.set('day_rate_min', next.dayRateMin);
      else merged.delete('day_rate_min');
    }
    if (next.dayRateMax !== undefined) {
      if (next.dayRateMax) merged.set('day_rate_max', next.dayRateMax);
      else merged.delete('day_rate_max');
    }
    if (next.page != null) {
      merged.set('page', String(next.page));
    } else {
      merged.delete('page');
    }
    setParams(merged, { replace: false });
  }

  function applyPostcode() {
    commitFilters({ postcodeArea: postcodeInput.trim() || null });
  }
  function applyRateRange() {
    commitFilters({
      dayRateMin: rateMinInput.trim() || null,
      dayRateMax: rateMaxInput.trim() || null,
    });
  }

  function clearFilters() {
    setPostcodeInput('');
    setRateMinInput('');
    setRateMaxInput('');
    commitFilters({
      postcodeArea: null,
      specialisationId: null,
      isAvailable: null,
      minRating: null,
      dayRateMin: null,
      dayRateMax: null,
    });
  }

  const activeFilterCount =
    (postcodeArea ? 1 : 0) +
    (specialisationId != null ? 1 : 0) +
    (isAvailable ? 1 : 0) +
    (minRating != null && minRating > 0 ? 1 : 0) +
    (dayRateMinParam ? 1 : 0) +
    (dayRateMaxParam ? 1 : 0);

  const totalPages = results
    ? Math.max(1, Math.ceil(results.total / PAGE_SIZE))
    : 1;
  const showPaginator = results != null && results.total > PAGE_SIZE;

  const filterRail = (
    <div className="space-y-6">
      <div className="flex flex-col gap-2.5">
        <Label htmlFor="ws-postcode">Postcode area</Label>
        <Input
          id="ws-postcode"
          value={postcodeInput}
          onChange={(e) => setPostcodeInput(e.target.value)}
          placeholder="e.g. SW1"
          onBlur={applyPostcode}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyPostcode();
            }
          }}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <Label htmlFor="ws-spec">Specialisation</Label>
        <Select
          value={specialisationId != null ? String(specialisationId) : '__any__'}
          onValueChange={(v) =>
            commitFilters({
              specialisationId: v === '__any__' ? null : Number(v),
            })
          }
          disabled={specsLoading}
        >
          <SelectTrigger id="ws-spec" aria-label="Specialisation filter">
            <SelectValue placeholder="Any specialisation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">Any specialisation</SelectItem>
            {specialisationOptions.map((opt) => (
              <SelectItem key={opt.id} value={String(opt.id)}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2.5">
        <Label>Day rate (£)</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min={0}
            step="1"
            value={rateMinInput}
            onChange={(e) => setRateMinInput(e.target.value)}
            placeholder="Min"
            onBlur={applyRateRange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyRateRange();
              }
            }}
            aria-label="Minimum day rate"
          />
          <Input
            type="number"
            min={0}
            step="1"
            value={rateMaxInput}
            onChange={(e) => setRateMaxInput(e.target.value)}
            placeholder="Max"
            onBlur={applyRateRange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyRateRange();
              }
            }}
            aria-label="Maximum day rate"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <Label>Minimum rating</Label>
        <div className="flex items-center gap-2">
          <StarRating
            value={minRating ?? 0}
            onChange={(v) =>
              commitFilters({ minRating: minRating === v ? null : v })
            }
            label="Minimum rating"
          />
          {minRating != null && minRating > 0 ? (
            <button
              type="button"
              className="text-xs text-fg-muted underline-offset-2 hover:underline"
              onClick={() => commitFilters({ minRating: null })}
            >
              clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border-default text-primary focus-visible:ring-2 focus-visible:ring-ring"
            checked={isAvailable}
            onChange={(e) =>
              commitFilters({ isAvailable: e.target.checked ? true : null })
            }
          />
          Available now
        </Label>
      </div>

      {activeFilterCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={clearFilters}
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Find workers</h1>
        <p className="text-sm text-fg-muted">
          {activeTab === 'saved'
            ? 'Workers you bookmarked. Tap the icon again to remove a worker from this list.'
            : 'Browse verified tradespeople and invite them to one of your open jobs.'}
        </p>
      </div>

      {isEmployer ? (
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            if (isTab(v)) {
              commitFilters({ tab: v === 'all' ? null : v, page: null });
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="all">All workers</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-4 rounded-md border border-border-default bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-fg">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 ? (
                <Badge variant="secondary" className="ml-auto">
                  {activeFilterCount}
                </Badge>
              ) : null}
            </div>
            {filterRail}
          </div>
        </aside>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-fg-muted">
              {results
                ? `${results.total} worker${results.total === 1 ? '' : 's'}`
                : 'Loading…'}
            </div>
            <Sheet
              open={mobileFiltersOpen}
              onOpenChange={setMobileFiltersOpen}
            >
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden">
                  <Filter />
                  Filters
                  {activeFilterCount > 0 ? (
                    <Badge variant="secondary" className="ml-1">
                      {activeFilterCount}
                    </Badge>
                  ) : null}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-full overflow-y-auto sm:max-w-sm"
              >
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription>
                    Narrow the list to workers that match what you need.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4">{filterRail}</div>
              </SheetContent>
            </Sheet>
          </div>

          {results ? (
            results.data.length > 0 ? (
              <>
                <div className="space-y-3">
                  {results.data.map((w) => (
                    <WorkerCard
                      key={String(w.id)}
                      worker={w}
                      onSelect={(picked) =>
                        navigate(`/workers/${String(picked.id)}`)
                      }
                      headerSlot={
                        isEmployer ? (
                          <SaveWorkerButton
                            workerId={w.id}
                            initialSaved={!!w.is_saved}
                            onChange={(saved) => handleSaveToggle(w.id, saved)}
                          />
                        ) : null
                      }
                      actions={
                        isEmployer ? (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0"
                          >
                            <InviteToJobButton
                              workerId={w.id}
                              workerName={
                                w.client_profile?.display_name ?? null
                              }
                            />
                          </div>
                        ) : null
                      }
                    />
                  ))}
                </div>
                {showPaginator ? (
                  <nav
                    aria-label="Workers pagination"
                    className="flex items-center justify-between gap-2 pt-2"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => commitFilters({ page: page - 1 })}
                    >
                      <ChevronLeft />
                      Previous
                    </Button>
                    <span className="text-xs text-fg-muted">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => commitFilters({ page: page + 1 })}
                    >
                      Next
                      <ChevronRight />
                    </Button>
                  </nav>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon={Users}
                title="No workers found"
                description="Try broadening your filters."
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
