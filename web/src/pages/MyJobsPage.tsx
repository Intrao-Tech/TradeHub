import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Briefcase,
  MoreHorizontal,
  Plus,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

export default function MyJobsPage() {
  const { t } = useTranslation('jobs');
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
      setError(parseApiError(err)?.message ?? t('myJobs.loadError'));
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
      toast.success(t(status === 'CLOSED' ? 'myJobs.toastClosed' : 'myJobs.toastReopened'));
      await load();
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? t('myJobs.updateError'));
    }
  }

  async function deletePost(post: JobPostRow) {
    try {
      await api(`/job-posts/${post.id}`, { method: 'DELETE' });
      toast.success(t('myJobs.deletedToast'));
      await load();
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? t('myJobs.deleteError'));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{t('myJobs.title')}</h1>
          <p className="text-sm text-fg-muted">{t('myJobs.subtitle')}</p>
        </div>
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
              <SheetDescription>{t('myJobs.postJobDesc')}</SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <JobPostForm
                mode="create"
                onSuccess={(created) => {
                  toast.success(t('board.jobPosted'));
                  setCreateOpen(false);
                  if (created?.id != null) navigate(`/jobs/${created.id}`);
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
          {TAB_ORDER.map((st) => (
            <TabsTrigger key={st} value={st} className="gap-2">
              {t(`myJobs.tab.${st}`)}
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {counts[st]}
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
          title={t('myJobs.emptyTitle')}
          description={t('myJobs.emptyDesc')}
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              {t('board.postJob')}
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
        title={t('myJobs.closeTitle')}
        description={t('myJobs.closeDesc')}
        confirmLabel={t('myJobs.closeConfirm')}
        onConfirm={async () => {
          if (confirm?.post) await patchStatus(confirm.post, 'CLOSED');
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'reopen'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('myJobs.reopenTitle')}
        description={t('myJobs.reopenDesc')}
        confirmLabel={t('myJobs.reopenConfirm')}
        onConfirm={async () => {
          if (confirm?.post) await patchStatus(confirm.post, 'OPEN');
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('myJobs.deleteTitle')}
        description={t('myJobs.deleteDesc')}
        confirmLabel={t('myJobs.deleteConfirm')}
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
  const { t } = useTranslation('jobs');
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
            <CardTitle className="break-words text-base font-semibold">
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
                {t('card.urgent')}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
            <Link
              to={`/my-jobs/${post.id}/applicants`}
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              <Users className="h-3 w-3" />
              {t('myJobs.applications', { count: applicationCount })}
            </Link>
            <span>{t('card.posted', { time: formatRelative(post.created_at) })}</span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-shrink-0 items-center gap-2 p-0">
          <Button asChild variant="outline" size="sm">
            <Link to={`/my-jobs/${post.id}/applicants`}>{t('myJobs.viewApplicants')}</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('myJobs.actionsAria', { title: post.title })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={`/my-jobs/${post.id}/edit`}>{t('myJobs.edit')}</Link>
              </DropdownMenuItem>
              {canClose ? (
                <DropdownMenuItem onSelect={() => onAction('close')}>
                  {t('myJobs.close')}
                </DropdownMenuItem>
              ) : null}
              {canReopen ? (
                <DropdownMenuItem onSelect={() => onAction('reopen')}>
                  {t('myJobs.reopen')}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!canDelete}
                onSelect={() => canDelete && onAction('delete')}
                className={!canDelete ? 'opacity-50' : 'text-danger'}
                title={!canDelete ? t('myJobs.cantDeleteTooltip') : undefined}
              >
                {t('myJobs.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>
    </li>
  );
}
