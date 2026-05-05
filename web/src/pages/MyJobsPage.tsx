import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Briefcase,
  MoreHorizontal,
  Plus,
  Users,
} from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge';
import { JobPostForm } from '@/components/jobs/JobPostForm';
import { ConfirmDialog } from '@/components/jobs/ConfirmDialog';
import { formatRelative } from '@/lib/relative-time';

type JobPostRow = {
  id: string | number;
  title: string;
  status: string;
  is_urgent: boolean;
  created_at: string;
  _count?: { applications?: number };
};

type JobListResponse = {
  items: JobPostRow[];
  total: number;
  page: number;
  limit: number;
};

type StatusTab = 'ALL' | 'OPEN' | 'CLOSED' | 'FILLED' | 'CANCELLED';
const TAB_ORDER: StatusTab[] = ['ALL', 'OPEN', 'CLOSED', 'FILLED', 'CANCELLED'];
const TAB_LABEL: Record<StatusTab, string> = {
  ALL: 'All',
  OPEN: 'Open',
  CLOSED: 'Closed',
  FILLED: 'Filled',
  CANCELLED: 'Cancelled',
};

export default function MyJobsPage() {
  const navigate = useNavigate();
  const { isEmployer, loading: accountLoading } = useAccountMe();

  const [data, setData] = useState<JobListResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StatusTab>('ALL');
  const [createOpen, setCreateOpen] = useState(false);

  const [confirm, setConfirm] = useState<
    | null
    | {
        kind: 'close' | 'reopen' | 'delete';
        post: JobPostRow;
      }
  >(null);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api<JobListResponse>('/job-posts/me?page=1&limit=100');
      setData(res);
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Could not load your jobs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accountLoading && isEmployer) void load();
  }, [accountLoading, isEmployer, load]);

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = {
      ALL: 0,
      OPEN: 0,
      CLOSED: 0,
      FILLED: 0,
      CANCELLED: 0,
    };
    for (const row of data?.items ?? []) {
      c.ALL += 1;
      const k = row.status?.toUpperCase() as StatusTab | undefined;
      if (k && k in c) c[k] += 1;
    }
    return c;
  }, [data]);

  const visibleRows = useMemo(() => {
    const rows = data?.items ?? [];
    if (tab === 'ALL') return rows;
    return rows.filter((r) => (r.status ?? '').toUpperCase() === tab);
  }, [data, tab]);

  if (!accountLoading && !isEmployer) {
    return <Navigate to="/profile" replace />;
  }

  async function patchStatus(post: JobPostRow, status: string) {
    try {
      await api(`/job-posts/${post.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast.success(`Job ${status.toLowerCase()}`);
      await load();
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? 'Could not update job.');
    }
  }

  async function deletePost(post: JobPostRow) {
    try {
      await api(`/job-posts/${post.id}`, { method: 'DELETE' });
      toast.success('Job deleted');
      await load();
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? 'Could not delete job.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">My jobs</h1>
          <p className="text-sm text-fg-muted">
            Manage every job you've posted.
          </p>
        </div>
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
                Tell verified workers what you need.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <JobPostForm
                mode="create"
                onSuccess={(created) => {
                  toast.success('Job posted');
                  setCreateOpen(false);
                  if (created?.id != null) navigate(`/my-jobs/${created.id}/applicants`);
                  else void load();
                }}
                onCancel={() => setCreateOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-subtle p-1 sm:w-auto">
          {TAB_ORDER.map((t) => (
            <TabsTrigger key={t} value={t} className="gap-2">
              {TAB_LABEL[t]}
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {counts[t]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : visibleRows.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="You haven't posted any jobs yet"
          description="Post your first job to start receiving applications from verified workers."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Post a job
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {visibleRows.map((post) => (
            <JobRow
              key={String(post.id)}
              post={post}
              onAction={(kind) => setConfirm({ kind, post })}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirm?.kind === 'close'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Close this job?"
        description="Workers won't be able to apply once it's closed. You can reopen it any time."
        confirmLabel="Close job"
        onConfirm={async () => {
          if (confirm?.post) await patchStatus(confirm.post, 'CLOSED');
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'reopen'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Reopen this job?"
        description="The job will appear on the public board again."
        confirmLabel="Reopen"
        onConfirm={async () => {
          if (confirm?.post) await patchStatus(confirm.post, 'OPEN');
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this job?"
        description="This permanently removes the post. Close it instead if you want to keep your record."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirm?.post) await deletePost(confirm.post);
          setConfirm(null);
        }}
      />
    </div>
  );
}

function JobRow({
  post,
  onAction,
}: {
  post: JobPostRow;
  onAction: (kind: 'close' | 'reopen' | 'delete') => void;
}) {
  const applicationCount = post._count?.applications ?? 0;
  const status = (post.status ?? '').toUpperCase();
  const canReopen = status === 'CLOSED';
  const canClose = status === 'OPEN';
  const canDelete = applicationCount === 0;

  return (
    <li>
      <Card className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <CardHeader className="min-w-0 flex-1 space-y-2 p-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base font-semibold">
              <Link
                to={`/jobs/${post.id}`}
                className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {post.title}
              </Link>
            </CardTitle>
            <JobStatusBadge status={post.status} />
            {post.is_urgent ? (
              <Badge variant="danger" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Urgent
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
            <Link
              to={`/my-jobs/${post.id}/applicants`}
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              <Users className="h-3 w-3" />
              {applicationCount} application{applicationCount === 1 ? '' : 's'}
            </Link>
            <span>Posted {formatRelative(post.created_at)}</span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-shrink-0 items-center gap-2 p-0">
          <Button asChild variant="outline" size="sm">
            <Link to={`/my-jobs/${post.id}/applicants`}>View applicants</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${post.title}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={`/my-jobs/${post.id}/edit`}>Edit</Link>
              </DropdownMenuItem>
              {canClose ? (
                <DropdownMenuItem onSelect={() => onAction('close')}>
                  Close
                </DropdownMenuItem>
              ) : null}
              {canReopen ? (
                <DropdownMenuItem onSelect={() => onAction('reopen')}>
                  Reopen
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!canDelete}
                onSelect={() => canDelete && onAction('delete')}
                className={!canDelete ? 'opacity-50' : 'text-danger'}
                title={
                  !canDelete
                    ? 'Close the job instead — applicants would lose their record.'
                    : undefined
                }
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>
    </li>
  );
}
