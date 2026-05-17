import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { useSpecialisations } from '@/hooks/useSpecialisations';
import { JobCard, type JobCardData } from '@/components/JobCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { JobPostForm } from '@/components/jobs/JobPostForm';
import { ChipMultiSelect } from '@/components/ui/chip-multi-select';

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

const PAGE_SIZE = 20;

export default function AuthJobBoardPage() {
  const navigate = useNavigate();
  const { isEmployer, verificationState } = useAccountMe();
  const canPostJob = isEmployer && verificationState === 'ACTIVE';

  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const postcodeArea = params.get('postcode_area') ?? '';
  const specialisationParam = params.get('specialisation_id');
  const specialisationId = specialisationParam
    ? Number(specialisationParam)
    : null;
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const [searchInput, setSearchInput] = useState(search);
  const [postcodeInput, setPostcodeInput] = useState(postcodeArea);

  // Keep the controlled inputs in sync if the URL changes externally
  // (back-button, deep link, refresh).
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

  const querySuffix = useMemo(() => {
    const p = new URLSearchParams();
    p.set('status', 'OPEN');
    p.set('page', String(page));
    p.set('limit', String(PAGE_SIZE));
    if (search.trim()) p.set('search', search.trim());
    if (postcodeArea.trim()) p.set('postcode_area', postcodeArea.trim());
    if (specialisationId != null && Number.isFinite(specialisationId)) {
      p.set('specialisation_id', String(specialisationId));
    }
    return `?${p.toString()}`;
  }, [search, postcodeArea, specialisationId, page]);

  const loadJobs = useCallback(async () => {
    setListError('');
    try {
      const data = await api<JobListResponse>(`/job-posts${querySuffix}`);
      setList(data);
    } catch (e) {
      setListError(parseApiError(e)?.message ?? 'Could not load jobs.');
      setList(null);
    }
  }, [querySuffix]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  function commitFilters(next: {
    search?: string | null;
    postcodeArea?: string | null;
    specialisationId?: number | null;
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
    // Any filter mutation resets to page 1; only an explicit `page` arg
    // advances the paginator.
    if (next.page != null) {
      merged.set('page', String(next.page));
    } else {
      merged.delete('page');
    }
    setParams(merged, { replace: false });
  }

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    commitFilters({
      search: searchInput.trim() || null,
      postcodeArea: postcodeInput.trim() || null,
    });
  }

  const totalPages = list ? Math.max(1, Math.ceil(list.total / PAGE_SIZE)) : 1;
  const showPaginator = list != null && list.total > PAGE_SIZE;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Job board</h1>
          <p className="text-sm text-fg-muted">
            Browse open jobs from verified employers.
          </p>
        </div>
        {canPostJob ? (
          <Sheet open={createOpen} onOpenChange={setCreateOpen}>
            <SheetTrigger asChild>
              <Button>
                <Plus />
                Post a job
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>Post a job</SheetTitle>
                <SheetDescription>
                  Tell verified workers what you need. You can edit anytime before
                  applications arrive.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <JobPostForm
                  mode="create"
                  onSuccess={(created) => {
                    toast.success('Job posted');
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
          Verify your email to post jobs.
        </div>
      ) : null}

      {listError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {listError}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search open job posts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={applyFilters}
            className="grid gap-3 sm:grid-cols-[1fr_200px_auto]"
          >
            <div className="space-y-2">
              <Label htmlFor="search-title">Search title</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
                <Input
                  id="search-title"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="e.g. electrician"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="postcode-area">Postcode area</Label>
              <Input
                id="postcode-area"
                value={postcodeInput}
                onChange={(e) => setPostcodeInput(e.target.value)}
                placeholder="e.g. SW1"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="outline" className="w-full sm:w-auto">
                <RefreshCw />
                Apply
              </Button>
            </div>
          </form>
          <div className="mt-3 space-y-2">
            <Label htmlFor="job-board-spec">Specialisation</Label>
            <ChipMultiSelect
              id="job-board-spec"
              options={specialisationOptions}
              loading={specsLoading}
              selectedIds={specialisationId != null ? [specialisationId] : []}
              onChange={(next) => {
                // Single-select for the public board: pick the latest id.
                const last = next.length > 0 ? next[next.length - 1] : null;
                commitFilters({ specialisationId: last });
              }}
              ariaLabel="Specialisation filter"
              placeholder="Filter by specialisation…"
              emptyText="No specialisations match."
            />
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Open jobs</h2>
          {list ? (
            <Badge variant="secondary">{list.total} total</Badge>
          ) : null}
        </div>
        {list?.items?.length ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.items.map((j) => (
                <JobCard
                  key={String(j.id)}
                  job={j}
                  onSelect={() => navigate(`/jobs/${j.id}`)}
                />
              ))}
            </div>
            {showPaginator ? (
              <nav
                aria-label="Job board pagination"
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
                      specialisationId: specialisationId,
                      page: page - 1,
                    })
                  }
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
                  onClick={() =>
                    commitFilters({
                      search: search || null,
                      postcodeArea: postcodeArea || null,
                      specialisationId: specialisationId,
                      page: page + 1,
                    })
                  }
                >
                  Next
                  <ChevronRight />
                </Button>
              </nav>
            ) : null}
          </>
        ) : list ? (
          <EmptyState
            icon={Briefcase}
            title="No jobs found"
            description="Try adjusting your filters or come back later."
          />
        ) : (
          <p className="text-sm text-fg-muted">Loading…</p>
        )}
      </section>
    </div>
  );
}
