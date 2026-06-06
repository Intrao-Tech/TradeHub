import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { specLabel } from '@/lib/specialisations';
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { useSpecialisations } from '@/hooks/useSpecialisations';
import { JobCard, type JobCardData } from '@/components/JobCard';
import { SaveJobButton } from '@/components/jobs/SaveJobButton';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { JobPostForm } from '@/components/jobs/JobPostForm';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

// /api/saved-jobs returns rows shaped as `{ job_post: <JobPost>, created_at }`.
// We unwrap to JobPostRow before rendering so the rest of the page works
// against a single item shape.
type SavedJobRow = {
  job_post: JobPostRow;
  created_at?: string;
};
type SavedJobsResponse = {
  items: SavedJobRow[];
  total: number;
  page: number;
  limit: number;
};

const PAGE_SIZE = 20;

type FeedTab = 'best_matches' | 'most_recent' | 'saved';

function isFeedTab(v: string | null): v is FeedTab {
  return v === 'best_matches' || v === 'most_recent' || v === 'saved';
}

export default function AuthJobBoardPage() {
  const { t } = useTranslation('jobs');
  const navigate = useNavigate();
  const { isWorker, isEmployer, verificationState, clientProfile } =
    useAccountMe();
  const canPostJob = isEmployer && verificationState === 'ACTIVE';

  // Worker's own specialisations — used for Best Matches re-ranking. Real
  // data from `/account/me`; nothing fabricated here. If the user is not a
  // worker or has no specs, Best Matches falls back to the server order.
  const workerSpecIds = useMemo<number[]>(() => {
    const links = clientProfile?.worker_profile?.worker_specialisations ?? [];
    return links
      .map((l) => l.specialisation?.id ?? l.specialisation_id)
      .filter((v): v is number => typeof v === 'number');
  }, [clientProfile]);

  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const postcodeArea = params.get('postcode_area') ?? '';
  const specialisationParam = params.get('specialisation_id');
  const specialisationId = specialisationParam
    ? Number(specialisationParam)
    : null;
  const isUrgentParam = params.get('is_urgent');
  const isUrgentOnly = isUrgentParam === 'true';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const tabParam = params.get('tab');
  const activeTab: FeedTab = isFeedTab(tabParam) ? tabParam : 'best_matches';

  const [searchInput, setSearchInput] = useState(search);
  const [postcodeInput, setPostcodeInput] = useState(postcodeArea);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);
  useEffect(() => {
    setPostcodeInput(postcodeArea);
  }, [postcodeArea]);

  const { items: specialisationOptions, loading: specsLoading } =
    useSpecialisations();

  const [list, setList] = useState<JobListResponse | null>(null);
  const [listError, setListError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  // Saved tab uses a separate, simpler query (no filters / search) since the
  // backend endpoint only paginates a worker's bookmarks.
  const querySuffix = useMemo(() => {
    if (activeTab === 'saved') {
      const p = new URLSearchParams();
      p.set('page', String(page));
      p.set('limit', String(PAGE_SIZE));
      return `?${p.toString()}`;
    }
    const p = new URLSearchParams();
    p.set('status', 'OPEN');
    p.set('page', String(page));
    p.set('limit', String(PAGE_SIZE));
    if (search.trim()) p.set('search', search.trim());
    if (postcodeArea.trim()) p.set('postcode_area', postcodeArea.trim());
    if (specialisationId != null && Number.isFinite(specialisationId)) {
      p.set('specialisation_id', String(specialisationId));
    }
    if (isUrgentOnly) p.set('is_urgent', 'true');
    return `?${p.toString()}`;
  }, [activeTab, search, postcodeArea, specialisationId, isUrgentOnly, page]);

  const loadJobs = useCallback(async () => {
    setListError('');
    try {
      if (activeTab === 'saved') {
        const data = await api<SavedJobsResponse>(`/saved-jobs${querySuffix}`);
        // Unwrap { job_post, created_at } → JobPostRow and force is_saved=true
        // (the server doesn't currently echo it on the saved-jobs endpoint, and
        // by definition every row here is saved).
        setList({
          items: data.items.map((row) => ({ ...row.job_post, is_saved: true })),
          total: data.total,
          page: data.page,
          limit: data.limit,
        });
      } else {
        const data = await api<JobListResponse>(`/job-posts${querySuffix}`);
        setList(data);
      }
    } catch (e) {
      setListError(parseApiError(e)?.message ?? t('board.loadError'));
      setList(null);
    }
  }, [activeTab, querySuffix]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  // When the user unsaves a row from the Saved tab, remove it from the local
  // list immediately so it disappears without a refetch. On the other tabs
  // toggling the icon just flips the in-memory `is_saved` flag so the icon
  // state matches what the user just clicked.
  function handleSaveToggle(jobId: string | number, nowSaved: boolean) {
    setList((prev) => {
      if (!prev) return prev;
      if (activeTab === 'saved' && !nowSaved) {
        return {
          ...prev,
          items: prev.items.filter((it) => String(it.id) !== String(jobId)),
          total: Math.max(0, prev.total - 1),
        };
      }
      return {
        ...prev,
        items: prev.items.map((it) =>
          String(it.id) === String(jobId) ? { ...it, is_saved: nowSaved } : it,
        ),
      };
    });
  }

  // Best-matches re-rank: count overlapping specialisations between the
  // current worker and each returned job; ties broken by server order
  // (which is is_urgent desc then created_at desc). When the user is not a
  // worker or has zero specs, fall back to server order — no fake scoring.
  const visibleItems = useMemo<JobPostRow[]>(() => {
    const items = list?.items ?? [];
    if (activeTab !== 'best_matches' || workerSpecIds.length === 0) return items;
    const workerSet = new Set(workerSpecIds);
    const scored = items.map((job, index) => {
      const jobSpecIds = (job.specialisations ?? [])
        .map((s) => s.specialisation?.id)
        .filter((v): v is number => typeof v === 'number');
      const overlap = jobSpecIds.reduce(
        (acc, id) => acc + (workerSet.has(id) ? 1 : 0),
        0,
      );
      return { job, overlap, index };
    });
    scored.sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return a.index - b.index;
    });
    return scored.map((s) => s.job);
  }, [list, activeTab, workerSpecIds]);

  function commitFilters(next: {
    search?: string | null;
    postcodeArea?: string | null;
    specialisationId?: number | null;
    isUrgent?: boolean | null;
    tab?: FeedTab | null;
    page?: number | null;
  }) {
    const merged = new URLSearchParams(params);
    if (next.search !== undefined) {
      if (next.search) merged.set('search', next.search);
      else merged.delete('search');
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
    if (next.isUrgent !== undefined) {
      if (next.isUrgent) merged.set('is_urgent', 'true');
      else merged.delete('is_urgent');
    }
    if (next.tab !== undefined) {
      if (next.tab) merged.set('tab', next.tab);
      else merged.delete('tab');
    }
    if (next.page != null) {
      merged.set('page', String(next.page));
    } else {
      merged.delete('page');
    }
    setParams(merged, { replace: false });
  }

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    commitFilters({
      search: searchInput.trim() || null,
    });
  }

  function applyPostcode() {
    commitFilters({ postcodeArea: postcodeInput.trim() || null });
  }

  function clearFilters() {
    setSearchInput('');
    setPostcodeInput('');
    commitFilters({
      search: null,
      postcodeArea: null,
      specialisationId: null,
      isUrgent: null,
    });
  }

  const activeFilterCount =
    (search ? 1 : 0) +
    (postcodeArea ? 1 : 0) +
    (specialisationId != null ? 1 : 0) +
    (isUrgentOnly ? 1 : 0);

  const totalPages = list ? Math.max(1, Math.ceil(list.total / PAGE_SIZE)) : 1;
  const showPaginator = list != null && list.total > PAGE_SIZE;

  const filterRail = (
    <div className="space-y-6">
      <div className="flex flex-col gap-2.5">
        <Label htmlFor="filter-postcode">{t('board.postcodeLabel')}</Label>
        <div className="flex gap-2">
          <Input
            id="filter-postcode"
            value={postcodeInput}
            onChange={(e) => setPostcodeInput(e.target.value)}
            placeholder={t('board.postcodePlaceholder')}
            onBlur={applyPostcode}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyPostcode();
              }
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <Label htmlFor="filter-spec">{t('board.specialisationLabel')}</Label>
        <Select
          value={specialisationId != null ? String(specialisationId) : '__any__'}
          onValueChange={(v) =>
            commitFilters({
              specialisationId: v === '__any__' ? null : Number(v),
            })
          }
          disabled={specsLoading}
        >
          <SelectTrigger id="filter-spec" aria-label={t('board.specialisationFilterAria')}>
            <SelectValue placeholder={t('board.anySpecialisation')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__">{t('board.anySpecialisation')}</SelectItem>
            {specialisationOptions.map((opt) => (
              <SelectItem key={opt.id} value={String(opt.id)}>
                {specLabel(opt.name, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border-default text-primary focus-visible:ring-2 focus-visible:ring-ring"
            checked={isUrgentOnly}
            onChange={(e) =>
              commitFilters({ isUrgent: e.target.checked ? true : null })
            }
          />
          {t('board.urgentOnly')}
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
          {t('board.clearFilters')}
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('board.title')}</h1>
          <p className="text-sm text-fg-muted">{t('board.subtitle')}</p>
        </div>
        {canPostJob ? (
          <Sheet open={createOpen} onOpenChange={setCreateOpen}>
            <SheetTrigger asChild>
              <Button>
                <Plus />
                {t('board.postJob')}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>{t('board.postJob')}</SheetTitle>
                <SheetDescription>{t('board.postJobDesc')}</SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <JobPostForm
                  mode="create"
                  onSuccess={(created) => {
                    toast.success(t('board.jobPosted'));
                    setCreateOpen(false);
                    if (created?.id != null) navigate(`/jobs/${created.id}`);
                    else void loadJobs();
                  }}
                  onCancel={() => setCreateOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>

      {isEmployer && verificationState !== 'ACTIVE' ? (
        <div
          role="status"
          className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning"
        >
          {t('board.verifyToPost')}
        </div>
      ) : null}

      <form onSubmit={applySearch} className="relative">
        <Label htmlFor="search-title" className="sr-only">
          {t('board.searchTitleLabel')}
        </Label>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <Input
          id="search-title"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('board.searchPlaceholder')}
          className="h-12 pl-11 pr-28 text-base"
        />
        <Button
          type="submit"
          size="sm"
          className="absolute right-2 top-1/2 -translate-y-1/2"
        >
          {t('board.search')}
        </Button>
      </form>

      {listError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {listError}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-4 rounded-md border border-border-default bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-fg">
              <SlidersHorizontal className="h-4 w-4" />
              {t('board.filters')}
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
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {t('board.feedTitle')}
            </h2>
            <p className="text-sm text-fg-muted">
              {activeTab === 'best_matches'
                ? t('board.feedDescBest')
                : activeTab === 'most_recent'
                  ? t('board.feedDescRecent')
                  : t('board.feedDescSaved')}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                if (isFeedTab(v)) {
                  commitFilters({ tab: v === 'best_matches' ? null : v });
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="best_matches">{t('board.tabBest')}</TabsTrigger>
                <TabsTrigger value="most_recent">{t('board.tabRecent')}</TabsTrigger>
                {isWorker ? (
                  <TabsTrigger value="saved">{t('board.tabSaved')}</TabsTrigger>
                ) : null}
              </TabsList>
            </Tabs>

            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden">
                  <Filter />
                  {t('board.filters')}
                  {activeFilterCount > 0 ? (
                    <Badge variant="secondary" className="ml-1">
                      {activeFilterCount}
                    </Badge>
                  ) : null}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-sm">
                <SheetHeader>
                  <SheetTitle>{t('board.filters')}</SheetTitle>
                  <SheetDescription>{t('board.filtersDesc')}</SheetDescription>
                </SheetHeader>
                <div className="mt-4">{filterRail}</div>
              </SheetContent>
            </Sheet>
          </div>

          {visibleItems.length > 0 ? (
            <>
              <div className="flex items-center justify-between text-xs text-fg-muted">
                <span>{t('board.openJobs', { count: list?.total ?? 0 })}</span>
              </div>
              <div className="space-y-3">
                {visibleItems.map((j) => (
                  <JobCard
                    key={String(j.id)}
                    job={j}
                    onSelect={() => navigate(`/jobs/${j.id}`)}
                    headerSlot={
                      isWorker ? (
                        <SaveJobButton
                          jobId={j.id}
                          initialSaved={!!j.is_saved}
                          onChange={(saved) => handleSaveToggle(j.id, saved)}
                        />
                      ) : null
                    }
                  />
                ))}
              </div>
              {showPaginator ? (
                <nav
                  aria-label={t('board.paginationAria')}
                  className="flex items-center justify-between gap-2 pt-2"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() =>
                      commitFilters({
                        search: search || null,
                        postcodeArea: postcodeArea || null,
                        specialisationId,
                        isUrgent: isUrgentOnly ? true : null,
                        tab: activeTab === 'best_matches' ? null : activeTab,
                        page: page - 1,
                      })
                    }
                  >
                    <ChevronLeft />
                    {t('board.previous')}
                  </Button>
                  <span className="text-xs text-fg-muted">
                    {t('board.pageOf', { page, total: totalPages })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() =>
                      commitFilters({
                        search: search || null,
                        postcodeArea: postcodeArea || null,
                        specialisationId,
                        isUrgent: isUrgentOnly ? true : null,
                        tab: activeTab === 'best_matches' ? null : activeTab,
                        page: page + 1,
                      })
                    }
                  >
                    {t('board.next')}
                    <ChevronRight />
                  </Button>
                </nav>
              ) : null}
            </>
          ) : list ? (
            <EmptyState
              icon={Briefcase}
              title={t('board.emptyTitle')}
              description={t('board.emptyDesc')}
            />
          ) : (
            <p className="text-sm text-fg-muted">{t('board.loading')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
