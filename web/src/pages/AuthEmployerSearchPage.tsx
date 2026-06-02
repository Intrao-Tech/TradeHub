import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Filter,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, parseApiError } from '../api';
import { EmployerCard, type EmployerCardData } from '@/components/EmployerCard';
import { EmptyState } from '@/components/EmptyState';
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

type EmployerRow = EmployerCardData;

type EmployerSearchResponse = {
  data: EmployerRow[];
  total: number;
  page: number;
  limit: number;
};

const PAGE_SIZE = 10;

export default function AuthEmployerSearchPage() {
  const { t } = useTranslation('workers');
  const navigate = useNavigate();

  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const [searchInput, setSearchInput] = useState(search);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const [results, setResults] = useState<EmployerSearchResponse | null>(null);
  const [error, setError] = useState('');

  const querySuffix = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('page', String(page));
    sp.set('limit', String(PAGE_SIZE));
    if (search.trim()) sp.set('search', search.trim());
    return `?${sp.toString()}`;
  }, [page, search]);

  const loadEmployers = useCallback(async () => {
    setError('');
    try {
      const data = await api<EmployerSearchResponse>(
        `/employer-profiles${querySuffix}`,
      );
      setResults(data);
    } catch (e) {
      setError(parseApiError(e)?.message ?? t('employerSearch.loadError'));
      setResults(null);
    }
  }, [querySuffix]);

  useEffect(() => {
    void loadEmployers();
  }, [loadEmployers]);

  function commitFilters(next: {
    search?: string | null;
    page?: number | null;
  }) {
    const merged = new URLSearchParams(params);
    if (next.search !== undefined) {
      if (next.search) merged.set('search', next.search);
      else merged.delete('search');
    }
    if (next.page != null) {
      merged.set('page', String(next.page));
    } else {
      merged.delete('page');
    }
    setParams(merged, { replace: false });
  }

  function applySearch() {
    commitFilters({ search: searchInput.trim() || null });
  }

  function clearFilters() {
    setSearchInput('');
    commitFilters({ search: null });
  }

  const activeFilterCount = search ? 1 : 0;

  const totalPages = results
    ? Math.max(1, Math.ceil(results.total / PAGE_SIZE))
    : 1;
  const showPaginator = results != null && results.total > PAGE_SIZE;

  const filterRail = (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="es-search">{t('employerSearch.companyLabel')}</Label>
        <Input
          id="es-search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('employerSearch.companyPlaceholder')}
          onBlur={applySearch}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applySearch();
            }
          }}
        />
      </div>

      {activeFilterCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={clearFilters}
        >
          {t('search.clearFilters')}
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t('employerSearch.title')}
        </h1>
        <p className="text-sm text-fg-muted">{t('employerSearch.subtitle')}</p>
      </div>

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
              {t('search.filters')}
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
                ? t('employerSearch.count', { count: results.total })
                : t('search.loading')}
            </div>
            <Sheet
              open={mobileFiltersOpen}
              onOpenChange={setMobileFiltersOpen}
            >
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden">
                  <Filter />
                  {t('search.filters')}
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
                  <SheetTitle>{t('search.filters')}</SheetTitle>
                  <SheetDescription>{t('employerSearch.filtersDesc')}</SheetDescription>
                </SheetHeader>
                <div className="mt-4">{filterRail}</div>
              </SheetContent>
            </Sheet>
          </div>

          {results ? (
            results.data.length > 0 ? (
              <>
                <div className="space-y-3">
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
                {showPaginator ? (
                  <nav
                    aria-label={t('employerSearch.paginationAria')}
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
                      {t('search.previous')}
                    </Button>
                    <span className="text-xs text-fg-muted">
                      {t('search.pageOf', { page, total: totalPages })}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => commitFilters({ page: page + 1 })}
                    >
                      {t('search.next')}
                      <ChevronRight />
                    </Button>
                  </nav>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon={Building2}
                title={t('employerSearch.emptyTitle')}
                description={t('employerSearch.emptyDesc')}
              />
            )
          ) : (
            <p className="text-sm text-fg-muted">{t('search.loading')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
