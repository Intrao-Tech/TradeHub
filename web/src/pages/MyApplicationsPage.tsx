import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, Inbox, MapPin } from 'lucide-react';
import { api, parseApiError } from '../api';
import { useAccountMe } from '@/hooks/useAccountMe';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/EmptyState';
import { JobStatusBadge } from '@/components/jobs/JobStatusBadge';
import { ApplicationStatusBadge } from '@/components/jobs/ApplicationStatusBadge';
import { AttachmentList } from '@/components/jobs/AttachmentList';
import { EmployerChip } from '@/components/jobs/EmployerChip';
import { formatPay } from '@/components/jobs/PayLine';
import { ConfirmDialog } from '@/components/jobs/ConfirmDialog';
import { toast } from '@/components/ui/toast';
import { formatRelative } from '@/lib/relative-time';

type WorkerApplication = {
  id: string | number;
  status: string;
  initiated_by: string;
  proposed_rate?: string | number | null;
  cover_message?: string | null;
  created_at?: string;
  job_post?: {
    id?: string | number;
    title?: string;
    status?: string;
    pay_type?: string;
    day_rate_min?: string | number | null;
    day_rate_max?: string | number | null;
    fixed_price?: string | number | null;
    postcode_area?: string | null;
    is_urgent?: boolean;
    employer?: {
      id?: string | number;
      company_name?: string | null;
      client_profile?: {
        display_name?: string | null;
        verification_level?: string | null;
      } | null;
    } | null;
  } | null;
  attachments?: Array<{
    id: string | number;
    original_name: string;
    mime_type: string;
    size_bytes: number;
  }>;
};

type ApplicationsResponse = {
  items: WorkerApplication[];
  total: number;
};

type StatusTab =
  | 'ALL'
  | 'PENDING'
  | 'REVIEWED'
  | 'SHORTLISTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN';

const TAB_ORDER: StatusTab[] = [
  'ALL',
  'PENDING',
  'REVIEWED',
  'SHORTLISTED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
];

const TAB_LABEL: Record<StatusTab, string> = {
  ALL: 'All',
  PENDING: 'Pending',
  REVIEWED: 'Reviewed',
  SHORTLISTED: 'Shortlisted',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

const WITHDRAWABLE = new Set(['PENDING', 'REVIEWED', 'SHORTLISTED']);

export default function MyApplicationsPage() {
  const navigate = useNavigate();
  const { isWorker, loading: accountLoading } = useAccountMe();

  const [data, setData] = useState<WorkerApplication[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StatusTab>('ALL');
  const [withdrawTarget, setWithdrawTarget] = useState<WorkerApplication | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<ApplicationsResponse>(
        '/job-applications/me?page=1&limit=100',
      );
      setData(res.items ?? []);
    } catch (err) {
      setError(parseApiError(err)?.message ?? 'Could not load your applications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!accountLoading) void load();
  }, [accountLoading, load]);

  const counts = useMemo(() => {
    const c: Record<StatusTab, number> = {
      ALL: 0,
      PENDING: 0,
      REVIEWED: 0,
      SHORTLISTED: 0,
      ACCEPTED: 0,
      REJECTED: 0,
      WITHDRAWN: 0,
    };
    for (const row of data) {
      c.ALL += 1;
      const k = (row.status ?? '').toUpperCase() as StatusTab;
      if (k in c) c[k] += 1;
    }
    return c;
  }, [data]);

  const visible = useMemo(() => {
    if (tab === 'ALL') return data;
    return data.filter((d) => (d.status ?? '').toUpperCase() === tab);
  }, [data, tab]);

  const invitations = useMemo(
    () => data.filter((d) => d.initiated_by === 'EMPLOYER' && d.status === 'PENDING'),
    [data],
  );

  async function withdraw(application: WorkerApplication) {
    try {
      await api(`/job-applications/${application.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'WITHDRAWN' }),
      });
      toast.success('Application withdrawn');
      await load();
    } catch (err) {
      toast.error(parseApiError(err)?.message ?? 'Could not withdraw application.');
    }
  }

  if (!accountLoading && !isWorker) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">My applications</h1>
        <EmptyState
          icon={Inbox}
          title="No applications"
          description="Only worker accounts can apply to jobs."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">My applications</h1>
        <p className="text-sm text-fg-muted">
          Track every application you've sent and every invitation you've received.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      {invitations.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-fg">Invitations</h2>
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <ApplicationRow
                key={`inv-${String(inv.id)}`}
                application={inv}
                isInvitation
                onWithdraw={() => setWithdrawTarget(inv)}
              />
            ))}
          </ul>
        </section>
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
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No applications yet"
          description="Browse jobs to find one to apply to."
          action={
            <Button onClick={() => navigate('/jobs')}>Browse jobs</Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <ApplicationRow
              key={String(row.id)}
              application={row}
              onWithdraw={() => setWithdrawTarget(row)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={withdrawTarget != null}
        onOpenChange={(o) => !o && setWithdrawTarget(null)}
        title="Withdraw this application?"
        description="Withdrawing is permanent for this job — you won't be able to apply again unless the employer reopens the post."
        confirmLabel="Withdraw"
        destructive
        onConfirm={async () => {
          if (withdrawTarget) await withdraw(withdrawTarget);
          setWithdrawTarget(null);
        }}
      />
    </div>
  );
}

function ApplicationRow({
  application,
  isInvitation = false,
  onWithdraw,
}: {
  application: WorkerApplication;
  isInvitation?: boolean;
  onWithdraw: () => void;
}) {
  const post = application.job_post ?? null;
  const status = (application.status ?? '').toUpperCase();
  const canWithdraw = WITHDRAWABLE.has(status);

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border-default bg-raised p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {post?.id != null && post.title ? (
            <Link
              to={`/jobs/${post.id}`}
              className="font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {post.title}
            </Link>
          ) : (
            <span className="font-medium text-fg">{post?.title ?? 'Untitled job'}</span>
          )}
          <ApplicationStatusBadge status={application.status} />
          <JobStatusBadge status={post?.status} />
          {isInvitation ? <Badge variant="info">Invitation</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
          <EmployerChip employer={post?.employer ?? null} showBadge={false} />
          {post?.postcode_area ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {post.postcode_area}
            </span>
          ) : null}
          {post ? <span>{formatPay(post)}</span> : null}
          {application.created_at ? (
            <span>Applied {formatRelative(application.created_at)}</span>
          ) : null}
          {application.proposed_rate != null ? (
            <span>Proposed: £{String(application.proposed_rate)}</span>
          ) : null}
        </div>
        <AttachmentList
          heading="Your attachments"
          attachments={application.attachments}
          previewImages
        />
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
        {isInvitation && post?.id != null ? (
          <Button asChild size="sm">
            <Link to={`/jobs/${post.id}`}>View job</Link>
          </Button>
        ) : null}
        {canWithdraw ? (
          <Button type="button" size="sm" variant="outline" onClick={onWithdraw}>
            Withdraw
          </Button>
        ) : null}
      </div>
    </li>
  );
}
