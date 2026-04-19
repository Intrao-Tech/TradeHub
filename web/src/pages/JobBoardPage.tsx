import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, Search, Briefcase } from 'lucide-react';
import { api, getToken } from '../api';
import { JobCard, type JobCardData } from '@/components/JobCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

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

function parseIdList(s: string): number[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number(x))
    .filter((n) => !Number.isNaN(n));
}

export default function JobBoardPage() {
  const loggedIn = !!getToken();
  const [list, setList] = useState<JobListResponse | null>(null);
  const [listError, setListError] = useState('');
  const [actionError, setActionError] = useState('');
  const [lastActionJson, setLastActionJson] = useState<unknown>(null);

  const [searchTitle, setSearchTitle] = useState('');
  const [postcodeArea, setPostcodeArea] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobPostRow | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);

  const [applyCoverByJob, setApplyCoverByJob] = useState<Record<string, string>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createPayType, setCreatePayType] = useState<'DAY_RATE' | 'FIXED_PRICE'>('DAY_RATE');
  const [createDayMin, setCreateDayMin] = useState('');
  const [createDayMax, setCreateDayMax] = useState('');
  const [createFixed, setCreateFixed] = useState('');
  const [createPostcode, setCreatePostcode] = useState('');
  const [createDuration, setCreateDuration] = useState('');
  const [createUrgent, setCreateUrgent] = useState(false);
  const [createSpecIds, setCreateSpecIds] = useState('');
  const [createTagIds, setCreateTagIds] = useState('');

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
      setListError(e instanceof Error ? e.message : String(e));
      setList(null);
    }
  }

  useEffect(() => {
    void loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [querySuffix]);

  async function openDetail(id: string | number) {
    const sid = String(id);
    setSelectedId(sid);
    setDetail(null);
    setDetailError('');
    setDetailOpen(true);
    try {
      const d = await api<JobPostRow>(`/job-posts/${sid}`);
      setDetail(d);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setActionError('');
    setLastActionJson(null);
    const body: Record<string, unknown> = {
      title: createTitle,
      description: createDescription || undefined,
      postcode_area: createPostcode || undefined,
      pay_type: createPayType,
      is_urgent: createUrgent,
      duration_days: createDuration === '' ? undefined : Number(createDuration),
      specialisation_ids: parseIdList(createSpecIds),
      tag_ids: parseIdList(createTagIds),
    };
    if (createPayType === 'DAY_RATE') {
      if (createDayMin !== '') body.day_rate_min = Number(createDayMin);
      if (createDayMax !== '') body.day_rate_max = Number(createDayMax);
    } else {
      if (createFixed !== '') body.fixed_price = Number(createFixed);
    }
    if ((body.specialisation_ids as number[]).length === 0) delete body.specialisation_ids;
    if ((body.tag_ids as number[]).length === 0) delete body.tag_ids;

    try {
      const out = await api('/job-posts', { method: 'POST', body: JSON.stringify(body) });
      setLastActionJson(out);
      setCreateOpen(false);
      await loadJobs();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function applyToJob(jobId: string | number) {
    const key = String(jobId);
    setActionError('');
    setLastActionJson(null);
    try {
      const out = await api(`/job-applications/jobs/${key}/apply`, {
        method: 'POST',
        body: JSON.stringify({
          cover_message: applyCoverByJob[key]?.trim() || undefined,
        }),
      });
      setLastActionJson(out);
      await loadJobs();
      if (selectedId === key) void openDetail(key);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  const coverKey = selectedId ?? '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Job board</h1>
          <p className="text-sm text-fg-muted">
            Browse open jobs from verified employers.
          </p>
        </div>
        {loggedIn ? (
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
                  Employers only. Workers applying should return to the board.
                </SheetDescription>
              </SheetHeader>
              <form onSubmit={handleCreate} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="create-title">Title *</Label>
                  <Input
                    id="create-title"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-description">Description</Label>
                  <Textarea
                    id="create-description"
                    rows={3}
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pay type</Label>
                  <Select
                    value={createPayType}
                    onValueChange={(v) => setCreatePayType(v as 'DAY_RATE' | 'FIXED_PRICE')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DAY_RATE">Day rate</SelectItem>
                      <SelectItem value="FIXED_PRICE">Fixed price</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {createPayType === 'DAY_RATE' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="create-day-min">Day rate min</Label>
                      <Input
                        id="create-day-min"
                        type="number"
                        step="any"
                        value={createDayMin}
                        onChange={(e) => setCreateDayMin(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-day-max">Day rate max</Label>
                      <Input
                        id="create-day-max"
                        type="number"
                        step="any"
                        value={createDayMax}
                        onChange={(e) => setCreateDayMax(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="create-fixed">Fixed price</Label>
                    <Input
                      id="create-fixed"
                      type="number"
                      step="any"
                      value={createFixed}
                      onChange={(e) => setCreateFixed(e.target.value)}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="create-postcode">Postcode area</Label>
                    <Input
                      id="create-postcode"
                      value={createPostcode}
                      onChange={(e) => setCreatePostcode(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-duration">Duration (days)</Label>
                    <Input
                      id="create-duration"
                      type="number"
                      value={createDuration}
                      onChange={(e) => setCreateDuration(e.target.value)}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={createUrgent}
                    onChange={(e) => setCreateUrgent(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Mark as urgent
                </label>
                <div className="space-y-2">
                  <Label htmlFor="create-spec-ids">Specialisation IDs (comma-separated)</Label>
                  <Input
                    id="create-spec-ids"
                    value={createSpecIds}
                    onChange={(e) => setCreateSpecIds(e.target.value)}
                    placeholder="1, 2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-tag-ids">Tag IDs (comma-separated)</Label>
                  <Input
                    id="create-tag-ids"
                    value={createTagIds}
                    onChange={(e) => setCreateTagIds(e.target.value)}
                    placeholder="1, 2"
                  />
                </div>
                {actionError ? (
                  <div
                    role="alert"
                    className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
                  >
                    {actionError}
                  </div>
                ) : null}
                <SheetFooter>
                  <Button type="submit">Create job post</Button>
                </SheetFooter>
              </form>
              {lastActionJson ? (
                <div className="mt-4">
                  <p className="text-xs font-medium text-fg-muted mb-1">Last response</p>
                  <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
                    {JSON.stringify(lastActionJson, null, 2)}
                  </pre>
                </div>
              ) : null}
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

      {listError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {listError}
        </div>
      ) : null}
      {actionError && !createOpen ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {actionError}
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
                onSelect={() => void openDetail(j.id)}
                selected={selectedId === String(j.id)}
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.title ?? 'Job details'}</DialogTitle>
            <DialogDescription>
              {selectedId ? `Job ID: ${selectedId}` : null}
            </DialogDescription>
          </DialogHeader>
          {detailError ? (
            <div
              role="alert"
              className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              {detailError}
            </div>
          ) : null}
          {detail ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {detail.is_urgent ? <Badge variant="danger">Urgent</Badge> : null}
                {detail.status ? <Badge variant="outline">{detail.status}</Badge> : null}
                {detail._count?.applications != null ? (
                  <Badge variant="secondary">
                    {detail._count.applications} applications
                  </Badge>
                ) : null}
              </div>
              {detail.description ? (
                <p className="whitespace-pre-wrap text-sm text-fg">{detail.description}</p>
              ) : null}
              <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
                {JSON.stringify(detail, null, 2)}
              </pre>

              {loggedIn && selectedId ? (
                <div className="space-y-2 border-t border-border-default pt-4">
                  <Label htmlFor={`cover-${coverKey}`}>Cover message (optional)</Label>
                  <Textarea
                    id={`cover-${coverKey}`}
                    rows={3}
                    placeholder="Tell the employer why you're a fit."
                    value={applyCoverByJob[coverKey] ?? ''}
                    onChange={(e) =>
                      setApplyCoverByJob((p) => ({ ...p, [coverKey]: e.target.value }))
                    }
                  />
                  <DialogFooter>
                    <Button type="button" onClick={() => void applyToJob(selectedId)}>
                      Apply (worker only)
                    </Button>
                  </DialogFooter>
                </div>
              ) : !loggedIn ? (
                <p className="text-sm text-fg-muted">
                  <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
                    Sign in
                  </Link>{' '}
                  to apply.
                </p>
              ) : null}
            </div>
          ) : !detailError ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : null}
        </DialogContent>
      </Dialog>

      {lastActionJson && !createOpen ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-fg-muted">Last action response</h3>
          <pre className="rounded-md bg-subtle text-fg p-3 text-xs overflow-auto">
            {JSON.stringify(lastActionJson, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
