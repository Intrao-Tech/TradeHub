import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Search, Briefcase } from 'lucide-react';
import { api, getToken, parseApiError } from '../api';
import { useAccountMe } from '@/hooks/useAccountMe';
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

export default function JobBoardPage() {
  const navigate = useNavigate();
  const loggedIn = !!getToken();
  const { isEmployer, verificationState } = useAccountMe();
  const canPostJob = loggedIn && isEmployer && verificationState === 'ACTIVE';

  const [list, setList] = useState<JobListResponse | null>(null);
  const [listError, setListError] = useState('');

  const [searchTitle, setSearchTitle] = useState('');
  const [postcodeArea, setPostcodeArea] = useState('');

  const [createOpen, setCreateOpen] = useState(false);

  const querySuffix = useMemo(() => {
    const p = new URLSearchParams();
    p.set('status', 'OPEN');
    p.set('page', '1');
    p.set('limit', '50');
    if (searchTitle.trim()) p.set('search', searchTitle.trim());
    if (postcodeArea.trim()) p.set('postcode_area', postcodeArea.trim());
    return `?${p.toString()}`;
  }, [searchTitle, postcodeArea]);

  async function loadJobs() {
    setListError('');
    try {
      const data = await api<JobListResponse>(`/job-posts${querySuffix}`);
      setList(data);
    } catch (e) {
      setListError(parseApiError(e)?.message ?? 'Could not load jobs.');
      setList(null);
    }
  }

  useEffect(() => {
    void loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [querySuffix]);

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

      {!loggedIn ? (
        <div
          role="status"
          className="rounded-md border border-info/40 bg-info-subtle px-3 py-2 text-sm text-info"
        >
          Browsing as guest.{' '}
          <Link to="/login" className="font-medium underline-offset-4 hover:underline">
            Sign in
          </Link>{' '}
          to apply or post jobs.
        </div>
      ) : null}

      {loggedIn && isEmployer && verificationState !== 'ACTIVE' ? (
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
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
          <div className="space-y-2">
            <Label htmlFor="search-title">Search title</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                id="search-title"
                value={searchTitle}
                onChange={(e) => setSearchTitle(e.target.value)}
                placeholder="e.g. electrician"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="postcode-area">Postcode area</Label>
            <Input
              id="postcode-area"
              value={postcodeArea}
              onChange={(e) => setPostcodeArea(e.target.value)}
              placeholder="e.g. SW1"
            />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={() => void loadJobs()} className="w-full sm:w-auto">
              <RefreshCw />
              Refresh
            </Button>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
