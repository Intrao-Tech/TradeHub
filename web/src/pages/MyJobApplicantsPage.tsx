import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Inbox, UserPlus } from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/EmptyState';
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge';
import {
  ApplicantCard,
  type ApplicantApplication,
} from '@/components/jobs/ApplicantCard';
import { InviteWorkerSheet } from '@/components/jobs/InviteWorkerSheet';
import { toast } from '@/components/ui/toast';

type JobPostDetail = {
  id: string | number;
  title: string;
  status: string;
  is_urgent: boolean;
  employer_id: string | number;
  _count?: { applications?: number };
};

type ApplicationsResponse = {
  items: ApplicantApplication[];
  total: number;
};

type AppStatusTab =
  | 'ALL'
  | 'PENDING'
  | 'REVIEWED'
  | 'SHORTLISTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN';

const TAB_ORDER: AppStatusTab[] = [
  'ALL',
  'PENDING',
  'REVIEWED',
  'SHORTLISTED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
];

const TAB_LABEL: Record<AppStatusTab, string> = {
  ALL: 'All',
  PENDING: 'Pending',
  REVIEWED: 'Reviewed',
  SHORTLISTED: 'Shortlisted',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export default function MyJobApplicantsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isEmployer, loading: accountLoading } = useAccountMe();

  const [post, setPost] = useState<JobPostDetail | null>(null);
  const [postError, setPostError] = useState('');
  const [apps, setApps] = useState<ApplicantApplication[]>([]);
  const [appsError, setAppsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AppStatusTab>('PENDING');
  const [inviteOpen, setInviteOpen] = useState(false);

  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [optimisticStatus, setOptimisticStatus] = useState<
    Record<string, string>
  >({});

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setPostError('');
    setAppsError('');
    try {
      const [postRes, appsRes] = await Promise.all([
        api<JobPostDetail>(`/job-posts/${id}`),
        api<ApplicationsResponse>(
          `/job-applications/jobs/${id}?page=1&limit=100`,
        ),
      ]);
      setPost(postRes);
      setApps(appsRes.items ?? []);
    } catch (err) {
      const parsed = parseApiError(err);
      const message = parsed?.message ?? 'Could not load applicants.';
      if (parsed?.status === 403) setAppsError(message);
      else setPostError(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!accountLoading && isEmployer) void load();
  }, [accountLoading, isEmployer, load]);

  const counts = useMemo(() => {
    const c: Record<AppStatusTab, number> = {
      ALL: 0,
      PENDING: 0,
      REVIEWED: 0,
      SHORTLISTED: 0,
      ACCEPTED: 0,
      REJECTED: 0,
      WITHDRAWN: 0,
    };
    for (const row of apps) {
      const status = (
        optimisticStatus[String(row.id)] ?? row.status
      ).toUpperCase() as AppStatusTab;
      c.ALL += 1;
      if (status in c) c[status] += 1;
    }
    return c;
  }, [apps, optimisticStatus]);

  const visible = useMemo(() => {
    if (tab === 'ALL') return apps;
    return apps.filter((a) => {
      const status = (
        optimisticStatus[String(a.id)] ?? a.status
      ).toUpperCase();
      return status === tab;
    });
  }, [apps, tab, optimisticStatus]);

  if (!accountLoading && !isEmployer) {
    return <Navigate to="/profile" replace />;
  }

  async function transition(
    application: ApplicantApplication,
    nextStatus: 'REVIEWED' | 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED',
  ) {
    const sid = String(application.id);
    const previous = application.status;
    setPendingIds((p) => new Set(p).add(sid));
    setOptimisticStatus((s) => ({ ...s, [sid]: nextStatus }));
    try {
      await api(`/job-applications/${application.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      toast.success(`Marked ${nextStatus.toLowerCase()}`);
      await load();
    } catch (err) {
      setOptimisticStatus((s) => ({ ...s, [sid]: previous }));
      toast.error(parseApiError(err)?.message ?? 'Action failed.');
    } finally {
      setPendingIds((p) => {
        const next = new Set(p);
        next.delete(sid);
        return next;
      });
    }
  }

  async function convert(application: ApplicantApplication) {
    const sid = String(application.id);
    setPendingIds((p) => new Set(p).add(sid));
    try {
      const collab = await api<{ id: string | number }>(
        `/job-applications/${application.id}/to-collaboration`,
        { method: 'POST' },
      );
      toast.success('Collaboration created');
      if (collab?.id != null) navigate(`/collaborations`);
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? 'Could not convert.');
    } finally {
      setPendingIds((p) => {
        const next = new Set(p);
        next.delete(sid);
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/my-jobs">
            <ArrowLeft />
            Back to my jobs
          </Link>
        </Button>
      </div>

      {postError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {postError}
        </div>
      ) : null}

      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : post ? (
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <JobStatusBadge status={post.status} />
            {post.is_urgent ? (
              <Badge variant="danger" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Urgent
              </Badge>
            ) : null}
            <Badge variant="secondary">
              {post._count?.applications ?? apps.length} application
              {(post._count?.applications ?? apps.length) === 1 ? '' : 's'}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            <Link
              to={`/jobs/${post.id}`}
              className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {post.title}
            </Link>
          </h1>
        </header>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as AppStatusTab)}>
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
        <Button onClick={() => setInviteOpen(true)} variant="outline">
          <UserPlus />
          Invite worker
        </Button>
      </div>

      {appsError ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {appsError}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No applicants in this view"
          description={
            tab === 'ALL'
              ? "When workers apply or you invite them, they'll appear here."
              : 'Try a different tab to see applicants in another status.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((application) => {
            const sid = String(application.id);
            const optimistic = optimisticStatus[sid];
            const enriched = optimistic
              ? { ...application, status: optimistic }
              : application;
            return (
              <ApplicantCard
                key={sid}
                application={enriched}
                pending={pendingIds.has(sid)}
                onTransition={(next) => void transition(application, next)}
                onConvert={() => void convert(application)}
              />
            );
          })}
        </ul>
      )}

      {id ? (
        <InviteWorkerSheet
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          jobPostId={id}
          onInvited={() => void load()}
        />
      ) : null}
    </div>
  );
}
